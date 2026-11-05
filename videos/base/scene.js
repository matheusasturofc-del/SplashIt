/* Animação 3D do vídeo "Xadrez" (Three.js).
 * Tudo é função do tempo t: draw(t) atualiza o mundo 3D, renderiza e
 * desenha por cima a camada 2D (legenda, etiquetas, balões).
 * Os tempos vêm de build/timeline.json, então a animação segue a narração.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const W = 1080, H = 1920;
const out = document.getElementById('c');
const ctx = out.getContext('2d', { willReadFrequently: true });

// ================================================================ matemática
const cl = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, p) => a + (b - a) * p;
const P = (t, a, d) => (d <= 0 ? (t >= a ? 1 : 0) : cl((t - a) / d));
const EZ = {
  lin: p => p,
  io: p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  o: p => 1 - Math.pow(1 - p, 3),
  i: p => p * p * p,
  i2: p => p * p,
  back: p => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
};
const rnd = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function kf(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const k1 = keys[i];
    if (t < k1[0]) {
      const k0 = keys[i - 1];
      const p = EZ[k1[2] || 'io'](cl((t - k0[0]) / ((k1[0] - k0[0]) || 1e-6)));
      const a = k0[1], b = k1[1];
      return Array.isArray(a) ? a.map((x, j) => lerp(x, b[j], p)) : lerp(a, b, p);
    }
  }
  return keys[keys.length - 1][1];
}
const sortK = k => k.sort((a, b) => a[0] - b[0]);
function st(p, i, n, span = 0.45) { if (n <= 1) return p; return cl((p - i * (1 - span) / (n - 1)) / span); }


// ================================================================ medidas do mundo (casa em corte, como maquete)
const ERAS = [];
const HS = 0.8;                         // escala do bonequinho dentro da cena
const FEET = 1.68 * HS;                 // altura do centro do bonequinho acima do chão
const BASE_FLOOR = -7.25;               // piso da base secreta
const BED0 = 2.5, BED_OPEN = -1.65;      // centro da cama (x) fechada e aberta

// ================================================================ linha do tempo
let TL = null;
const LN = {}, C = {};
const SFX = [], CAPS = [], LABELS = [], REACT = [], CHIPS = [], ARROWS = [];
const S = id => LN[id].start, E = id => LN[id].end;
const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
const fuzzy = (tok, target) => tok === target || (target.length >= 4 && tok.startsWith(target.slice(0, 4)));
// momento em que a palavra w é dita na fala id (usa os tempos reais do Whisper quando existem)
function wT(id, w) {
  const l = LN[id]; const tx = l.text.toLowerCase(); const i = tx.indexOf(w.toLowerCase());
  if (i < 0) throw new Error(`palavra "${w}" não está na fala ${id}`);
  const prop = l.start + (i / tx.length) * (l.end - l.start);
  if (!l.words || !l.words.length) return prop;
  const target = norm(w)[0];
  const k = norm(l.text.slice(0, i)).filter(t => fuzzy(t, target)).length;
  const hits = l.words.filter(x => { const n = norm(x.w)[0]; return n && fuzzy(n, target); });
  return hits[k] ? hits[k].s : prop;
}
const sfx = (t, name, gain = 1, d = 0) => SFX.push({ t: +t.toFixed(3), name, gain, d: +Math.max(0, d).toFixed(3) });
function nextBeatStart(id) {
  const l = LN[id]; const n = TL.lines.find(x => x.beatIndex === l.beatIndex + 1);
  return n ? n.start : TL.duration;
}
function asmSfx(t0, dur, n, name, gain, span = 0.45) {
  for (let i = 0; i < n; i++) {
    const a = n <= 1 ? 0 : i * (1 - span) / (n - 1);
    sfx(t0 + dur * (a + (n <= 1 ? 1 : span) * 0.5), name, gain);
  }
}


function computeCues() {
  C.REW = [];
  const RW = (a, to, from) => { const r = { a, b: a + 1.0, to, from: from ?? a }; C.REW.push(r); return r; };
  // gancho: empurrando a cama
  C.slip = Math.max(2.6, wT('h2', 'vez') + 0.1);
  C.rwH = RW(E('h2') + 0.15, 0.3);
  // trilho motorizado e botão
  C.rails = wT('v1', 'trilhos') - 0.3; C.motor = wT('v1', 'motorzinho') - 0.2; C.btn = wT('v1', 'abre') - 0.3;
  C.open1 = wT('v1', 'botão') + 0.35; C.close1 = S('v2') - 0.5;
  C.visit = S('v2') + 0.05; C.press2 = wT('v2', 'aperta') - 0.1; C.found = wT('v2', 'descobre') - 0.1;
  C.rwV = RW(E('v2') + 0.15, S('v2') - 0.05);
  // troféu
  C.btnHide = S('b1') + 0.15; C.trophy = wT('b1', 'troféu') - 0.2; C.twist = wT('b1', 'girou') - 0.1; C.open3 = wT('b1', 'anda') - 0.25;
  // cavar
  C.lid = S('c1') + 0.1; C.dig0 = S('c1') + 0.6; C.collapse = wT('c1', 'desmoronam') - 0.1; C.dig1 = C.collapse + 0.2;
  C.rwC = RW(E('c1') + 0.15, S('c1') - 0.05);
  C.conc0 = wT('c2', 'paredes') - 0.3; C.conc1 = wT('c2', 'bunker'); C.ladder = E('c2') - 0.7;
  // água
  C.rain = S('w1'); C.leak = wT('w1', 'atravessa') - 0.1; C.pool = wT('w1', 'piscina') + 0.5;
  C.rwW = RW(E('w1') + 0.15, S('w1') - 0.05);
  C.memb = wT('w2', 'manta') - 0.3; C.pump = wT('w2', 'bomba') - 0.2;
  // ar
  C.stuffy = S('a1') + 0.2; C.rwA = RW(E('a1') + 0.15, S('a1') - 0.05);
  C.pipe = wT('a2', 'cano') - 0.3; C.gnome = wT('a2', 'anão') - 0.3;
  // descer
  C.dark0 = S('s1'); C.climb = S('s1') + 0.15; C.fallS = wT('s1', 'escorregar') - 0.25;
  C.rwS = RW(E('s1') + 0.15, S('s1') - 0.05);
  C.slide = wT('s2', 'escorregador') - 0.35; C.ride = wT('s2', 'desce') - 0.25;
  // decoração
  C.sofa = wT('d1', 'sofá') - 0.2; C.tv = wT('d1', 'tv') - 0.2; C.game = wT('d1', 'videogame') - 0.2; C.neon = wT('d1', 'neon') - 0.2; C.fridge = wT('d1', 'frigobar') - 0.2;
  // final
  C.hostWorld = 0; C.stamp = S('o1') + 0.25; C.cta = S('o2') - 0.1;
  C.eraKeys = [[0, 0]];

  // ---------- câmera [alvo x, y, z, distância, azimute, elevação, fov]
  const CK = [];
  CK.push([0, [5.6, 2.3, -4.0, 7.5, 0.12, 0.1, 40]], [0.6, [5.2, 2.0, -4.0, 11, 0.15, 0.12, 40], 'o'], [C.slip, [4.6, 1.8, -4.0, 14, 0.18, 0.14, 40]], [C.rwH.b, [4.0, 2.0, -3.6, 15, 0.2, 0.14, 40]]);
  CK.push([C.rails + 0.4, [3.0, 1.6, -3.4, 18, 0.28, 0.32, 40]], [C.btn, [4.0, 2.4, -3.6, 17, 0.25, 0.12, 40]], [C.open1 + 0.8, [2.5, 2.0, -3.4, 18, 0.3, 0.2, 40]]);
  CK.push([C.visit + 0.4, [4.5, 2.6, -2.2, 19, 0.4, 0.12, 40]], [C.rwV.b, [4.5, 2.6, -2.2, 19, 0.4, 0.12, 40]]);
  CK.push([C.btnHide + 0.5, [-3.0, 3.0, -3.6, 20, 0.15, 0.12, 40]], [C.twist + 0.2, [-4.5, 3.2, -4.0, 13, 0.25, 0.1, 40]], [E('b1'), [-0.5, 2.4, -3.6, 20, 0.2, 0.14, 40]]);
  CK.push([C.lid + 0.5, [1.0, -2.5, -0.5, 26, 0.25, 0.12, 40]], [C.collapse, [0.5, -4.2, 0, 22, 0.2, 0.08, 40]], [C.rwC.b, [0.5, -4.2, 0, 22, 0.2, 0.08, 40]]);
  CK.push([C.conc0 + 0.6, [0, -4.2, 0, 28, 0.32, 0.1, 40]], [E('c2'), [0, -4.2, 0, 27, 0.2, 0.08, 40]]);
  CK.push([C.leak + 0.3, [0, -4.4, 0, 26, 0.18, 0.08, 40]], [C.rwW.b, [0, -4.4, 0, 26, 0.2, 0.08, 40]]);
  CK.push([C.memb + 0.5, [0, -4.2, 0, 30, 0.42, 0.1, 40]], [E('w2'), [0, -4.2, 0, 29, 0.25, 0.08, 40]]);
  CK.push([C.stuffy + 0.4, [-0.5, -5.4, 0.5, 15, 0.18, 0.05, 40]], [C.rwA.b, [-0.5, -5.4, 0.5, 15, 0.2, 0.05, 40]]);
  CK.push([C.pipe + 0.6, [6.0, -1.2, 2.0, 30, 0.3, 0.12, 40]], [C.gnome + 0.4, [11.0, 1.0, 3.6, 9, 0.45, 0.16, 40]], [E('a2'), [11.0, 1.0, 3.6, 10, 0.55, 0.16, 40]]);
  CK.push([C.climb + 0.4, [2.2, -3.6, -3.0, 21, 0.3, 0.06, 40]], [C.rwS.b, [2.2, -3.6, -3.0, 21, 0.3, 0.06, 40]]);
  CK.push([C.slide + 0.5, [2.2, -4.0, -2.4, 22, 0.35, 0.08, 40]], [E('s2'), [2.0, -4.2, -2.0, 22, 0.25, 0.08, 40]]);
  CK.push([C.sofa + 0.4, [-1.5, -4.6, -1.0, 22, 0.25, 0.1, 40]], [C.fridge + 0.6, [-0.5, -4.6, -0.5, 24, 0.2, 0.08, 40]]);
  CK.push([C.stamp - 0.3, [0, -1.8, 0, 40, 0.3, 0.12, 42]], [TL.duration, [0, -1.8, 0, 41, 0.2, 0.12, 42]]);
  C.camKeys = sortK(CK);

  C.shakes = [[C.slip + 0.3, 0.25], [C.collapse + 0.3, 0.35], [C.leak, 0.15], [C.fallS + 0.7, 0.3], [C.stamp + 0.18, 0.25]];

  // ---------- reações do bonequinho (dentro da cena)
  const Rx = (t, d, e, p, b) => REACT.push({ t, d, e, p, b });
  Rx(0, C.slip, 'worried', 'push', null);
  Rx(0.9, 1.4, 'worried', 'push', 'Ufff!');
  Rx(C.slip, C.rwH.a - C.slip, 'shock', 'up', 'Ai!');
  Rx(C.btn + 0.3, C.open1 - C.btn, 'happy', 'point', null);
  Rx(C.open1 + 0.2, 1.2, 'happy', 'thumbs', null);
  Rx(C.found, C.rwV.a - C.found, 'shock', 'cheeks', 'Descobriu!');
  Rx(C.twist - 0.3, C.open3 - C.twist + 0.3, 'happy', 'point', null);
  Rx(C.open3 + 0.2, 1.2, 'happy', 'thumbs', 'Isso!');
  Rx(C.dig0, C.collapse - C.dig0, 'happy', 'down', null);
  Rx(C.collapse, C.rwC.a - C.collapse, 'shock', 'up', 'Socorro!');
  Rx(E('c2') - 1.0, 1.0, 'happy', 'thumbs', null);
  Rx(C.leak, C.rwW.a - C.leak, 'shock', 'up', 'Glub!');
  Rx(E('w2') - 1.2, 1.2, 'relieved', 'wipe', 'Ufa!');
  Rx(C.stuffy + 0.4, C.rwA.a - C.stuffy - 0.4, 'worried', 'wipe', 'Zzz...');
  Rx(E('a2') - 1.2, 1.2, 'happy', 'thumbs', null);
  Rx(C.fallS, C.rwS.a - C.fallS, 'shock', 'up', 'Ai!');
  Rx(C.ride, 2.2, 'happy', 'cheer', 'Uhuul!');
  Rx(C.fridge + 0.3, 1.2, 'happy', 'thumbs', null);
  Rx(C.stamp + 0.15, 2.4, 'happy', 'cheer', 'Uhuul!');
  Rx(C.cta, TL.duration - C.cta, 'happy', 'point', null);
  for (const r of C.REW) Rx(r.a, r.b - r.a, 'worried', 'point', 'Volta!');
  REACT.sort((a, b) => a.t - b.t);

  // ---------- etiquetas
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const Lb = (txt, t0, t1, at, off) => { LABELS.push({ txt, t0, t1, at, off }); CHIPS.push({ txt, t: t0 }); };
  Lb('TRILHO MOTORIZADO', wT('v1', 'trilho'), E('v1') + 0.3, () => V(-1.5, 0.08, -2.9), [60, -380]);
  Lb('TRAVA SECRETA', wT('b1', 'trava'), E('b1') + 0.3, () => V(-6.2, 3.6, -5.4), [120, -300]);
  Lb('ESTRUTURA', wT('c2', 'estrutura'), E('c2') + 0.3, () => V(-5.5, -4, 4), [160, -330]);
  Lb('IMPERMEABILIZAÇÃO', wT('w2', 'impermeabilização'), E('w2') + 0.3, () => V(5.92, -4.5, 4), [-140, -360]);
  Lb('VENTILAÇÃO', wT('a2', 'ventilação'), E('a2') + 0.3, () => V(11, 1.2, 3.85), [-80, -300]);
  Lb('ESCORREGADOR', wT('s2', 'escorregador') + 0.3, E('s2') + 0.3, () => V(3.6, -4.5, -2.4), [-60, -360]);

  // ---------- setas
  const Ar = (t0, t1, at, dir, len, col, kind = 'line') => ARROWS.push({ t0, t1, at, dir: new THREE.Vector3(...dir), len, col, kind });
  const RED = '#ff4d3d', BLUE = '#4d9bff', YEL = '#ffd23f', GREEN = '#2ecc71';
  Ar(0.5, C.slip, () => V(BED0 + 3.2, 1.6, -3.0), [-1, 0, 0], 1.4, RED);
  Ar(C.open1 - 0.1, C.open1 + 1.0, () => V(0, 1.8, -2.6), [-1, 0, 0], 2.0, GREEN);
  Ar(C.twist - 0.2, C.open3 + 0.5, () => V(-6.2, 4.3, -5.4), [0, 0, 0], 1, YEL, 'spin');
  Ar(C.leak - 0.1, C.pool, () => V(-2, -1.5, 3), [0, -1, 0], 1.5, BLUE);
  Ar(C.leak - 0.1, C.pool, () => V(2.5, -1.5, 3), [0, -1, 0], 1.5, BLUE);
  Ar(C.pump + 0.4, E('w2') + 0.2, () => V(4.6, -2.5, -4.2), [0, 1, 0], 2, BLUE);
  Ar(C.pipe + 0.6, E('a2') + 0.2, () => V(11, -0.7, 3.85), [-1, 0, 0], 3, GREEN);
  Ar(C.pipe + 0.6, E('a2') + 0.2, () => V(4.6, -1.6, 3.85), [0, -1, 0], 1.5, GREEN);

  // ---------- efeitos sonoros
  sfx(0.0, 'whoosh', 0.7);
  for (let k = 0; k < 7; k++) { const tb = 0.25 + k * Math.max(0.32, (C.slip - 0.6) / 7); if (tb < C.slip - 0.2) sfx(tb, 'strain', 0.35, 0.25); }
  sfx(C.slip, 'slide', 0.5, 0.3); sfx(C.slip + 0.3, 'thud', 1.0);
  sfx(C.rails, 'clank', 0.6); sfx(C.rails + 0.25, 'clank', 0.5); sfx(C.motor, 'pop', 0.5); sfx(C.btn, 'pop', 0.6);
  sfx(C.open1 - 0.15, 'click', 0.8); sfx(C.open1, 'hum', 0.5, 1.0);
  sfx(C.visit, 'pop', 0.4); sfx(C.press2, 'click', 0.8); sfx(C.press2 + 0.15, 'hum', 0.5, 1.0); sfx(C.found, 'alarm', 0.4);
  sfx(C.btnHide, 'whoosh', 0.5); sfx(C.trophy, 'ding', 0.6); sfx(C.twist, 'clac', 0.8); sfx(C.open3, 'hum', 0.5, 1.0);
  sfx(C.lid, 'creak', 0.6);
  for (let k = 0; k < 8; k++) { const tb = C.dig0 + 0.2 + k * (C.collapse - C.dig0 - 0.3) / 8; sfx(tb, 'thud', 0.35); }
  sfx(C.collapse, 'crash', 1.0); sfx(C.collapse + 0.2, 'fall', 0.6, 0.6);
  asmSfx(C.conc0, C.conc1 - C.conc0, 8, 'thud', 0.55); sfx(C.ladder, 'clank', 0.5);
  sfx(C.rain, 'hum', 0.4, C.rwW.a - C.rain); sfx(C.leak, 'slide', 0.5, C.pool - C.leak);
  asmSfx(C.memb, 1.2, 4, 'slide', 0.4); sfx(C.pump, 'powerup', 0.5); sfx(C.pump + 0.4, 'hum', 0.35, 1.5);
  sfx(C.stuffy + 0.6, 'strain', 0.3, 1.2);
  sfx(C.pipe, 'clank', 0.5); sfx(C.pipe + 0.3, 'clank', 0.4); sfx(C.gnome, 'pop', 0.8); sfx(C.gnome + 0.3, 'whoosh', 0.5);
  sfx(C.dark0, 'powerdown', 0.5); sfx(C.fallS, 'creak', 0.5); sfx(C.fallS + 0.1, 'fall', 0.6, 0.5); sfx(C.fallS + 0.7, 'thud', 1.0);
  asmSfx(C.slide, 0.8, 4, 'clank', 0.4); sfx(C.ride, 'whoosh', 0.8); sfx(C.ride + 0.5, 'zip', 0.5); sfx(C.ride + 1.9, 'pop', 0.6);
  for (const k of ['sofa', 'tv', 'game', 'neon', 'fridge']) sfx(C[k] + 0.2, 'pop', 0.65);
  sfx(C.neon + 0.3, 'powerup', 0.4);
  sfx(C.stamp + 0.18, 'stamp', 1.0); sfx(C.stamp + 0.22, 'tada', 0.8); sfx(C.cta, 'pop', 0.6);
  for (const r of C.REW) { sfx(r.a, 'freeze', 0.55); sfx(r.a + 0.08, 'rewind', 0.65, r.b - r.a - 0.1); }
  SFX.sort((a, b) => a.t - b.t);
}

// ================================================================ estado (recebe o tempo do mundo)
function worldTime(t) {
  for (const r of C.REW) if (t >= r.a && t < r.b) return lerp(r.from, r.to, EZ.io(P(t, r.a, r.b - r.a)));
  return t;
}
const inRewind = t => C.REW.find(r => t >= r.a && t < r.b);
function shakeAt(t) {
  let x = 0, y = 0;
  for (const [t0, a] of C.shakes) {
    const d = t - t0; if (d < 0 || d > 0.7) continue;
    const k = a * Math.exp(-d * 7);
    x += k * Math.sin(d * 63); y += k * Math.cos(d * 51);
  }
  return [x, y];
}
const between = (t, a, b) => t >= a && t <= b;
const dark = wt => between(wt, C.dark0, C.rwS.a) ? 2.0 * P(wt, C.dark0, 0.3) : 0;
const eraIndex = () => 0;

// ================================================================ three.js: base
const glc = document.createElement('canvas');
const Q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: Q.get('aa') !== '0', preserveDrawingBuffer: true, alpha: false });
renderer.setPixelRatio(1);
const RS = +(Q.get('rs') || 1);
const GW = Math.round(W * RS), GH = Math.round(H * RS);
renderer.setSize(GW, GH, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = Q.get('soft') === '0' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;
// reflexos de ambiente dobram o tempo de render sem GPU; só liga com ?env=1
const ENV = Q.get('env') === '1';
if (!ENV) scene.environment = null;
const camera = new THREE.PerspectiveCamera(38, W / H, 0.2, 400);

function gradientTex(stops, h = 512) {
  const c = document.createElement('canvas'); c.width = 4; c.height = h;
  const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, h);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, 4, h);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
}
scene.background = gradientTex([[0, '#5aa9f0'], [0.55, '#a9d8ff'], [1, '#e8f6ff']]);

const hemi = new THREE.HemisphereLight('#dff0ff', '#9c7a55', 1.35); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff4e0', 3.0);
sun.position.set(14, 26, 20); sun.target.position.set(0, 1, -1);
sun.castShadow = Q.get('shadow') !== '0'; sun.shadow.mapSize.setScalar(+(Q.get('sh') || 2048));
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -12, near: 1, far: 90 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight('#bcd4ff', 0.9); fill.position.set(-12, 8, 10); scene.add(fill);

const MATS = {};
function M(col, o = {}) {
  const k = col + JSON.stringify(o);
  const m = { color: col, roughness: 0.62, metalness: 0.02, ...o };
  if (!ENV) m.metalness = Math.min(m.metalness, 0.25);
  return (MATS[k] ??= new THREE.MeshStandardMaterial(m));
}
const GEO = { box: new THREE.BoxGeometry(1, 1, 1), sph: new THREE.SphereGeometry(1, 28, 18), cyl: new THREE.CylinderGeometry(1, 1, 1, 24) };
function mesh(geo, mat, shadow = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; return m; }
function box(w, h, d, mat, x = 0, y = 0, z = 0, parent) {
  const m = mesh(GEO.box, mat); m.scale.set(w, h, d); m.position.set(x, y, z); (parent || scene).add(m); return m;
}
function boxC(x0, y0, z0, x1, y1, z1, mat, parent) { return box(x1 - x0, y1 - y0, z1 - z0, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, parent); }
function sph(r, mat, x = 0, y = 0, z = 0, parent) { const m = mesh(GEO.sph, mat); m.scale.setScalar(r); m.position.set(x, y, z); (parent || scene).add(m); return m; }
function cylZ(r, len, mat, x, y, z, parent) { const m = mesh(GEO.cyl, mat); m.scale.set(r, len, r); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); (parent || scene).add(m); return m; }
function grp(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); (parent || scene).add(g); return g; }
function textTex(txt, { w = 512, h = 256, font = '700 160px F', col = '#000', bg = null } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.font = font; g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, w / 2, h / 2 + 8);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
}

// montagem: a peça vem de longe girando e encaixa com sobra
const ASM = [];
function asm(obj, t0, dur, from = {}) {
  const base = { p: obj.position.clone(), r: obj.rotation.clone(), s: obj.scale.clone() };
  ASM.push({ obj, t0, dur, base, from: { dx: 0, dy: 6, dz: 0, rx: 0, ry: 0, rz: 0, s: 1, ...from }, ease: from.ease || 'back' });
  return obj;
}
function applyAsm(t) {
  for (const a of ASM) {
    const p = P(t, typeof a.t0 === 'function' ? a.t0() : a.t0, a.dur);
    const o = a.obj;
    if (p <= 0) { o.visible = false; continue; }
    o.visible = true;
    const e = EZ[a.ease](p), k = 1 - e, f = a.from;
    o.position.set(a.base.p.x + f.dx * k, a.base.p.y + f.dy * k, a.base.p.z + f.dz * k);
    o.rotation.set(a.base.r.x + f.rx * k, a.base.r.y + f.ry * k, a.base.r.z + f.rz * k);
    const s = lerp(f.s, 1, Math.min(1.3, e));
    o.scale.set(a.base.s.x * s, a.base.s.y * s, a.base.s.z * s);
  }
}


// ================================================================ cenário
const R = {};
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function canvasTex(w, h, fn) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
}
function cylPool(n, r, mat) {
  const pool = [];
  for (let i = 0; i < n; i++) { const m = mesh(GEO.cyl, mat); m.visible = false; scene.add(m); pool.push(m); }
  return { pool, r };
}
function drawPoly(rope, pts, q = 1) {
  let total = 0; const seg = [];
  for (let i = 1; i < pts.length; i++) { const l = pts[i].distanceTo(pts[i - 1]); seg.push(l); total += l; }
  let rem = total * q, k = 0;
  for (let i = 1; i < pts.length && rem > 1e-4; i++) {
    const l = Math.min(seg[i - 1], rem); rem -= l;
    const a = pts[i - 1];
    _d.copy(pts[i]).sub(a).normalize();
    _v.copy(_d).multiplyScalar(l).add(a);
    const m = rope.pool[k++]; if (!m) break;
    m.visible = true; m.scale.set(rope.r, l + rope.r * 0.6, rope.r);
    m.position.copy(a).add(_v).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(_up, _d);
  }
  for (; k < rope.pool.length; k++) rope.pool[k].visible = false;
}
// barra fixa entre dois pontos (treliça, estais)
function member(parent, a, b, r, mat) {
  const m = mesh(GEO.cyl, mat);
  const d = b.clone().sub(a), l = d.length();
  m.scale.set(r, l, r); m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(_up, d.normalize());
  parent.add(m); return m;
}
function person(shirt) {
  const g = new THREE.Group();
  const b = mesh(new THREE.CapsuleGeometry(0.28, 0.5, 4, 10), M(shirt)); b.position.y = 0.8; g.add(b);
  sph(0.26, M('#f2c29b'), 0, 1.5, 0, g);
  const hat = sph(1, M('#ffc62b'), 0, 1.6, 0, g); hat.scale.set(0.28, 0.16, 0.28);
  for (const s of [-1, 1]) { const l = mesh(new THREE.CapsuleGeometry(0.1, 0.35, 4, 8), M('#33415c')); l.position.set(s * 0.13, 0.28, 0); g.add(l); }
  return g;
}
const LP = (col, o = {}) => M(col, { flatShading: true, roughness: 0.95, ...o });
const ICO = new THREE.IcosahedronGeometry(1, 0), ICO1 = new THREE.IcosahedronGeometry(1, 1), CONE6 = new THREE.ConeGeometry(1, 1.6, 6), DODE = new THREE.DodecahedronGeometry(1, 0);
// ---------- jardim, terreno em corte e casa
function buildWorld() {
  const grass = LP('#7cc35a'), soil = LP('#8a5a3a'), soilD = LP('#6e4630');
  // grama em volta da casa (topo y = 0)
  boxC(-60, -0.4, -60, -8.4, 0, 4, grass); boxC(8.4, -0.4, -60, 60, 0, 4, grass); boxC(-8.4, -0.4, -60, 8.4, 0, -6.4, grass);
  // terra (cortada na frente em z = 4)
  boxC(-60, -16, -60, -6, -0.4, 4, soil); boxC(6, -16, -60, 60, -0.4, 4, soil);
  boxC(-6, -16, -60, 6, -8, 4, soilD); boxC(-6, -8, -60, 6, -0.4, -5.6, soil);
  R.fill = boxC(-6, -8, -5.6, 6, -0.4, 4, soil);
  // pedrinhas aparecendo no corte
  for (let i = 0; i < 26; i++) { const x = (rnd(i) - 0.5) * 50, y = -1.5 - rnd(i + 3) * 13; if (Math.abs(x) < 7.5 && y > -9) continue; const r = mesh(DODE, LP(i % 3 ? '#9a8f84' : '#7d736a')); r.scale.set(0.3 + rnd(i + 5) * 0.4, 0.2 + rnd(i + 6) * 0.3, 0.25); r.position.set(x, y, 4.02); r.rotation.z = rnd(i) * 3; scene.add(r); }
  // piso do quarto com o buraco do alçapão (x 1..3.4, z -4.8..-3.2)
  const wood = M('#c89b6a', { roughness: 0.75 });
  boxC(-8.4, -0.4, -6.4, 1, 0, 4, wood); boxC(3.4, -0.4, -6.4, 8.4, 0, 4, wood);
  boxC(1, -0.4, -3.2, 3.4, 0, 4, wood); boxC(1, -0.4, -6.4, 3.4, 0, -4.8, wood);
  // paredes
  const wall = M('#f3e3c3', { roughness: 0.9 }), wallB = M('#d9c3a0');
  boxC(-8.4, 0, -6.4, 8.4, 7, -6, wall);
  boxC(-8.4, 0, -6, -8, 7, 4, wallB); boxC(8, 0, -6, 8.4, 7, 4, wallB);
  boxC(-8.4, 7, -6.4, 8.4, 7.3, -6, M('#b98a5a')); boxC(-8.4, 7, -6, -8, 7.3, 4, M('#b98a5a')); boxC(8, 7, -6, 8.4, 7.3, 4, M('#b98a5a'));
  for (let x = -7.85; x < 7.9; x += 0.9) boxC(x, 0.3, -5.997, x + 0.45, 6.7, -5.993, M('#efd9b4'));
  // janela (parede esquerda) e porta (parede direita)
  boxC(-7.98, 2.4, -3.0, -7.9, 5.2, 0.4, M('#ffffff')); boxC(-7.9, 2.6, -2.8, -7.86, 5.0, 0.2, M('#9fd6ff', { roughness: 0.1, emissive: '#6fb8ff', emissiveIntensity: 0.25 }));
  R.door = grp(null, 7.95, 0, 1.6);
  boxC(-0.06, 0.001, -2.6, 0.04, 4.6, 0, M('#9a6a3d'), R.door);
  sph(0.12, M('#ffd23f', { metalness: 0.6 }), -0.12, 2.3, -2.3, R.door);
  // quadro na parede
  boxC(-1.6, 3.6, -6, 0.6, 5.2, -5.92, M('#6b4f3a')); boxC(-1.45, 3.75, -5.92, 0.45, 5.05, -5.9, M('#8fd0f0'));
  // jardim low-poly: árvores, arbustos, cerca, nuvens
  const tree = (x, z, s, pine) => {
    const t = grp(null, x, 0, z);
    const tr = mesh(new THREE.CylinderGeometry(0.15, 0.2, 1, 6), LP('#6e4a2c')); tr.scale.set(s, 1.8 * s, s); tr.position.y = 0.9 * s; t.add(tr);
    if (pine) for (let k = 0; k < 3; k++) { const c = mesh(CONE6, LP(k % 2 ? '#3d8f45' : '#2f7a3a')); c.scale.setScalar(s * (1.1 - k * 0.27)); c.position.y = s * (2.1 + k * 0.85); t.add(c); }
    else { const a = mesh(ICO, LP('#4caf50')); a.scale.setScalar(1.3 * s); a.position.y = 2.6 * s; t.add(a); const b = mesh(ICO, LP('#5bbd55')); b.scale.setScalar(0.85 * s); b.position.set(0.6 * s, 3.2 * s, 0.3 * s); t.add(b); }
  };
  for (let i = 0; i < 40; i++) { const x = (rnd(i * 3) - 0.5) * 90, z = -8 - rnd(i * 3 + 1) * 45; if (Math.abs(x) < 10 && z > -12) continue; tree(x, z, 0.9 + rnd(i + 2) * 0.8, rnd(i + 7) < 0.4); }
  tree(-13, 0.5, 1.2, false); tree(17, -2.5, 1.3, true); tree(-16, -4, 1.0, true);
  for (let i = 0; i < 6; i++) { const b = mesh(ICO, LP('#58a945')); b.scale.set(1.0, 0.7, 0.9); b.position.set(i < 3 ? -10 - i * 1.4 : 13 + (i - 3) * 1.5, 0.5, 2.6 - (i % 2) * 1.2); scene.add(b); }
  const fence = LP('#f4efe6');
  for (let x = -40; x <= 40; x += 1.2) if (Math.abs(x) > 9) boxC(x - 0.08, 0, -9.0, x + 0.08, 1.1, -8.84, fence);
  for (const y of [0.4, 0.85]) { boxC(-40.1, y, -8.84, -9.1, y + 0.1, -8.78, fence); boxC(9.1, y, -8.84, 40.1, y + 0.1, -8.78, fence); }
  const tuftG = new THREE.ConeGeometry(0.1, 0.35, 4), tufts = new THREE.InstancedMesh(tuftG, LP('#4f9a3c'), 500);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  let nt = 0;
  for (let i = 0; i < 3000 && nt < 500; i++) { const x = (rnd(i * 5 + 0.3) - 0.5) * 70, z = 3.8 - rnd(i * 5 + 1.7) * 40; if (Math.abs(x) < 9 && z > -7) continue; p.set(x, 0.14, z); q.setFromAxisAngle(_up, rnd(i) * 6); sc.setScalar(0.7 + rnd(i + 2) * 0.8); tufts.setMatrixAt(nt++, mtx.compose(p, q, sc)); }
  tufts.count = nt; scene.add(tufts);
  const cloudM = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1, emissive: '#dfe8f5', emissiveIntensity: 0.35 });
  R.clouds = [];
  for (let i = 0; i < 7; i++) { const cg = grp(null, -70 + i * 24 + rnd(i) * 8, 16 + rnd(i + 2) * 10, -60 - rnd(i + 5) * 20); for (let k = 0; k < 4; k++) { const m = mesh(ICO1, cloudM, false); m.scale.setScalar(3 + rnd(i * 4 + k) * 2.5); m.position.set((k - 1.5) * 3.6, (k % 2) * 1.6, rnd(k + i) * 1.5); cg.add(m); } R.clouds.push(cg); }
}
// ---------- quarto: cama em trilhos, botão, estante com troféu, alçapão
function buildRoom() {
  R.bed = grp(null, BED0, 0, -4.4);
  const frame = M('#8b5a33', { roughness: 0.7 });
  for (const [x, z] of [[-2.3, -1.4], [2.3, -1.4], [-2.3, 1.4], [2.3, 1.4]]) boxC(x - 0.15, 0, z - 0.15, x + 0.15, 0.42, z + 0.15, frame, R.bed);
  boxC(-2.5, 0.42, -1.6, 2.5, 0.8, 1.6, frame, R.bed);
  boxC(-2.4, 0.8, -1.5, 2.4, 1.3, 1.5, M('#f7f3ea'), R.bed);
  boxC(-1.2, 1.3, -1.52, 2.42, 1.42, 1.52, M('#4d7cfe'), R.bed);
  boxC(-2.25, 1.3, -1.2, -1.35, 1.62, 1.2, M('#ffffff'), R.bed);
  boxC(-2.7, 0.42, -1.6, -2.5, 2.8, 1.6, frame, R.bed);
  boxC(-2.72, 2.8, -1.62, -2.48, 2.95, 1.62, M('#6e4426'), R.bed);
  // trilhos e motor
  R.rails = grp(null);
  for (const z of [-5.8, -3.0]) boxC(-4.5, 0, z - 0.1, 5.4, 0.08, z + 0.1, M('#9aa3ad', { metalness: 0.7, roughness: 0.3 }), R.rails);
  asm(R.rails, () => C.rails, 0.5, { dy: 3, s: 0.6 });
  R.motor = boxC(5.5, 0, -6.0, 6.3, 0.6, -5.3, M('#5d6675', { metalness: 0.4 }));
  asm(R.motor, () => C.motor, 0.4, { dy: 2, s: 0.3 });
  // botão vermelho na parede
  R.button = grp(null, 6.6, 2.9, -5.98);
  boxC(-0.4, -0.4, 0, 0.4, 0.4, 0.08, M('#e9e9e9'), R.button);
  cylZ(0.2, 0.16, M('#e63946'), 0, 0, 0.14, R.button);
  asm(R.button, () => C.btn, 0.45, { dy: 0, s: 0.01 });
  // estante com livros e troféu
  const sh = M('#a8743f', { roughness: 0.75 });
  R.shelf = grp(null);
  boxC(-7.8, 0, -6, -4.6, 5.6, -5.9, M('#8e6036'), R.shelf);
  boxC(-7.8, 0, -5.9, -7.6, 5.6, -5.0, sh, R.shelf); boxC(-4.8, 0, -5.9, -4.6, 5.6, -5.0, sh, R.shelf);
  for (const y of [0, 1.4, 2.8, 4.2, 5.4]) boxC(-7.6, y, -5.9, -4.8, y + 0.2, -5.0, sh, R.shelf);
  const bc = ['#e63946', '#2a9d8f', '#ffd23f', '#4d7cfe', '#8e5bd1', '#ff8a2a', '#3d8f45'];
  [0.2, 1.6, 4.4].forEach((y0, si) => {
    let x = -7.55;
    for (let k = 0; k < 12; k++) { const w = 0.22 + rnd(si * 11 + k) * 0.16, h = (si === 2 ? 0.7 : 0.8) + rnd(si * 7 + k) * (si === 2 ? 0.25 : 0.35); if (x + w > -4.85) break; boxC(x, y0, -5.85, x + w, y0 + h, -5.15 - rnd(k + si) * 0.08, M(bc[(k + si * 2) % bc.length]), R.shelf); x += w + 0.01; }
  });
  R.trophy = grp(null, -6.2, 3.0, -5.45);
  const gold = M('#ffcf3a', { metalness: 0.8, roughness: 0.25 });
  const tb = mesh(GEO.cyl, M('#3b2a22')); tb.scale.set(0.32, 0.18, 0.32); tb.position.y = 0.09; R.trophy.add(tb);
  const st = mesh(GEO.cyl, gold); st.scale.set(0.07, 0.4, 0.07); st.position.y = 0.38; R.trophy.add(st);
  const cup = mesh(new THREE.CylinderGeometry(0.34, 0.12, 0.5, 16), gold); cup.position.y = 0.83; R.trophy.add(cup);
  for (const s of [-1, 1]) { const h = mesh(new THREE.TorusGeometry(0.14, 0.04, 8, 16), gold); h.position.set(s * 0.36, 0.86, 0); R.trophy.add(h); }
  // alçapão (dobradiça no lado x = 1)
  R.lid = grp(null, 1, 0, -4.0);
  boxC(0.005, -0.38, -0.795, 2.395, -0.02, 0.795, M('#b88a5c'), R.lid);
  sph(0.1, M('#5d6675', { metalness: 0.6 }), 2.1, -0.01, 0, R.lid);
  // visita
  R.visitor = person('#8e5bd1'); R.visitor.scale.setScalar(1.45); scene.add(R.visitor);
}
// ---------- base subterrânea
function buildBase() {
  const conc = M('#b9b7b0', { roughness: 0.9 }), concD = M('#a7a59e', { roughness: 0.9 });
  R.conc = [];
  const C_ = (a, b, c, d, e, f, m, ord) => { const x = boxC(a, b, c, d, e, f, m); asm(x, () => C.conc0 + ord * (C.conc1 - C.conc0) / 6, 0.45, { dy: 6, s: 0.7 }); R.conc.push(x); return x; };
  C_(-5.85, -7.85, -5.45, 5.85, -7.25, 4, concD, 0);
  C_(-5.85, -7.25, -5.45, -5.25, -1.0, 4, conc, 1);
  C_(5.25, -7.25, -5.45, 5.85, -1.0, 4, conc, 2);
  C_(-5.25, -7.25, -5.45, 5.25, -1.0, -4.85, conc, 3);
  C_(-5.85, -1.0, -5.45, 1, -0.4, 4, concD, 4); C_(3.4, -1.0, -5.45, 5.85, -0.4, 4, concD, 5);
  C_(1, -1.0, -3.2, 3.4, -0.4, 4, concD, 6); C_(1, -1.0, -5.45, 3.4, -0.4, -4.8, concD, 6);
  // vergalhões aparecendo no corte
  const reb = M('#8a3324', { metalness: 0.5 });
  R.rebar = grp(null);
  for (const x of [-5.55, 5.55]) for (let y = -6.8; y < -1.2; y += 1.1) { const m = mesh(GEO.cyl, reb); m.scale.set(0.05, 0.2, 0.05); m.rotation.x = Math.PI / 2; m.position.set(x, y, 4.05); R.rebar.add(m); }
  asm(R.rebar, () => C.conc1 - 0.2, 0.4, { dy: 0, s: 0.01 });
  // escada de marinheiro
  R.ladderG = grp(null);
  const lm = M('#7d8792', { metalness: 0.6, roughness: 0.4 });
  for (const x of [1.5, 2.9]) member(R.ladderG, V3(x, BASE_FLOOR, -4.6), V3(x, 0.6, -4.6), 0.06, lm);
  for (let y = BASE_FLOOR + 0.4; y < 0; y += 0.55) member(R.ladderG, V3(1.5, y, -4.6), V3(2.9, y, -4.6), 0.045, lm);
  asm(R.ladderG, () => C.ladder, 0.5, { dy: 4, s: 0.6 });
  // manta impermeável (preta) por fora do concreto
  const rub = M('#202226', { roughness: 0.6 });
  R.memb = [
    boxC(-6, -8, -5.6, -5.85, -0.4, 4, rub), boxC(5.85, -8, -5.6, 6, -0.4, 4, rub),
    boxC(-5.85, -8, -5.6, 5.85, -0.4, -5.45, rub), boxC(-5.85, -8, -5.45, 5.85, -7.85, 4, rub),
  ];
  R.memb.forEach((m, i) => asm(m, () => C.memb + i * 0.22, 0.45, { dy: 0, s: 0.01, ease: 'o' }));
  // bomba d'água
  R.pumpG = grp(null);
  boxC(4.1, BASE_FLOOR, -4.7, 5.1, BASE_FLOOR + 0.9, -3.9, M('#2a9d8f'), R.pumpG);
  member(R.pumpG, V3(4.6, BASE_FLOOR + 0.9, -4.3), V3(4.6, -1.0, -4.3), 0.12, M('#5d6675'));
  asm(R.pumpG, () => C.pump, 0.5, { dy: 3, s: 0.4 });
  // água da enchente
  R.water = boxC(-5.25, BASE_FLOOR, -4.85, 5.25, BASE_FLOOR + 1, 3.9, new THREE.MeshStandardMaterial({ color: '#3d8fd6', transparent: true, opacity: 0.6, roughness: 0.15 }));
  R.water.castShadow = false;
  // cano de ventilação até o anão de jardim (rente ao corte, em z = 3.85)
  R.pipeG = grp(null);
  const pm = M('#9aa3ad', { metalness: 0.5, roughness: 0.4 });
  for (const [a, b] of [[V3(4.6, -1.9, 3.85), V3(4.6, -0.7, 3.85)], [V3(4.6, -0.7, 3.85), V3(11, -0.7, 3.85)], [V3(11, -0.7, 3.85), V3(11, 0.4, 3.85)]]) member(R.pipeG, a, b, 0.24, pm);
  for (const p of [V3(4.6, -0.7, 3.85), V3(11, -0.7, 3.85)]) sph(0.27, pm, p.x, p.y, p.z, R.pipeG);
  boxC(4.2, -2.2, 3.45, 5.0, -1.9, 4.0, M('#5d6675'), R.pipeG);
  R.fan = grp(R.pipeG, 4.6, -2.25, 3.72);
  for (let k = 0; k < 4; k++) { const b = box(0.08, 0.02, 0.32, M('#e9e9e9'), 0, 0, 0, R.fan); b.rotation.y = k * Math.PI / 2; b.position.set(Math.sin(k * Math.PI / 2) * 0.16, 0, Math.cos(k * Math.PI / 2) * 0.16); }
  asm(R.pipeG, () => C.pipe, 0.6, { dy: 2, s: 0.3 });
  // anão de jardim (o chapéu é a saída de ar)
  R.gnome = grp(null, 11, 0, 3.85);
  const gb = mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.75, 8), LP('#2f6db5')); gb.position.y = 0.38; R.gnome.add(gb);
  sph(0.27, LP('#f2c29b'), 0, 0.95, 0, R.gnome);
  const beard = mesh(new THREE.ConeGeometry(0.24, 0.45, 8), LP('#ffffff')); beard.position.set(0, 0.72, 0.16); beard.rotation.x = Math.PI; R.gnome.add(beard);
  const hat = mesh(new THREE.ConeGeometry(0.3, 0.75, 8), LP('#e63946')); hat.position.y = 1.5; R.gnome.add(hat);
  sph(0.07, LP('#ff9a9a'), 0, 0.95, 0.27, R.gnome);
  for (const s of [-1, 1]) sph(0.04, M('#141824'), s * 0.1, 1.03, 0.24, R.gnome);
  asm(R.gnome, () => C.gnome, 0.5, { dy: 4, s: 0.2 });
  // escorregador em espiral
  const pts = [];
  for (let k = 0; k <= 60; k++) { const u = k / 60, a = -Math.PI / 2 + u * Math.PI * 3.2; pts.push(V3(2.2 + Math.cos(a) * 1.6, lerp(-1.1, BASE_FLOOR + 0.35, u), -2.4 + Math.sin(a) * 1.6)); }
  R.slideCurve = new THREE.CatmullRomCurve3(pts);
  R.slideG = grp(null);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(R.slideCurve, 160, 0.32, 10, false), M('#ffd23f', { roughness: 0.4 })); tube.castShadow = true; R.slideG.add(tube);
  member(R.slideG, V3(2.2, BASE_FLOOR, -2.4), V3(2.2, -1.0, -2.4), 0.16, M('#e63946'));
  asm(R.slideG, () => C.slide, 0.6, { dy: 5, s: 0.3 });
  // decoração
  R.sofa = grp(null);
  const sf = M('#e76f51', { roughness: 0.8 });
  boxC(-1.6, BASE_FLOOR, -2.2, -0.4, -6.6, 1.0, sf, R.sofa); boxC(-0.4, BASE_FLOOR, -2.6, 0.0, -5.6, 1.4, sf, R.sofa);
  boxC(-1.6, BASE_FLOOR, -2.6, -0.4, -6.2, -2.2, sf, R.sofa); boxC(-1.6, BASE_FLOOR, 1.0, -0.4, -6.2, 1.4, sf, R.sofa);
  asm(R.sofa, () => C.sofa, 0.45, { dy: 5, rz: 0.6, s: 0.3 });
  R.tv = grp(null);
  boxC(-5.25, -5.7, -3.2, -5.1, -3.0, 1.2, M('#1b1d22'), R.tv);
  R.tvScreen = canvasTex(256, 160, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#4d7cfe'); gr.addColorStop(1, '#8e5bd1'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(80, 90, 26, 0, 7); g.fill(); g.fillStyle = '#2ecc71'; g.fillRect(140, 60, 60, 60); });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(4.1, 2.4), new THREE.MeshBasicMaterial({ map: R.tvScreen, toneMapped: false }));
  scr.rotation.y = Math.PI / 2; scr.position.set(-5.08, -4.35, -1.0); R.tv.add(scr);
  asm(R.tv, () => C.tv, 0.45, { dy: 4, s: 0.2 });
  R.game = grp(null);
  boxC(-4.4, BASE_FLOOR, -2.6, -2.0, BASE_FLOOR + 0.02, 1.6, M('#5b6be0'), R.game);
  boxC(-3.4, BASE_FLOOR + 0.02, -1.4, -2.6, -7.0, -0.6, M('#f4f4f4'), R.game);
  boxC(-1.2, -6.6, -0.6, -0.7, -6.46, -0.2, M('#2b2f39'), R.game);
  asm(R.game, () => C.game, 0.45, { dy: 3, s: 0.3 });
  R.neon = grp(null);
  const nm = c => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
  boxC(-5.2, -1.14, -4.8, -5.08, -1.04, 3.9, nm('#ff3fa4'), R.neon); boxC(5.08, -1.14, -4.8, 5.2, -1.04, 3.9, nm('#38e1ff'), R.neon);
  boxC(-5.0, -1.14, -4.83, 5.0, -1.04, -4.73, nm('#b45cff'), R.neon);
  asm(R.neon, () => C.neon, 0.35, { dy: 0, s: 0.01 });
  R.fridge = grp(null);
  boxC(3.4, BASE_FLOOR, 1.4, 4.9, -5.5, 2.9, M('#f4f4f4', { roughness: 0.4 }), R.fridge);
  boxC(3.3, -6.6, 2.78, 3.4, -5.8, 2.86, M('#9aa3ad', { metalness: 0.6 }), R.fridge);
  boxC(3.38, -7.0, 1.6, 3.4, -5.7, 2.75, M('#e63946'), R.fridge);
  asm(R.fridge, () => C.fridge, 0.45, { dy: 5, s: 0.3 });
  // pá
  R.shovel = new THREE.Group();
  const hd = mesh(GEO.cyl, M('#8b5a33')); hd.scale.set(0.05, 1.5, 0.05); hd.position.y = -0.3; R.shovel.add(hd);
  const bl = box(0.42, 0.5, 0.06, M('#9aa3ad', { metalness: 0.6 }), 0, -1.2, 0, R.shovel); bl.rotation.x = 0.2;
}
function buildParticles() {
  R.dirt = []; for (let i = 0; i < 40; i++) { const m = mesh(DODE, LP(i % 2 ? '#8a5a3a' : '#6e4630')); m.visible = false; scene.add(m); R.dirt.push(m); }
  R.drops = []; for (let i = 0; i < 40; i++) { const m = mesh(GEO.sph, new THREE.MeshStandardMaterial({ color: '#7cc8ff', transparent: true, opacity: 0.8, depthWrite: false }), false); m.visible = false; scene.add(m); R.drops.push(m); }
}

// ================================================================ mestre de obras 3D (cena separada, canto inferior esquerdo)
const HVS = +(new URLSearchParams(location.search).get('hv') || 1);
const HV = { w: 380 * HVS, h: 340 * HVS };
const hostScene = new THREE.Scene();
hostScene.environment = scene.environment; hostScene.environmentIntensity = 0.4;
if (!ENV) hostScene.add(new THREE.AmbientLight('#ffffff', 0.5));
const hostCam = new THREE.PerspectiveCamera(30, HV.w / HV.h, 0.1, 50);
hostCam.position.set(0, 1.25, 5.4); hostCam.lookAt(0, 1.05, 0);
hostScene.add(new THREE.HemisphereLight('#ffffff', '#8a7a6a', 1.6));
const hk = new THREE.DirectionalLight('#fff3e0', 2.6); hk.position.set(2, 4, 5); hostScene.add(hk);
const hrim = new THREE.DirectionalLight('#9fd0ff', 2.0); hrim.position.set(-3, 2, -3); hostScene.add(hrim);
let HOST, HOSTW, HOSTW_PLACE;
function makeHost(target) {
  const HOST = {};
  const add = (m, p) => { p.add(m); return m; };
  const root = new THREE.Group(); target.add(root); HOST.root = root;
  const skin = M('#f2c29b'), vest = M('#ff8a1c', { roughness: 0.5 }), shirt = M('#2f6db5');
  HOST.body = grp(root);
  add(mesh(new THREE.CapsuleGeometry(0.62, 0.5, 8, 24), shirt), HOST.body).position.y = 0.3;
  const v = add(mesh(new THREE.CapsuleGeometry(0.67, 0.36, 8, 24), vest), HOST.body); v.position.y = 0.24;
  for (const y of [0.1, 0.4]) add(mesh(new THREE.CylinderGeometry(0.69, 0.69, 0.08, 32, 1, true), M('#e6e9ee', { metalness: 0.6, roughness: 0.25 })), HOST.body).position.y = y;
  HOST.head = grp(root, 0, 1.38, 0);
  sph(0.55, skin, 0, 0, 0, HOST.head);
  sph(0.08, M('#eab08a'), 0, -0.05, 0.54, HOST.head);
  for (const s of [-1, 1]) { const c = sph(1, M('#ff9a9a', { transparent: true, opacity: 0.6 }), s * 0.32, -0.12, 0.43, HOST.head); c.scale.set(0.1, 0.06, 0.04); }
  HOST.eyes = [];
  for (const s of [-1, 1]) {
    const e = grp(HOST.head, s * 0.2, 0.08, 0.47);
    const wh = sph(1, M('#ffffff', { roughness: 0.2 }), 0, 0, 0, e); wh.scale.set(0.12, 0.14, 0.07);
    const pu = sph(1, M('#1d140e', { roughness: 0.1 }), 0, 0, 0.055, e); pu.scale.set(0.065, 0.075, 0.04);
    const arc = add(mesh(new THREE.TorusGeometry(0.09, 0.022, 8, 20, Math.PI), M('#2b1d14')), e); arc.position.z = 0.04;
    const arcD = add(mesh(new THREE.TorusGeometry(0.09, 0.022, 8, 20, Math.PI), M('#2b1d14')), e); arcD.position.set(0, 0.05, 0.04); arcD.rotation.z = Math.PI;
    const x1 = box(0.17, 0.035, 0.03, M('#2b1d14'), 0, 0, 0.05, e); const x2 = box(0.17, 0.035, 0.03, M('#2b1d14'), 0, 0, 0.05, e);
    x1.rotation.z = 0.45; x2.rotation.z = -0.45;
    const brow = box(0.2, 0.045, 0.04, M('#5a3a22'), 0, 0.2, 0.02, e);
    HOST.eyes.push({ g: e, wh, pu, arc, arcD, x: [x1, x2], brow, s });
  }
  const mm = M('#6b2222');
  const smile = add(mesh(new THREE.TorusGeometry(0.16, 0.03, 8, 24, Math.PI * 0.8), mm), HOST.head); smile.rotation.z = Math.PI * 1.1; smile.position.set(0, -0.12, 0.5);
  const open = add(mesh(new THREE.SphereGeometry(0.2, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mm), HOST.head); open.scale.set(1, 0.8, 0.35); open.position.set(0, -0.15, 0.47);
  const tongue = sph(1, M('#ff7b8a'), 0, -0.25, 0.5, HOST.head); tongue.scale.set(0.09, 0.04, 0.04);
  const O = sph(1, mm, 0, -0.22, 0.5, HOST.head); O.scale.set(0.09, 0.12, 0.05);
  const flat = add(mesh(new THREE.TorusGeometry(0.1, 0.025, 8, 20, Math.PI), mm), HOST.head); flat.position.set(0, -0.27, 0.5);
  const teeth = box(0.28, 0.1, 0.05, M('#ffffff'), 0, -0.2, 0.52, HOST.head);
  HOST.mouths = { smile: [smile], open: [open, tongue], O: [O], flat: [flat], teeth: [teeth] };
  HOST.helmet = grp(HOST.head, 0, 0.12, 0);
  add(mesh(new THREE.SphereGeometry(0.6, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), M('#ffc62b', { roughness: 0.3, metalness: 0.1 })), HOST.helmet);
  const brim = add(mesh(new THREE.CylinderGeometry(0.66, 0.68, 0.06, 40), M('#ffc62b', { roughness: 0.3 })), HOST.helmet); brim.position.set(0, 0, 0.06); brim.scale.set(1, 1, 1.12);
  box(0.14, 0.12, 1.05, M('#f0a91e'), 0, 0.52, 0, HOST.helmet);
  HOST.sweat = sph(1, M('#7cd0ff', { roughness: 0.1, metalness: 0.2 }), 0.5, 0.25, 0.25, HOST.head); HOST.sweat.scale.set(0.06, 0.09, 0.06);
  HOST.arms = [];
  for (const s of [-1, 1]) {
    const a = grp(root, s * 0.62, 0.62, 0);
    add(mesh(new THREE.CapsuleGeometry(0.15, 0.55, 6, 14), shirt), a).position.y = -0.34;
    sph(0.17, skin, 0, -0.72, 0, a);
    const thumb = add(mesh(new THREE.CapsuleGeometry(0.05, 0.12, 4, 8), skin), a); thumb.position.set(0, -0.62, 0.15); thumb.rotation.x = Math.PI / 2;
    HOST.arms.push({ g: a, thumb, s });
  }
  // pernas e botinas (aparecem quando ele está dentro do cenário)
  for (const sx of [-1, 1]) {
    add(mesh(new THREE.CapsuleGeometry(0.19, 0.5, 6, 14), M('#2c3e66')), root).position.set(sx * 0.26, -0.98, 0);
    const boot = add(mesh(new THREE.CapsuleGeometry(0.17, 0.2, 6, 12), M('#6b3f1f')), root);
    boot.rotation.x = Math.PI / 2; boot.position.set(sx * 0.26, -1.36, 0.1);
  }
  return HOST;
}
// [braçoEsq rotX, rotZ, braçoDir rotX, rotZ]
const POSES = {
  down: [0.1, -0.25, 0.1, 0.25], thumbs: [0.1, -0.25, -2.0, -0.4], cheeks: [-2.4, -0.55, -2.4, 0.55],
  up: [-0.3, -2.7, -0.3, 2.7], cover: [-2.8, -0.35, -2.8, 0.35], wipe: [0.1, -0.25, -2.7, 0.15],
  point: [0.1, -0.25, -1.2, 1.4], cheer: [0, -2.6, 0, 2.6], push: [-1.45, -0.15, -1.45, 0.15],
};
function hostState(t) {
  let cur = null, prevEnd = 0;
  for (const r of REACT) { if (r.t > t) break; if (t < r.t + r.d) cur = r; else prevEnd = Math.max(prevEnd, r.t + r.d); }
  if (cur) return { e: cur.e, p: cur.p, b: cur.b, start: cur.t };
  return { e: 'idle', p: 'down', b: null, start: prevEnd };
}
function updateHost(t, HOST) {
  const cur = hostState(t), prev = hostState(cur.start - 0.001);
  const k = EZ.o(P(t, cur.start, 0.25));
  const pa = POSES[prev.p], pb = POSES[cur.p];
  const pose = pa.map((v, i) => lerp(v, pb[i], k));
  let jy = 0, jx = 0, rotY = 0.25 * Math.sin(t * 0.7), tilt = 0.04 * Math.sin(t * 1.3);
  if (cur.e === 'shock') jy = 0.35 * Math.sin(Math.PI * P(t, cur.start, 0.4));
  if (cur.p === 'up') jx = Math.sin(t * 45) * 0.04;
  if (cur.p === 'cheer') { jy = 0.3 * Math.abs(Math.sin((t - cur.start) * 7)); rotY = 0.4 * Math.sin((t - cur.start) * 5); }
  if (cur.e === 'think') tilt = 0.18;
  if (cur.e === 'worried') tilt = 0.08 * Math.sin(t * 4);
  if (cur.p === 'point') rotY = -0.35;
  HOST.root.position.set(jx, -0.15 + jy, 0);
  HOST.root.rotation.y = rotY;
  HOST.body.scale.set(1, 1 + 0.015 * Math.sin(t * 2.4), 1);
  HOST.head.scale.setScalar(1 + 0.08 * (1 - k));
  HOST.head.rotation.z = tilt; HOST.head.rotation.x = cur.e === 'happy' ? -0.08 : 0;
  const pop = cur.e === 'shock' ? Math.sin(Math.PI * P(t, cur.start, 0.4)) : 0;
  HOST.helmet.position.y = 0.12 + 0.25 * pop; HOST.helmet.rotation.z = 0.15 * pop;
  HOST.arms.forEach((a, i) => {
    const wave = cur.p === 'cheer' ? 0.25 * Math.sin(t * 14 + i) : cur.p === 'up' ? 0.15 * Math.sin(t * 25 + i * 2) : 0;
    a.g.rotation.x = pose[i * 2]; a.g.rotation.z = pose[i * 2 + 1] + wave;
    a.thumb.visible = cur.p === 'thumbs' && i === 1 && k > 0.5;
  });
  const blink = (t % 3.7) < 0.12 && cur.e === 'idle';
  const e = cur.e;
  for (const ey of HOST.eyes) {
    const open = !(e === 'happy' || e === 'wince' || e === 'relieved');
    ey.wh.visible = open; ey.pu.visible = open;
    ey.arc.visible = e === 'happy'; ey.arcD.visible = e === 'relieved';
    ey.x.forEach(m => (m.visible = e === 'wince'));
    const big = e === 'shock' ? 1.35 : 1;
    ey.wh.scale.set(0.12 * big, (blink ? 0.015 : 0.14) * big, 0.07);
    ey.pu.scale.set(0.065 * (e === 'shock' ? 0.8 : 1), blink ? 0.01 : 0.075 * (e === 'shock' ? 0.8 : 1), 0.04);
    ey.pu.position.set(e === 'idle' ? 0.02 : 0, e === 'idle' ? 0.02 : 0, 0.055);
    const by = { shock: 0.3, worried: 0.22, wince: 0.15, think: ey.s > 0 ? 0.3 : 0.2, happy: 0.26 }[e] ?? 0.22;
    const br = { worried: -0.35 * ey.s, wince: 0.35 * ey.s, think: ey.s > 0 ? -0.2 : 0.1 }[e] ?? 0;
    ey.brow.position.y = by; ey.brow.rotation.z = br;
  }
  const mouth = { happy: 'open', shock: 'O', worried: 'flat', wince: 'teeth', relieved: 'smile', think: 'O', idle: 'smile' }[e];
  for (const [k2, arr] of Object.entries(HOST.mouths)) arr.forEach(m => (m.visible = k2 === mouth));
  HOST.mouths.O[0].scale.set(e === 'think' ? 0.06 : 0.09, e === 'think' ? 0.07 : 0.12, 0.05);
  HOST.sweat.visible = e === 'worried' || e === 'relieved';
  HOST.sweat.position.y = 0.25 - ((t * 0.4) % 0.3);
}


// ================================================================ atualização do mundo (t = tempo do mundo)
const CAMYAW = 0.28;
function bedOpen(t) {
  const a = between(t, C.open1, C.close1 + 0.6) ? EZ.io(P(t, C.open1, 1.0)) * (1 - EZ.io(P(t, C.close1, 0.6))) : 0;
  const b = between(t, C.press2 + 0.15, C.rwV.a) ? EZ.io(P(t, C.press2 + 0.15, 1.0)) : 0;
  const c = t >= C.open3 ? EZ.io(P(t, C.open3, 1.0)) : 0;
  return Math.max(a, b, c);
}
function digTop(t) {
  if (t < C.dig0) return -0.4;
  if (t >= C.rwC.a) return -8;
  let top = lerp(-0.4, -6.6, EZ.io(P(t, C.dig0 + 0.3, C.dig1 - C.dig0 - 0.3)));
  if (t > C.collapse) top = lerp(top, -4.6, EZ.i2(P(t, C.collapse, 0.5)));
  return top;
}
const waterLevel = t => between(t, C.leak, C.rwW.a) ? BASE_FLOOR + 0.02 + 4.2 * EZ.io(P(t, C.leak, C.pool - C.leak)) : null;
function updateWorld(t) {
  applyAsm(t);
  R.clouds.forEach((c, i) => { c.userData.x0 ??= c.position.x; c.position.x = c.userData.x0 + t * (0.2 + 0.04 * i); });
  // cama: tremendo no empurrão, depois sobre os trilhos
  const lift = 0.08 * P(t, C.rails + 0.2, 0.3);
  const push = t < C.slip ? 0.03 * Math.abs(Math.sin(t * 9)) : 0;
  R.bed.position.set(lerp(BED0, BED_OPEN, bedOpen(t)) - push, lift, -4.4);
  // botão some e vai para dentro do troféu
  if (t > C.btnHide) { const k = P(t, C.btnHide, 0.35); R.button.scale.setScalar(Math.max(0.001, 1 - k)); R.button.position.x = lerp(6.6, -6.2, EZ.i2(k)); R.button.position.y = 2.9 + 1.5 * Math.sin(Math.PI * k); R.button.visible = k < 1; }
  // troféu brilha e gira
  const tp = t > C.trophy ? Math.sin(Math.PI * P(t, C.trophy, 0.4)) : 0;
  R.trophy.scale.setScalar(1 + 0.25 * tp);
  R.trophy.rotation.y = t > C.twist ? Math.PI / 2 * EZ.back(P(t, C.twist, 0.45)) : 0;
  // porta abre para a visita
  R.door.rotation.y = between(t, C.visit - 0.2, C.rwV.a) ? 1.3 * EZ.o(P(t, C.visit - 0.2, 0.5)) : 0;
  // alçapão
  R.lid.rotation.z = t >= C.lid ? 1.45 * EZ.back(P(t, C.lid, 0.6)) : 0;
  // terra sendo cavada (e desmoronando)
  const top = digTop(t), h = top + 8;
  R.fill.visible = h > 0.02;
  if (R.fill.visible) { R.fill.scale.y = h; R.fill.position.y = -8 + h / 2; }
  // enchente
  const wl = waterLevel(t);
  R.water.visible = wl !== null;
  if (wl !== null) { const hh = wl - BASE_FLOOR; R.water.scale.y = hh; R.water.position.y = BASE_FLOOR + hh / 2; }
  R.fan.rotation.y = t * 14;
  updateVisitor(t);
  updateParticles(t);
}
function updateVisitor(t) {
  const v = R.visitor;
  v.visible = between(t, C.visit, C.rwV.a);
  if (!v.visible) return;
  const a = V3(8.7, 0, 0.3), b = V3(7.0, 0, -4.5);
  const k = EZ.io(P(t, C.visit + 0.1, C.press2 - C.visit - 0.5));
  const p = a.clone().lerp(b, k);
  const step = k > 0 && k < 1 ? Math.abs(Math.sin(t * 12)) * 0.12 : 0;
  const jump = t > C.found ? 0.5 * Math.abs(Math.sin((t - C.found) * 6)) * (1 - P(t, C.found, 1.2)) : 0;
  v.position.set(p.x, step + jump, p.z);
  const yaw = k < 1 ? Math.atan2(b.x - a.x, b.z - a.z) : lerp(Math.PI, CAMYAW - 0.6, EZ.io(P(t, C.found - 0.1, 0.3)));
  v.rotation.set(t > C.press2 - 0.2 && t < C.found ? 0.25 : 0, yaw, 0, 'YXZ');
}
// ---------- bonequinho dentro da cena
const _w = (t, t0, t1, a, b) => { const k = EZ.io(P(t, t0, t1 - t0)); return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), k > 0 && k < 1]; };
function placeActor(t, wt) {
  const A = HOSTW_PLACE, H = HOSTW;
  A.rotation.order = 'YXZ';
  let x = 0, y = 0, z = 0, yaw = CAMYAW, lean = 0, roll = 0, walking = false;
  R.shovel.visible = false;
  const BF = BASE_FLOOR;
  if (wt < C.rwH.b) {
    // empurrando a cama com toda a força
    x = 6.15 + 0.05 * Math.sin(wt * 18); z = -4.1; yaw = -Math.PI / 2; lean = 0.38 + 0.06 * Math.sin(wt * 9);
    if (wt > C.slip) { const k = EZ.i2(P(wt, C.slip, 0.35)); lean = lerp(lean, 1.45, k); x += 0.6 * k; y = -0.95 * k * FEET / FEET; }
  } else if (wt < S('v2') - 0.05) {
    let p = [6.3, -3.0];
    if (wt > C.btn + 0.1) { const r = _w(wt, C.btn + 0.1, C.btn + 0.7, [6.3, -3.0], [6.6, -4.75]); p = [r[0], r[1]]; walking = r[2]; }
    x = p[0]; z = p[1];
    yaw = wt < C.btn + 0.1 ? CAMYAW : wt < C.open1 + 0.3 ? lerp(CAMYAW, Math.PI, EZ.io(P(wt, C.btn + 0.1, 0.35))) : lerp(Math.PI, CAMYAW + 2 * Math.PI, EZ.io(P(wt, C.open1 + 0.3, 0.4)));
  } else if (wt < S('b1')) {
    x = 3.8; z = -0.6; yaw = wt > C.found ? CAMYAW + 0.6 : CAMYAW;
  } else if (wt < S('c1')) {
    let p = [3.8, -0.6];
    if (wt > C.btnHide) { const r1 = _w(wt, C.btnHide + 0.2, C.btnHide + 1.2, [3.8, -0.6], [-5.0, -1.6]); p = [r1[0], r1[1]]; walking = r1[2]; }
    if (wt > C.btnHide + 1.2) { const r2 = _w(wt, C.btnHide + 1.2, C.btnHide + 1.7, [-5.0, -1.6], [-5.0, -3.9]); p = [r2[0], r2[1]]; walking = r2[2]; }
    x = p[0]; z = p[1];
    yaw = wt < C.btnHide + 0.2 ? CAMYAW : wt < C.btnHide + 1.2 ? -Math.PI / 2 : wt < C.open3 + 0.2 ? -2.47 : lerp(-2.47, CAMYAW, EZ.io(P(wt, C.open3 + 0.2, 0.4)));
  } else if (wt < C.rwC.b) {
    // vai até o alçapão, pula e cava
    if (wt < C.dig0) { const r = _w(wt, S('c1'), C.dig0 - 0.1, [-5.0, -3.9], [2.2, -2.2]); x = r[0]; z = r[1]; walking = r[2]; yaw = Math.PI / 2; }
    else {
      const k = EZ.i2(P(wt, C.dig0, 0.4));
      x = lerp(2.2, 0.6, k); z = lerp(-2.2, 0.4, k);
      const dt = Math.min(digTop(wt), lerp(-0.4, -6.6, EZ.io(P(wt, C.dig0 + 0.3, C.dig1 - C.dig0 - 0.3))));
      y = k < 1 ? lerp(0, dt, k) + 0.8 * Math.sin(Math.PI * k) : dt;
      yaw = CAMYAW + 0.5;
      R.shovel.visible = wt < C.collapse + 0.1;
    }
  } else if (wt < S('w1')) {
    x = 5.2; z = -1.2; yaw = CAMYAW;
  } else if (wt < S('a1')) {
    x = 0.6; z = 0.8; y = BF;
    const wl = waterLevel(wt);
    if (wl !== null && wl - 2.0 > BF) y = wl - 2.0 + 0.08 * Math.sin(wt * 3);
    roll = wl !== null ? 0.12 * Math.sin(wt * 2.3) : 0;
  } else if (wt < S('s1')) {
    x = 0.6; z = 0.8; y = BF;
    if (between(wt, C.stuffy, C.rwA.a)) { lean = 0.25 * P(wt, C.stuffy + 0.3, 0.6) + 0.05 * Math.sin(wt * 1.5); roll = 0.1 * Math.sin(wt * 1.1); }
    if (wt > C.pipe) { x = 2.6; z = 2.4; }
  } else if (wt < S('s2') - 0.05) {
    // descendo a escadinha no escuro e escorregando
    const k = P(wt, C.climb, C.fallS - C.climb);
    x = 2.2; z = -4.15; yaw = Math.PI; y = lerp(0, -3.2, k);
    if (wt > C.fallS) { const f = EZ.i2(P(wt, C.fallS, 0.6)); y = lerp(-3.2, BF - FEET + 0.6, f); z = lerp(-4.15, -2.6, f); lean = -1.4 * f; }
  } else if (wt < S('d1')) {
    if (wt < C.ride - 0.35) { x = 3.9; z = -2.0; }
    else if (wt < C.ride) { const k = P(wt, C.ride - 0.35, 0.35); x = lerp(3.9, 2.2, k); z = lerp(-2.0, -4.0, k); y = lerp(0, -1.1, k) + 1.0 * Math.sin(Math.PI * k); yaw = Math.PI; }
    else if (wt < C.ride + 1.9) {
      const u = EZ.io(P(wt, C.ride, 1.9)), p = R.slideCurve.getPointAt(u), tg = R.slideCurve.getTangentAt(u);
      x = p.x; y = p.y + 0.3; z = p.z; yaw = Math.atan2(tg.x, tg.z); lean = -0.35;
    } else { const r = _w(wt, C.ride + 1.9, C.ride + 2.6, [1.26, -1.1], [2.6, 0.9]); x = r[0]; z = r[1]; y = BF; walking = r[2]; }
  } else if (wt < S('o1') - 0.5) {
    x = 1.4; z = 2.2; y = BF;
  } else { x = 1.3; z = 2.3; y = BF; }
  const bob = walking ? 0.12 * Math.abs(Math.sin(t * 12)) : 0;
  A.position.set(x, y + FEET + bob, z);
  A.rotation.set(lean, yaw, roll);
  // braços cavando
  if (R.shovel.visible && wt > C.dig0 + 0.4 && wt < C.collapse) {
    const s = 0.5 + 0.5 * Math.sin(t * 7);
    H.arms.forEach((a, i) => { a.g.rotation.x = -0.4 - 1.0 * s; a.g.rotation.z = (i ? 1 : -1) * 0.25; });
  }
  if (between(wt, C.climb, C.fallS)) H.arms.forEach((a, i) => { a.g.rotation.x = -2.6 + 0.4 * Math.sin(t * 8 + i * Math.PI); a.g.rotation.z = (i ? 1 : -1) * 0.2; });
}
function burstPts(t, t0, origin, n, pool, offset, opt) {
  const a = t - t0; if (a < 0 || a > opt.life) return offset;
  for (let i = 0; i < n && offset < pool.length; i++, offset++) {
    const m = pool[offset];
    const ang = rnd(i + opt.seed) * Math.PI * 2, el = 0.6 + rnd(i + opt.seed + 9) * 0.9, v = opt.spd * (0.4 + rnd(i + opt.seed + 50) * 0.8);
    m.visible = true;
    m.position.set(origin.x + Math.cos(ang) * Math.cos(el) * v * a, origin.y + Math.sin(el) * v * a - opt.g * a * a, origin.z + Math.sin(ang) * Math.cos(el) * v * a);
    m.scale.setScalar(opt.size * (1 - a / opt.life * 0.5));
    if (m.material.transparent) m.material.opacity = 0.8 * (1 - a / opt.life);
  }
  return offset;
}
function updateParticles(t) {
  R.dirt.forEach(m => (m.visible = false));
  let d = 0;
  // pazadas de terra
  if (between(t, C.dig0 + 0.5, C.collapse)) for (let k = 0; k < 10; k++) { const t0 = C.dig0 + 0.5 + k * 0.45; d = burstPts(t, t0, V3(1.2, digTop(t0) + 0.6, 0.6), 2, R.dirt, d, { life: 0.7, spd: 6, g: 9, size: 0.22, seed: k * 5 }); }
  // desmoronamento
  if (between(t, C.collapse, C.rwC.a)) for (let i = 0; i < 18; i++) {
    const m = R.dirt[20 + i]; if (!m) break;
    const s = i % 2 ? 1 : -1, k = EZ.i2(P(t, C.collapse + rnd(i) * 0.25, 0.6));
    m.visible = true; m.scale.setScalar(0.45 + rnd(i + 2) * 0.4);
    m.position.set(s * lerp(5.6, 1.5 + rnd(i + 4) * 3, k), lerp(-1.2 - rnd(i + 6) * 3, -4.3 - rnd(i + 8) * 0.6, k), -4 + rnd(i + 9) * 7.5);
    m.rotation.set(k * 4 + i, k * 3, 0);
  }
  // goteiras
  R.drops.forEach(m => (m.visible = false));
  if (between(t, C.leak - 0.4, C.rwW.a)) R.drops.forEach((m, i) => {
    const per = 0.7, ph = (t - C.leak + rnd(i) * per) % per / per;
    m.visible = true; m.scale.set(0.07, 0.14, 0.07);
    m.position.set(-5 + rnd(i + 1) * 10, lerp(-1.05, waterLevel(t) ?? BASE_FLOOR, ph), -4.5 + rnd(i + 3) * 8.2);
  });
}

// ================================================================ câmera
function updateCamera(t) {
  const [tx, ty, tz, dist, az0, el0, fov] = kf(t, C.camKeys);
  const az = az0 + 0.012 * Math.sin(t * 0.9) + 0.006 * Math.sin(t * 2.3);
  const el = el0 + 0.008 * Math.sin(t * 1.1);
  const sh = shakeAt(t);
  camera.fov = fov; camera.updateProjectionMatrix();
  camera.position.set(tx + dist * Math.sin(az) * Math.cos(el), ty + dist * Math.sin(el), tz + dist * Math.cos(az) * Math.cos(el));
  camera.lookAt(tx, ty, tz);
  camera.position.x += sh[0] * 0.6; camera.position.y += sh[1] * 0.6;
}
function project(v) {
  const p = v.clone().project(camera);
  return [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H, p.z];
}

// ================================================================ camada 2D
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function circ(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
function line(x0, y0, x1, y1) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
function bigWord(txt, x, y, size, col) {
  ctx.font = `700 ${size}px F`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.strokeStyle = '#141824'; ctx.lineWidth = size * 0.22;
  ctx.strokeText(txt, x, y); ctx.fillStyle = col; ctx.fillText(txt, x, y);
}
function arrow2d(x0, y0, x1, y1, col, w = 15) {
  const L = Math.hypot(x1 - x0, y1 - y0); if (L < 6) return;
  const ux = (x1 - x0) / L, uy = (y1 - y0) / L, nx = -uy, ny = ux;
  const hl = Math.min(L * 0.55, w * 2.6), hw = w * 1.6;
  const bx = x1 - ux * hl, by = y1 - uy * hl;
  const head = () => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(bx + nx * hw, by + ny * hw); ctx.lineTo(bx - nx * hw, by - ny * hw); ctx.closePath(); };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#141824'; ctx.lineWidth = w + 9; line(x0, y0, bx, by);
  head(); ctx.lineWidth = 9; ctx.stroke(); ctx.fillStyle = '#141824'; ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = w; line(x0, y0, bx + ux * 2, by + uy * 2);
  head(); ctx.fillStyle = col; ctx.fill();
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
function drawArrows(t) {
  for (const A of ARROWS) {
    if (t < A.t0 || t > A.t1 + 0.25) continue;
    const pin = EZ.back(P(t, A.t0, 0.35)), pout = P(t, A.t1, 0.25);
    ctx.save(); ctx.globalAlpha *= cl(1 - pout) * cl(P(t, A.t0, 0.12));
    if (A.kind === 'spin') {
      const [cx, cy, cz] = project(A.at(t)); if (cz > 1) { ctx.restore(); continue; }
      const r = 70 * Math.max(0.3, pin), a0 = (t - A.t0) * 5, a1 = a0 + 1.5 * Math.PI;
      ctx.lineCap = 'round';
      for (const [col, w] of [['#141824', 22], [A.col, 13]]) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke(); }
      const ex = cx + Math.cos(a1) * r, ey = cy + Math.sin(a1) * r;
      arrow2d(ex, ey, ex - Math.sin(a1) * 34, ey + Math.cos(a1) * 34, A.col, 13);
      ctx.restore(); continue;
    }
    const bob = 0.15 * A.len * Math.sin((t - A.t0) * 9);
    _a.copy(A.at(t)).addScaledVector(A.dir, bob);
    _b.copy(_a).addScaledVector(A.dir, A.len);
    let [x0, y0, z0] = project(_a); const [x1, y1] = project(_b);
    if (z0 > 1) { ctx.restore(); continue; }
    let dx = x1 - x0, dy = y1 - y0; const L = Math.hypot(dx, dy);
    if (L < 1) { ctx.restore(); continue; }
    const Lm = Math.min(Math.max(L, 125), 240);  // sempre legível na tela
    dx *= Lm / L; dy *= Lm / L;
    arrow2d(x0, y0, x0 + dx * pin, y0 + dy * pin, A.col, 19);
    ctx.restore();
  }
}
function drawLabels(t) {
  for (const L of LABELS) {
    if (t < L.t0 || t > L.t1 + 0.3) continue;
    const pIn = P(t, L.t0, 0.45), pOut = P(t, L.t1, 0.3);
    const [ax, ay, az] = project(L.at(t));
    if (az > 1) continue;
    const fs = 46;
    ctx.font = `700 ${fs}px F`;
    const tw = ctx.measureText(L.txt).width;
    const bx = cl(ax + L.off[0], tw / 2 + 50, W - tw / 2 - 50), by = cl(ay + L.off[1], 230, 1440);
    ctx.save(); ctx.globalAlpha *= 1 - pOut;
    const lp = EZ.o(pIn);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#141824'; ctx.lineWidth = 8; line(ax, ay, lerp(ax, bx, lp), lerp(ay, by, lp));
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 4; line(ax, ay, lerp(ax, bx, lp), lerp(ay, by, lp));
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#141824'; ctx.lineWidth = 4;
    circ(ax, ay, 11 + 3 * Math.sin(t * 8)); ctx.fill(); ctx.stroke();
    const ring = (t - L.t0) % 1;
    ctx.strokeStyle = `rgba(255,210,63,${0.8 * (1 - ring)})`; ctx.lineWidth = 4; circ(ax, ay, 14 + 34 * ring); ctx.stroke();
    const s = EZ.back(P(t, L.t0 + 0.12, 0.4));
    ctx.translate(bx, by); ctx.scale(s, s); ctx.rotate(-0.035 + 0.02 * Math.sin(t * 3));
    ctx.fillStyle = 'rgba(0,0,0,.28)'; rr(-tw / 2 - 26, -fs * 0.72 + 9, tw + 52, fs * 1.44, 22); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#141824'; ctx.lineWidth = 6;
    rr(-tw / 2 - 26, -fs * 0.72, tw + 52, fs * 1.44, 22); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#141824'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(L.txt, 0, 3);
    ctx.restore();
  }
}
function buildCaptions() {
  for (const l of TL.lines) {
    const words = l.text.split(/\s+/);
    const chunks = []; let cur = [];
    for (const w of words) {
      const len = cur.join(' ').length;
      if (cur.length && len + w.length + 1 > 22) { chunks.push(cur); cur = []; }
      cur.push(w);
      if (/[,.:?!]$/.test(w) && cur.join(' ').length >= 12) { chunks.push(cur); cur = []; }
    }
    if (cur.length) chunks.push(cur);
    const total = chunks.reduce((a, c) => a + c.join(' ').length + 1, 0);
    let acc = 0;
    const hl = (l.hl || '').toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const exact = l.words && l.words.length === words.length && l.text === l.say;
    let wi = 0;
    const starts = chunks.map(c => { const k = wi; wi += c.length; return k; });
    chunks.forEach((c, i) => {
      let t0 = l.start + (acc / total) * (l.end - l.start);
      acc += c.join(' ').length + 1;
      let t1 = i === chunks.length - 1 ? l.end + 0.25 : l.start + (acc / total) * (l.end - l.start);
      if (exact) { t0 = l.words[starts[i]].s; t1 = i === chunks.length - 1 ? l.end + 0.25 : l.words[starts[i + 1]].s; }
      CAPS.push({ t0, t1, words: c.map(w => ({ w, hl: hl.includes(w.toLowerCase().replace(/[^a-zà-ú]/g, '')) })) });
    });
  }
}
const WORDS = [];
function buildWords() {
  for (const l of TL.lines) {
    const ws = l.text.split(/\s+/).filter(Boolean);
    const hl = (l.hl || '').toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const exact = l.words && l.words.length === ws.length && l.text === l.say;
    const total = ws.reduce((a, w) => a + w.length + 1, 0);
    let acc = 0;
    ws.forEach((w, i) => {
      let t0 = l.start + (acc / total) * (l.end - l.start);
      acc += w.length + 1;
      if (exact) t0 = l.words[i].s;
      WORDS.push({ t0, w: w.replace(/[,.:;]+$/, ''), hl: hl.includes(w.toLowerCase().replace(/[^a-zà-ú0-9]/g, '')), end: l.end + 0.2 });
    });
  }
  WORDS.forEach((o, i) => { o.t1 = Math.min(o.end, WORDS[i + 1] ? WORDS[i + 1].t0 : o.end); });
}
function drawCaption(t) {
  const o = WORDS.find(o => t >= o.t0 && t < o.t1);
  if (!o) return;
  const fs = 112;
  ctx.font = `700 ${fs}px F`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const k = P(t, o.t0, 0.14);
  const s = 0.6 + 0.4 * EZ.back(k);
  const txt = o.w.charAt(0).toUpperCase() + o.w.slice(1);
  ctx.save(); ctx.translate(540, 1450); ctx.scale(s, s); ctx.rotate(-0.03 + 0.03 * Math.sin(o.t0 * 7));
  ctx.strokeStyle = '#0f121a'; ctx.lineWidth = 22; ctx.strokeText(txt, 0, 4);
  ctx.fillStyle = o.hl ? '#ffd23f' : '#ffffff'; ctx.fillText(txt, 0, 0);
  ctx.restore();
}
function drawCaptionOld(t) {
  const c = CAPS.find(c => t >= c.t0 && t < c.t1);
  if (!c) return;
  const fs = 64;
  ctx.font = `700 ${fs}px F`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const sp = ctx.measureText(' ').width;
  const ws = c.words.map(o => ({ ...o, wd: ctx.measureText(o.w.toUpperCase()).width }));
  const tw = ws.reduce((a, o) => a + o.wd, 0) + sp * (ws.length - 1);
  const s = 0.86 + 0.14 * EZ.back(P(t, c.t0, 0.18));
  ctx.save(); ctx.translate(540, 1525); ctx.scale(s, s);
  let x = -tw / 2;
  ctx.lineJoin = 'round';
  ws.forEach((o, i) => {
    const wt = c.t0 + (c.t1 - c.t0) * (i / ws.length);
    const lift = -10 * EZ.back(P(t, wt, 0.15)) * (1 - P(t, wt + 0.15, 0.2));
    ctx.strokeStyle = '#121620'; ctx.lineWidth = 15; ctx.strokeText(o.w.toUpperCase(), x, lift);
    ctx.fillStyle = o.hl ? '#ffd23f' : '#ffffff'; ctx.fillText(o.w.toUpperCase(), x, lift);
    x += o.wd + sp;
  });
  ctx.restore();
}
function drawHeader() {
  ctx.font = '700 40px F';
  const [a, b] = ['COMO CONSTRUIR UMA ', 'BASE SECRETA'];
  const wa = ctx.measureText(a).width, tw = wa + ctx.measureText(b).width;
  ctx.fillStyle = 'rgba(20,24,36,.82)'; rr(540 - tw / 2 - 30, 52, tw + 60, 72, 36); ctx.fill();
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff'; ctx.fillText(a, 540 - tw / 2, 90);
  ctx.fillStyle = '#ffd23f'; ctx.fillText(b, 540 - tw / 2 + wa, 90);
}
function drawChips(t) {
  const vis = CHIPS.filter(c => t >= c.t);
  if (!vis.length) return;
  ctx.save(); ctx.globalAlpha *= P(t, CHIPS[0].t, 0.4);
  ctx.fillStyle = 'rgba(255,255,255,.85)'; rr(390, 1640, 665, 258, 30); ctx.fill();
  ctx.fillStyle = '#5b6372'; ctx.font = '600 26px F'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('PEÇAS DA BASE', 418, 1676);
  let x = 414, y = 1716;
  ctx.font = '600 24px F';
  for (const c of vis) {
    const w = ctx.measureText(c.txt).width + 60;
    if (x + w > 1040) { x = 414; y += 46; }
    const s = EZ.back(P(t, c.t + 0.3, 0.4));
    ctx.save(); ctx.translate(x + w / 2, y); ctx.scale(s, s);
    ctx.fillStyle = '#1f8f55'; rr(-w / 2, -19, w, 38, 19); ctx.fill();
    ctx.fillStyle = '#fff'; circ(-w / 2 + 22, 0, 12); ctx.fill();
    ctx.fillStyle = '#1f8f55'; ctx.font = '700 20px F'; ctx.textAlign = 'center'; ctx.fillText('✓', -w / 2 + 22, 1);
    ctx.fillStyle = '#fff'; ctx.font = '600 24px F'; ctx.textAlign = 'left'; ctx.fillText(c.txt, -w / 2 + 40, 1);
    ctx.restore();
    x += w + 10;
  }
  ctx.restore();
}
function drawBubble(t) {
  const cur = hostState(t);
  if (!cur.b) return;
  const s = EZ.back(P(t, cur.start, 0.3));
  let bx = 250, by = 1600;
  if (t >= C.hostWorld) { const v = new THREE.Vector3(0, 2.4, 0); HOSTW_PLACE.localToWorld(v); [bx, by] = project(v); bx += 40; by -= 40; }
  ctx.save(); ctx.translate(bx, by); ctx.scale(s, s); ctx.rotate(0.05 * Math.sin(t * 5));
  ctx.font = '700 44px F';
  const tw = Math.max(60, ctx.measureText(cur.b).width);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#141824'; ctx.lineWidth = 6;
  rr(-20, -44, tw + 40, 78, 30); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4, 30); ctx.lineTo(-30, 66); ctx.lineTo(36, 30); ctx.fill();
  ctx.fillStyle = '#141824'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(cur.b, 0, -4);
  ctx.restore();
}

// ================================================================ camada 2D própria da base secreta
function drawEra() {}
function failOverlays(t, wt) {
  // chuva lá fora
  if (between(wt, C.rain, C.rwW.a)) {
    const k = P(wt, C.rain, 0.4);
    ctx.save(); ctx.globalAlpha = 0.18 * k; ctx.fillStyle = '#1c2c55'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 0.55 * k;
    ctx.strokeStyle = '#cfe6ff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (let i = 0; i < 70; i++) { const x = rnd(i) * (W + 200) - 100, y = ((rnd(i + 3) * H + t * 1900) % (H + 100)) - 50; line(x, y, x - 14, y + 46); }
    ctx.restore();
  }
  // abafado: ar parado e sono
  if (between(wt, C.stuffy, C.rwA.a)) {
    const k = P(wt, C.stuffy, 0.8);
    ctx.save(); ctx.globalAlpha = 0.25 * k; ctx.fillStyle = '#c9a06a'; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.5 * k; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) { const x = 160 + i * 150, y0 = 1250 - ((t * 90 + i * 70) % 600); ctx.beginPath(); for (let j = 0; j <= 12; j++) { const yy = y0 - j * 16; const xx = x + 14 * Math.sin(j * 0.9 + t * 3 + i); j ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); } ctx.stroke(); }
    ctx.restore();
    const [hx, hy, hz] = project(V3(HOSTW_PLACE.position.x, HOSTW_PLACE.position.y + 1.8, HOSTW_PLACE.position.z));
    if (hz < 1) for (let i = 0; i < 3; i++) { const a = ((t - C.stuffy) * 0.8 + i / 3) % 1; ctx.save(); ctx.globalAlpha = Math.sin(Math.PI * a) * k; bigWord('Z', hx + 60 + a * 90 + i * 10, hy - 60 - a * 220, 60 + i * 16, '#ffffff'); ctx.restore(); }
  }
}
function comic(t, wt) {
  const word = (t0, dur, v, txt, size, col) => {
    if (wt < t0 || wt > t0 + dur) return;
    const [x, y, z] = project(v); if (z > 1) return;
    const k = P(wt, t0, dur);
    const hw = size * 0.32 * txt.length + 30; ctx.save(); ctx.translate(cl(x, Math.min(540, hw), Math.max(540, W - hw)), cl(y - 120, 300, 1300)); ctx.scale(EZ.back(cl(k * 3)), EZ.back(cl(k * 3))); ctx.rotate(-0.1); ctx.globalAlpha *= 1 - P(wt, t0 + dur * 0.7, dur * 0.3);
    bigWord(txt, 0, 0, size, col); ctx.restore();
  };
  if (!inRewind(t)) {
    word(C.slip + 0.3, 0.9, V3(6.5, 1.2, -4), 'TUM!', 120, '#ffd23f');
    word(C.found, 1.2, V3(7, 3.6, -4.5), 'OPA!', 120, '#ff5a3c');
    word(C.collapse + 0.1, 1.1, V3(0, -2.5, 0), 'CRASH!', 130, '#ff5a3c');
    word(C.pool - 0.5, 1.2, V3(0, -2.6, 0), 'GLUB GLUB!', 104, '#4d9bff');
    word(C.fallS + 0.65, 0.9, V3(2.2, -5.2, -3), 'POF!', 120, '#ffd23f');
    word(C.ride + 0.3, 1.4, V3(2.2, -3.4, -2.4), 'VUUUSH!', 110, '#2ecc71');
    word(C.gnome + 0.5, 1.2, V3(11, 2.2, 3.8), 'AR FRESCO!', 84, '#2ecc71');
  }
  // gancho: os 2 primeiros segundos
  if (t < 1.9) {
    const k = EZ.back(P(t, 0.05, 0.35)) * (1 - P(t, 1.6, 0.3));
    const pulse = 1 + 0.06 * Math.sin(t * 16);
    ctx.save(); ctx.translate(540, 500); ctx.scale(k * pulse, k * pulse); ctx.rotate(-0.06);
    bigWord('VAI', 0, -95, 150, '#ffffff');
    bigWord('CONSEGUIR?', 0, 70, 140, '#ffd23f');
    ctx.restore();
  }
}
function overlays(t) {
  const rw = inRewind(t);
  if (rw) vhs(t, rw);
  if (t >= C.stamp) {
    const k = P(t, C.stamp, 0.22);
    const sc = lerp(3, 1, EZ.o(k));
    ctx.save(); ctx.translate(540, 520); ctx.rotate(-0.12); ctx.scale(sc, sc); ctx.globalAlpha = cl(k * 2) * (1 - P(t, C.cta - 0.2, 0.3));
    ctx.fillStyle = 'rgba(255,255,255,.94)'; ctx.strokeStyle = '#1f8f55'; ctx.lineWidth = 12;
    rr(-330, -110, 660, 220, 30); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 4; rr(-310, -90, 620, 180, 22); ctx.stroke();
    ctx.fillStyle = '#1f8f55'; ctx.font = '700 92px F'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('OBRA', 0, -36); ctx.font = '700 64px F'; ctx.fillText('ENTREGUE ✓', 0, 50);
    ctx.restore();
    const a = t - C.stamp - 0.18;
    if (a > 0) {
      const cols = ['#ffd23f', '#e63946', '#2a9d8f', '#4d7cfe', '#ff8a2a', '#8e5bd1'];
      for (let i = 0; i < 110; i++) {
        const ang = -Math.PI / 2 + (rnd(i) - 0.5) * 2.6, v = 600 + rnd(i + 7) * 900;
        const x = 540 + Math.cos(ang) * v * a, y = 520 + Math.sin(ang) * v * a + 900 * a * a;
        if (y > H + 40) continue;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a * 8 + i); ctx.scale(1, Math.cos(a * 10 + i)); ctx.fillStyle = cols[i % cols.length];
        ctx.fillRect(-10, -6, 20, 12); ctx.restore();
      }
    }
  }
  if (t >= C.cta) {
    const k = EZ.back(P(t, C.cta, 0.4));
    ctx.save(); ctx.translate(560, 330); ctx.scale(k, k); ctx.rotate(0.03 * Math.sin(t * 3));
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#141824'; ctx.lineWidth = 7;
    rr(-330, -100, 660, 200, 40); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-80, 96); ctx.lineTo(-120, 160); ctx.lineTo(-10, 96); ctx.fill();
    ctx.fillStyle = '#141824'; ctx.font = '700 44px F'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('QUAL OBRA EU', 0, -30);
    ctx.fillStyle = '#e63946'; ctx.fillText('CONSTRUO AGORA?', 0, 34);
    ctx.restore();
  }
}

// rebobinar de fita: listras brancas, ◀◀ no alto e pause no centro
function vhs(t, r) {
  const p = P(t, r.a, r.b - r.a);
  const k = Math.min(1, P(t, r.a, 0.08) * 1, (1 - p) * 8);
  ctx.save();
  ctx.globalAlpha = 0.18 * k; ctx.fillStyle = '#5b6b8a'; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.55 * k; ctx.fillStyle = '#ffffff';
  const off = (t * 1400) % 64;
  for (let y = -64 + off; y < H; y += 64) ctx.fillRect(0, y, W, 5);
  ctx.globalAlpha = 0.35 * k;
  for (let i = 0; i < 3; i++) { const y = ((t * 2300 + i * 700) % (H + 200)) - 100; ctx.fillRect(0, y, W, 26 + 10 * i); }
  ctx.globalAlpha = 0.25 * k; ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 70; i++) { const x = rnd(i + Math.floor(t * 30) * 7) * W, y = rnd(i * 3 + Math.floor(t * 30)) * H; ctx.fillRect(x, y, 2, 18); }
  ctx.globalAlpha = k;
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(20,24,36,.55)'; ctx.lineWidth = 8; ctx.lineJoin = 'round';
  for (const dx of [-38, 38]) { ctx.beginPath(); ctx.moveTo(540 + dx + 40, 270); ctx.lineTo(540 + dx - 40, 320); ctx.lineTo(540 + dx + 40, 370); ctx.closePath(); ctx.stroke(); ctx.fill(); }
  const pk = 1 - P(t, r.a + 0.35, 0.2);
  if (pk > 0) {
    ctx.globalAlpha = k * pk; ctx.fillStyle = 'rgba(20,24,36,.55)'; circ(540, 900, 100); ctx.fill();
    ctx.fillStyle = '#ffffff'; rr(500, 845, 26, 110, 8); ctx.fill(); rr(554, 845, 26, 110, 8); ctx.fill();
  }
  ctx.restore();
}


// ================================================================ quadro
function setup(tl) {
  TL = tl;
  for (const l of tl.lines) LN[l.id] = l;
  computeCues();
  buildCaptions();
  buildWords();
  scene.background = gradientTex([[0, '#3d7ad6'], [0.6, '#8dbff0'], [1, '#d4ebfb']]);
  sun.position.set(14, 30, 30); sun.target.position.set(0, -3, 0);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 120 }); sun.shadow.camera.updateProjectionMatrix();
  buildWorld(); buildRoom(); buildBase(); buildParticles();
  HOST = makeHost(hostScene);
  HOSTW_PLACE = grp(null, 0, FEET, 0); HOSTW_PLACE.scale.setScalar(HS);
  HOSTW = makeHost(HOSTW_PLACE);
  R.shovel.position.set(0, -0.72, 0.1); R.shovel.rotation.x = 1.3; HOSTW.arms[1].g.add(R.shovel);
}

const PIX = new Uint8Array(GW * GH * 4), FLIP = new Uint8ClampedArray(GW * GH * 4), IMG = new ImageData(FLIP, GW, GH);
const TMP = document.createElement('canvas'); TMP.width = GW; TMP.height = GH;
const TCTX = TMP.getContext('2d', { willReadFrequently: true });
const PROF = {};
const tick = (k, t0) => { PROF[k] = (PROF[k] || 0) + performance.now() - t0; return performance.now(); };
function draw(t) {
  let t0 = performance.now();
  const wt = worldTime(t);
  updateWorld(wt);
  updateCamera(t);
  const inWorld = t >= C.hostWorld;
  HOSTW_PLACE.visible = inWorld;
  if (inWorld) {
    updateHost(t, HOSTW);
    placeActor(t, wt);
  } else updateHost(t, HOST);
  t0 = tick('update', t0);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, GW, GH);
  renderer.autoClear = true;
  renderer.render(scene, camera);
  renderer.getContext().finish();
  t0 = tick('scene', t0);
  if (!inWorld) {
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.setViewport(0, 0, HV.w * RS, HV.h * RS);
    renderer.setScissor(0, 0, HV.w * RS, HV.h * RS); renderer.setScissorTest(true);
    renderer.render(hostScene, hostCam);
    renderer.setScissorTest(false);
  }
  renderer.getContext().finish();
  t0 = tick('host', t0);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  ctx.filter = inRewind(t) ? 'saturate(0.55) contrast(1.08) brightness(1.06)' : 'none';
  // copiar via readPixels é muito mais rápido que drawImage(canvas WebGL) sem GPU
  const gl = renderer.getContext();
  if (Q.get("tiny")) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, PIX); else gl.readPixels(0, 0, GW, GH, gl.RGBA, gl.UNSIGNED_BYTE, PIX);
  const row = GW * 4;
  for (let y = 0; y < GH; y++) FLIP.set(PIX.subarray((GH - 1 - y) * row, (GH - y) * row), y * row);
  TCTX.putImageData(IMG, 0, 0);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(TMP, 0, 0, W, H);
  ctx.filter = 'none';
  ctx.getImageData(0, 0, 1, 1);
  t0 = tick('drawImage', t0);
  const dk = dark(wt);
  if (dk > 0) { ctx.fillStyle = `rgba(12,18,45,${0.35 * dk})`; ctx.fillRect(0, 0, W, H - HV.h); }
  failOverlays(t, wt);
  if (Q.get('clean') !== '1') {
    drawArrows(t);
    drawLabels(t);
    comic(t, wt);
    overlays(t);
    drawHeader();
    drawEra(t, wt);
    drawCaption(t);
    drawChips(t);
    drawBubble(t);
  }
  ctx.getImageData(0, 0, 1, 1);
  tick('2d', t0);
}
window.setup = setup; window.draw = draw; window.sfxEvents = () => SFX;
window.prof = () => PROF; window.cues = () => C;
// Verificador: acha pares de faces no mesmo plano (z-fighting) entre caixas e planos visíveis
window.checkOverlaps = t => {
  draw(t);
  scene.updateMatrixWorld(true);
  const items = [], q = new THREE.Quaternion(), mtx = new THREE.Matrix4();
  scene.traverseVisible(o => {
    if (!o.isMesh) return;
    const isBox = o.geometry === GEO.box, isPlane = o.geometry.type === 'PlaneGeometry';
    if (!isBox && !isPlane) return;
    if (o.material.transparent && o.material.opacity < 0.5) return;
    o.getWorldQuaternion(q); const e = mtx.makeRotationFromQuaternion(q).elements;
    for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) { const v = Math.abs(e[i]); if (v > 1e-3 && Math.abs(v - 1) > 1e-3) return; }
    const b = new THREE.Box3().setFromObject(o);
    let faces;
    if (isBox) faces = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];
    else { const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q); const ax = [0, 1, 2].find(k => Math.abs(n.getComponent(k)) > 0.9); faces = [[ax, Math.sign(n.getComponent(ax))]]; }
    const c = new THREE.Vector3(); b.getCenter(c); const sz = new THREE.Vector3(); b.getSize(sz);
    items.push({ b, faces, desc: `${o.material.color ? '#' + o.material.color.getHexString() : ''} c=(${c.x.toFixed(2)},${c.y.toFixed(2)},${c.z.toFixed(2)}) s=(${sz.x.toFixed(2)},${sz.y.toFixed(2)},${sz.z.toFixed(2)})` });
  });
  const C3 = ['x', 'y', 'z'], outl = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const A = items[i], B = items[j];
    if (!A.b.intersectsBox(B.b)) continue;
    for (const [ax, sg] of A.faces) {
      if (!B.faces.some(f => f[0] === ax && f[1] === sg)) continue;
      const k = C3[ax];
      const fa = sg > 0 ? A.b.max[k] : A.b.min[k], fb = sg > 0 ? B.b.max[k] : B.b.min[k];
      if (Math.abs(fa - fb) > 1e-3) continue;
      let area = true;
      for (const o of [0, 1, 2]) {
        if (o === ax) continue; const ko = C3[o];
        if (Math.min(A.b.max[ko], B.b.max[ko]) - Math.max(A.b.min[ko], B.b.min[ko]) < 2e-3) area = false;
      }
      if (area) outl.push(`face ${sg > 0 ? '+' : '-'}${k} em ${fa.toFixed(3)} | ${A.desc} | ${B.desc}`);
    }
  }
  return { n: items.length, pairs: outl };
};
window.sceneReady = true;

