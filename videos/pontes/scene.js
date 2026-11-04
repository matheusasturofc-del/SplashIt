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


// ================================================================ medidas do mundo (1 unidade ≈ 1 metro de maquete)
const BANK_Y = 2.0;          // altura das margens = altura da pista
const GAP0 = 15, GAP1 = 25;  // meia largura do rio: normal e "rio largo"
const BED = -3;              // fundo do rio
const ERAS = [
  { id: 'inicio', label: 'NO COMEÇO' },
  { id: 'roma', label: 'ROMA ANTIGA' },
  { id: 'ferro', label: 'SÉCULO 19 · FERRO' },
  { id: 'pensil', label: 'ANOS 1930' },
  { id: 'tacoma', label: '1940 · TACOMA, EUA' },
  { id: 'hoje', label: 'HOJE' },
];

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
  // gancho: tábua vira trampolim
  C.plank0 = 0.0; C.slam = 0.25; C.walk0 = 0.4; C.brk = Math.max(2.4, wT('h2', 'trampolim'));
  C.rwH = RW(E('h2') + 0.15, 0.4);
  // viga sobre pilares
  C.piers = wT('v1', 'pilares') - 0.25; C.stone = wT('v1', 'viga') - 0.3;
  C.cart0 = S('v2') + 0.1; C.crack = wT('v2', 'racha');
  C.rwV = RW(E('v2') + 0.15, S('v2') - 0.05);
  // arco romano
  C.beamOut = S('a1') + 0.05; C.arch0 = S('a1') + 0.35; C.key = wT('a1', 'topo') - 0.2;
  C.ship0 = S('a3') + 0.1; C.bonk = Math.min(E('a3') - 0.2, wT('a3', 'barcos') + 0.3);
  C.rwA = RW(E('a3') + 0.15, S('a3') - 0.05);
  // treliça de ferro
  C.archOut = S('t1') + 0.05; C.truss0 = wT('t1', 'barras') - 0.3;
  C.train0 = S('t2') + 0.05; C.train1 = E('t2') + 0.2;
  C.wide1 = S('t3') + 0.05; C.trussFall = S('t3') + 1.0;
  C.rwT = RW(E('t3') + 0.15, S('t3') - 0.05);
  // pênsil
  C.trussOut = S('s1') + 0.05; C.wide2 = S('s1') + 0.1;
  C.towers = wT('s1', 'torres') - 0.25; C.cables = wT('s1', 'cabos') - 0.25; C.anch = wT('s1', 'blocos') - 0.3;
  C.deckS = C.cables + 0.6;
  // Tacoma
  C.wind = S('k1') + 0.2; C.fall = wT('k1', 'cair');
  C.rwK = RW(E('k1') + 0.15, S('k1') - 0.05);
  C.tunnel = wT('k2', 'túneis') - 0.2; C.stiff = wT('k2', 'rígida') - 0.3;
  C.damp = wT('k3', 'amortecedores') - 0.3;
  // estaiada
  C.cost = S('e1') + 0.15;
  C.rwE = RW(E('e1') + 0.15, S('e1') - 0.05);
  C.suspOut = S('e2') + 0.05; C.pylons = S('e2') + 0.35; C.cant0 = wT('e2', 'cabos') - 0.3; C.cant1 = wT('e3', 'aço');
  C.card = wT('e4', 'octávio') - 0.3;
  // final
  C.asphalt = wT('f1', 'asfalto') - 0.2; C.lamps = wT('f1', 'iluminação') - 0.2; C.cars = wT('f1', 'carros') - 0.3;
  C.hostWorld = S('f2') - 0.3; C.stamp = S('f2') + 0.25; C.cta = S('f3') - 0.1;
  C.eraKeys = [[0, 0], [S('a1') - 0.3, 1], [S('t1') - 0.3, 2], [S('s1') - 0.3, 3], [S('k1') - 0.3, 4], [S('e2') - 0.3, 5]];

  // ---------- câmera
  const CK = [];
  CK.push([0, [0, 6.0, 0, 44, 1.35, 0.55, 40]], [0.55, [-3, 2.6, 0, 19, 1.2, 0.3, 40], 'o'], [C.brk - 0.4, [-1, 2.4, 0, 17, 1.05, 0.26, 40]], [C.rwH.b, [-1, 2.2, 0, 18, 1.0, 0.24, 40]]);
  CK.push([C.piers + 0.6, [0, 1.0, 0, 34, 0.72, 0.2, 40]], [E('v1'), [0, 1.0, 0, 33, 0.9, 0.18, 40]]);
  CK.push([C.cart0 + 0.3, [-3.75, 2.0, 0, 15, 0.7, 0.22, 40]], [C.rwV.b, [-3.75, 2.0, 0, 15, 0.8, 0.2, 40]]);
  CK.push([C.arch0 + 0.4, [0, 0, 0, 46, 0.25, 0.16, 40]], [E('a2'), [0, 0, 0, 44, 0.4, 0.18, 40]]);
  CK.push([C.ship0 + 0.4, [0, 1.5, 6, 24, 0.3, 0.22, 40]], [C.rwA.b, [0, 1.5, 6, 24, 0.4, 0.22, 40]]);
  CK.push([C.truss0 + 0.5, [0, 3.5, 0, 42, 0.45, 0.2, 40]], [C.train0 + 0.2, [0, 3.0, 0, 30, 0.95, 0.12, 40]], [E('t2'), [0, 3.0, 0, 30, 1.05, 0.12, 40]]);
  CK.push([C.wide1 + 0.4, [0, 3.0, 0, 52, 0.7, 0.2, 40]], [C.rwT.b, [0, 3.0, 0, 52, 0.75, 0.2, 40]]);
  CK.push([C.towers + 0.6, [0, 8.0, 0, 66, 0.72, 0.18, 40]], [E('s2'), [0, 8.0, 0, 64, 0.95, 0.16, 40]]);
  CK.push([C.wind + 0.3, [0, 4.0, 0, 50, 0.9, 0.12, 40]], [C.rwK.b, [0, 4.0, 0, 50, 0.95, 0.12, 40]]);
  CK.push([C.tunnel + 0.3, [0, 3.0, 0, 26, 0.62, 0.02, 40]], [E('k3'), [0, 2.5, 0, 22, 0.35, -0.04, 40]]);
  CK.push([C.cost + 0.3, [32, 5, 0, 26, 0.55, 0.2, 40]], [C.rwE.b, [32, 5, 0, 26, 0.65, 0.2, 40]]);
  CK.push([C.pylons + 0.6, [0, 9, 0, 66, 0.8, 0.17, 40]], [C.cant1, [0, 9, 0, 62, 0.55, 0.16, 40]], [E('e4'), [0, 9, 0, 60, 0.4, 0.15, 40]]);
  CK.push([C.cars + 0.3, [-6, 3, 0, 28, 0.92, 0.1, 40]], [C.hostWorld, [-6, 3, 0, 28, 1.0, 0.1, 40]]);
  CK.push([C.hostWorld + 0.9, [14, 9, 0, 50, 1.15, 0.12, 42]], [TL.duration, [14, 9, 0, 51, 1.22, 0.14, 42]]);
  C.camKeys = sortK(CK);

  C.shakes = [[C.slam, 0.35], [C.brk, 0.15], [C.crack, 0.15], [C.bonk, 0.2], [C.trussFall + 0.8, 0.3], [C.fall + 0.8, 0.4], [C.stamp + 0.18, 0.25]];

  // ---------- reações do mestre de obras
  const Rx = (t, d, e, p, b) => REACT.push({ t, d, e, p, b });
  Rx(C.brk - 0.2, C.rwH.a - C.brk + 0.2, 'shock', 'up', 'Splash!');
  Rx(E('v1') - 1.0, 1.0, 'happy', 'thumbs', null);
  Rx(C.crack, C.rwV.a - C.crack, 'shock', 'cheeks', 'Crack!');
  Rx(E('a2') - 1.0, 1.0, 'happy', 'thumbs', null);
  Rx(C.bonk, C.rwA.a - C.bonk, 'wince', 'cheeks', 'Ai!');
  Rx(E('t2') - 1.0, 1.0, 'happy', 'thumbs', null);
  Rx(C.trussFall, C.rwT.a - C.trussFall, 'shock', 'up', 'Não!');
  Rx(E('s2') - 0.8, 1.0, 'happy', 'thumbs', null);
  Rx(C.wind + 0.6, C.rwK.a - C.wind - 0.6, 'shock', 'cheeks', 'Tá dançando!');
  Rx(E('k3') - 1.0, 1.0, 'relieved', 'wipe', 'Ufa!');
  Rx(C.cost + 0.4, C.rwE.a - C.cost - 0.4, 'worried', 'wipe', 'Que caro!');
  Rx(E('e3') - 1.0, 1.0, 'happy', 'thumbs', null);
  Rx(C.stamp + 0.15, 2.4, 'happy', 'cheer', 'Uhuul!');
  Rx(C.cta, TL.duration - C.cta, 'happy', 'point', null);
  for (const r of C.REW) Rx(r.a, r.b - r.a, 'worried', 'point', 'Volta!');
  REACT.sort((a, b) => a.t - b.t);

  // ---------- etiquetas
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const Lb = (txt, t0, t1, at, off) => { LABELS.push({ txt, t0, t1, at, off }); CHIPS.push({ txt, t: t0 }); };
  Lb('VIGA', wT('v1', 'viga'), E('v1') + 0.3, () => V(-3.75, 1.8, 1.2), [-60, -260]);
  Lb('ARCO', wT('a2', 'arco'), E('a2') + 0.3, () => V(-3.75, 1.2, 1.2), [-40, -300]);
  Lb('TRELIÇA', wT('t2', 'treliça'), E('t2') + 0.3, () => V(-4, 5.0, 1.3), [-40, -260]);
  Lb('PÊNSIL', wT('s2', 'pênsil'), E('s2') + 0.3, () => V(-8, 11, 1.5), [-60, -260]);
  Lb('AMORTECEDORES', wT('k3', 'amortecedores'), E('k3') + 0.3, () => V(0, 1.2, 0), [200, -330]);
  Lb('ESTAIADA', wT('e3', 'estaiada'), E('e4') + 0.2, () => V(-12, 15, 0), [80, -260]);

  // ---------- setas
  const Ar = (t0, t1, at, dir, len, col, kind = 'line') => ARROWS.push({ t0, t1, at, dir: new THREE.Vector3(...dir), len, col, kind });
  const RED = '#ff4d3d', BLUE = '#4d9bff', YEL = '#ffd23f', GREEN = '#2ecc71';
  Ar(C.walk0 + 0.8, C.brk, () => V(0, 4.2, 0), [0, -1, 0], 1.5, RED);
  Ar(C.cart0 + 0.5, C.crack, () => V(-3.75, 4.5, 0), [0, -1, 0], 1.5, RED);
  Ar(C.key - 0.1, C.key + 1.2, () => V(-11.25, 4.4, 1.2), [0, -1, 0], 1.6, YEL);
  Ar(wT('a1', 'empurrando') - 0.2, C.key, () => V(-13.2, 0.6, 1.3), [1, 0.6, 0], 1.6, GREEN);
  Ar(wT('a1', 'empurrando') - 0.2, C.key, () => V(-9.3, 0.6, 1.3), [-1, 0.6, 0], 1.6, GREEN);
  for (const z of [-6, 0, 6]) Ar(C.wind, C.fall, () => V(-30, 4, z), [1, 0, 0], 4, BLUE);
  Ar(C.cost + 0.3, C.rwE.a, () => V(32, 9.5, 0), [0, -1, 0], 2.5, RED);
  Ar(C.cant0 + 0.3, C.cant1, () => V(-12, 2.6, 3), [-1, 0, 0], 3, GREEN);
  Ar(C.cant0 + 0.3, C.cant1, () => V(-12, 2.6, 3), [1, 0, 0], 3, GREEN);

  // ---------- efeitos sonoros
  sfx(0.0, 'whoosh', 0.8); sfx(C.slam, 'crash', 0.8); sfx(C.slam + 0.05, 'thud', 0.9);
  for (let k = 0; k < 6; k++) { const tb = C.walk0 + 0.15 + k * Math.max(0.3, (C.brk - C.walk0 - 0.4) / 6); if (tb < C.brk - 0.3) sfx(tb, 'bonk', 0.45 + k * 0.06); }
  sfx(C.brk - 0.5, 'creak', 0.7); sfx(C.brk, 'snap', 1.0); sfx(C.brk + 0.55, 'crash', 0.6);
  asmSfx(C.piers, 1.0, 3, 'thud', 0.6); sfx(C.stone + 0.3, 'clank', 0.6);
  sfx(C.cart0, 'slide', 0.4, C.crack - C.cart0); sfx(C.crack - 0.4, 'creak', 0.6); sfx(C.crack, 'snap', 1.0); sfx(C.crack + 0.5, 'crash', 0.6);
  sfx(C.beamOut, 'whoosh', 0.6); asmSfx(C.arch0, C.key - C.arch0, 10, 'clank', 0.35); sfx(C.key + 0.4, 'clac', 0.9);
  sfx(C.ship0, 'hum', 0.25, C.bonk - C.ship0); sfx(C.bonk, 'bonk', 1.0);
  sfx(C.archOut, 'whoosh', 0.6); asmSfx(C.truss0, 2.4, 10, 'clank', 0.4);
  sfx(C.train0, 'hum', 0.45, C.train1 - C.train0); sfx(C.train0 + 0.2, 'alarm', 0.3);
  sfx(C.wide1, 'slide', 0.5, 1.0); sfx(C.trussFall, 'creak', 0.7); sfx(C.trussFall + 0.8, 'crash', 1.0);
  sfx(C.trussOut, 'whoosh', 0.6); sfx(C.towers, 'powerup', 0.4); asmSfx(C.towers, 1.0, 4, 'clank', 0.5);
  sfx(C.cables, 'zip', 0.6); sfx(C.anch + 0.3, 'thud', 0.8); asmSfx(C.deckS, 2.0, 8, 'clank', 0.35);
  sfx(C.wind, 'whoosh', 0.7, 0); sfx(C.wind + 0.2, 'strain', 0.4, C.fall - C.wind); sfx(C.fall, 'snap', 1.0); sfx(C.fall + 0.9, 'crash', 1.0);
  sfx(C.tunnel, 'whoosh', 0.5); asmSfx(C.stiff, 1.2, 6, 'clank', 0.4); asmSfx(C.damp, 0.8, 3, 'pop', 0.5);
  sfx(C.cost + 0.2, 'alarm', 0.4); asmSfx(C.cost + 0.3, 1.2, 5, 'pop', 0.35);
  sfx(C.suspOut, 'whoosh', 0.7); sfx(C.pylons, 'powerup', 0.4); asmSfx(C.cant0, C.cant1 - C.cant0, 12, 'clank', 0.32);
  sfx(C.card, 'pop', 0.6);
  sfx(C.asphalt, 'slide', 0.4, 0.6); asmSfx(C.lamps, 0.8, 5, 'pop', 0.35); sfx(C.cars, 'hum', 0.3, 3);
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
const dark = () => 0;
const eraIndex = t => { let k = 0; for (const [a, v] of C.eraKeys) if (t >= a) k = v; return k; };
// meia largura do rio
function gapAt(t) {
  if (t >= C.wide2) return lerp(GAP0, GAP1, EZ.io(P(t, C.wide2, 1.2)));
  if (between(t, C.wide1, C.rwT.a)) return lerp(GAP0, GAP1, EZ.io(P(t, C.wide1, 1.0)));
  return GAP0;
}

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
const camera = new THREE.PerspectiveCamera(38, W / H, 0.3, 400);

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
function buildWorld() {
  // fundo do rio, margens e água
  boxC(-120, BED - 2, -80, 120, BED, 80, M('#6b5a44'));
  const grass = M('#6cbf5a', { roughness: 0.9 }), dirt = M('#8a6a48');
  R.bankL = grp(null); R.bankR = grp(null);
  boxC(-100, BED, -80, 0, BANK_Y - 0.4, 80, dirt, R.bankL); boxC(-100, BANK_Y - 0.4, -80, 0, BANK_Y, 80, grass, R.bankL);
  boxC(0, BED, -80, 100, BANK_Y - 0.4, 80, dirt, R.bankR); boxC(0, BANK_Y - 0.4, -80, 100, BANK_Y, 80, grass, R.bankR);
  const wt = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#2f86c9'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3; for (let i = 0; i < 18; i++) { const y = rnd(i) * h, x = rnd(i + 5) * w; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 20, y - 6, x + 40, y); g.stroke(); } });
  wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(4, 12);
  R.water = new THREE.Mesh(new THREE.PlaneGeometry(1, 160), new THREE.MeshStandardMaterial({ map: wt, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.92 }));
  R.water.rotation.x = -Math.PI / 2; R.water.position.y = 0; scene.add(R.water);
  // árvores e morros ao fundo
  const tree = (x, z, s, parent) => { const t = grp(parent, x, BANK_Y, z); const bt = 0.3 + 0.4 * rnd(x * 7.3 + z * 1.7); box(0.4 * s, 2 * s + bt, 0.4 * s, M('#7a5232'), 0, s - bt / 2, 0, t); sph(1.3 * s, M('#3f9a4a'), 0, 2.6 * s, 0, t); sph(1.0 * s, M('#4caf50'), 0.6 * s, 3.2 * s, 0.3 * s, t); };
  for (let i = 0; i < 10; i++) { tree(-6 - rnd(i) * 30, -12 - rnd(i + 3) * 30, 0.8 + rnd(i + 7) * 0.7, R.bankL); tree(6 + rnd(i + 11) * 30, -12 - rnd(i + 13) * 30, 0.8 + rnd(i + 17) * 0.7, R.bankR); }
  for (let i = 0; i < 6; i++) { const h = sph(1, M(i % 2 ? '#5aa35a' : '#4e9150', { roughness: 1 }), -90 + i * 36, BANK_Y, -95 - rnd(i) * 20); h.scale.set(30, 14 + rnd(i + 2) * 10, 16); }
}
// ---------- 1. tábua e pessoa
function buildPlank() {
  R.plankSegs = [];
  const N = 12, L = 33 / N;
  const g = grp(null); R.plank = g;
  for (let i = 0; i < N; i++) R.plankSegs.push(box(L, 0.35, 1.6, M('#b07a46', { roughness: 0.7 }), -16.5 + L * (i + 0.5), BANK_Y + 0.175, 0, g));
  R.walker = person('#e76f51'); scene.add(R.walker);
}
// ---------- 2. viga sobre pilares
function buildBeam() {
  const stone = M('#a9a39a', { roughness: 0.85 });
  R.piers = grp(null);
  for (const x of [-7.5, 0, 7.5]) asm(boxC(x - 0.8, BED, -1.2, x + 0.8, 1.6, 1.2, stone, R.piers), () => C.piers + (x + 7.5) * 0.04, 0.6, { dy: -6, s: 0.6 });
  R.beam = grp(null);
  R.spans = [[-15, -7.5], [-7.5, -3.75], [-3.75, 0], [0, 7.5], [7.5, 15]].map(([a, b], i) => {
    const m = boxC(a, 1.6, -1.1, b, BANK_Y, 1.1, M('#c7c0b4', { roughness: 0.8 }), R.beam);
    asm(m, () => C.stone + i * 0.08, 0.45, { dy: 4, rz: 0.5, s: 0.6 });
    return m;
  });
  R.cart = grp(null);
  boxC(-0.9, 0.35, -0.6, 0.9, 1.1, 0.6, M('#7a5232'), R.cart);
  for (const [x, z] of [[-0.6, -0.65], [0.6, -0.65], [-0.6, 0.65], [0.6, 0.65]]) cylZ(0.35, 0.12, M('#3b2a22'), x, 0.35, z, R.cart);
  for (let k = 0; k < 4; k++) sph(0.32, M('#8d939c'), -0.5 + k * 0.33, 1.3, 0, R.cart);
}
// ---------- 3. arcos romanos
const ARCHES = [[-15, -8.3], [-6.7, -0.8], [0.8, 6.7], [8.3, 15]];
function buildArch() {
  R.arch = grp(null);
  const st = M('#c9b48a', { roughness: 0.85 }), key = M('#e0c27a', { roughness: 0.6 });
  R.vous = [];
  ARCHES.forEach(([x0, x1], ai) => {
    const r = (x1 - x0) / 2, cx = (x0 + x1) / 2, sy = 0.9 - r, n = 13;
    for (let k = 0; k < n; k++) {
      const a = Math.PI - (k + 0.5) * Math.PI / n;
      const m = mesh(GEO.box, k === (n - 1) / 2 ? key : st);
      m.scale.set(0.55, (Math.PI * (r + 0.27) / n) * 0.96, 2.2);
      m.position.set(cx + Math.cos(a) * (r + 0.27), sy + Math.sin(a) * (r + 0.27), 0);
      m.rotation.z = a; R.arch.add(m);
      const order = Math.min(k, n - 1 - k), isKey = k === (n - 1) / 2;
      asm(m, () => (isKey ? C.key : C.arch0 + ai * 0.12 + order * ((C.key - C.arch0 - 0.6) / 6)), isKey ? 0.5 : 0.4, { dy: isKey ? 8 : 5, rz: 1.5, s: 0.5 });
      R.vous.push(m);
    }
  });
  R.archDeck = grp(R.arch);
  boxC(-15, 1.6, -1.1, 15, BANK_Y, 1.1, M('#d6c39a', { roughness: 0.8 }), R.archDeck);
  for (const z of [-1, 1]) boxC(-15, BANK_Y, z > 0 ? 0.9 : -1.1, 15, BANK_Y + 0.45, z > 0 ? 1.1 : -0.9, M('#c9b48a'), R.archDeck);
  asm(R.archDeck, () => C.key + 0.5, 0.6, { dy: 4, s: 0.7 });
  // barco à vela
  R.ship = grp(null);
  boxC(-1.0, -0.4, -3.2, 1.0, 0.8, 3.2, M('#8b5a33'), R.ship);
  boxC(-0.85, 0.8, -2.6, 0.85, 1.0, 2.6, M('#a77749'), R.ship);
  R.mast = grp(R.ship, 0, 1.0, 0.4);
  const mm = mesh(GEO.cyl, M('#5a3d22')); mm.scale.set(0.1, 7, 0.1); mm.position.y = 3.5; R.mast.add(mm);
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 4.2), new THREE.MeshStandardMaterial({ color: '#f4efe2', side: THREE.DoubleSide })); sail.position.set(0, 4.0, 0.12); sail.rotation.y = Math.PI / 2; R.mast.add(sail);
}
// ---------- 4. treliça de ferro e trem
function buildTruss() {
  R.truss = grp(null);
  const iron = M('#8a3324', { roughness: 0.5, metalness: 0.4 });
  const parts = [];
  for (const z of [-1.3, 1.3]) {
    const P_ = (x, y) => V3(x, y, z);
    parts.push([P_(-15, 2), P_(15, 2)], [P_(-12, 6), P_(12, 6)], [P_(-15, 2), P_(-12, 6)], [P_(15, 2), P_(12, 6)]);
    for (let x = -12; x <= 12; x += 3) parts.push([P_(x, 2), P_(x, 6)]);
    for (let x = -12; x < 12; x += 3) parts.push(x < 0 ? [P_(x, 6), P_(x + 3, 2)] : [P_(x, 2), P_(x + 3, 6)]);
  }
  for (let x = -12; x <= 12; x += 3) parts.push([V3(x, 6, -1.3), V3(x, 6, 1.3)]);
  parts.forEach(([a, b], i) => { const m = member(R.truss, a, b, 0.11, iron); asm(m, () => C.truss0 + (i % 23) * 0.09, 0.4, { dy: 4, rz: 1, s: 0.3 }); });
  const dk = boxC(-15, 1.7, -1.25, 15, BANK_Y, 1.25, M('#4a4f58'), R.truss);
  asm(dk, () => C.truss0, 0.5, { dy: 3, s: 0.6 });
  for (const z of [-0.5, 0.5]) boxC(-15, BANK_Y, z - 0.06, 15, BANK_Y + 0.1, z + 0.06, M('#9aa3b1', { metalness: 0.6 }), R.truss);
  // trem
  R.train = grp(null);
  const loco = grp(R.train, 0, 0, 0);
  boxC(-1.6, 0.1, -0.7, 1.6, 0.5, 0.7, M('#222'), loco);
  const boiler = mesh(GEO.cyl, M('#2b2f39', { metalness: 0.4 })); boiler.scale.set(0.6, 2.2, 0.6); boiler.rotation.z = Math.PI / 2; boiler.position.set(0.3, 1.1, 0); loco.add(boiler);
  boxC(-1.6, 0.5, -0.7, -0.6, 2.0, 0.7, M('#c0392b'), loco);
  const ch = mesh(GEO.cyl, M('#222')); ch.scale.set(0.2, 0.7, 0.2); ch.position.set(1.0, 1.9, 0); loco.add(ch);
  for (let k = 1; k <= 2; k++) { const car = grp(R.train, -3.6 * k, 0, 0); boxC(-1.6, 0.1, -0.7, 1.6, 1.6, 0.7, M(k % 2 ? '#2a9d8f' : '#e9a23b'), car); }
}
// ---------- 5. ponte pênsil (Tacoma)
const SEG = 25, SEGL = 2;
function buildSuspension() {
  R.susp = grp(null);
  const tw = M('#c0392b', { roughness: 0.5, metalness: 0.3 }), conc = M('#9aa0a8', { roughness: 0.8 });
  R.towers = [];
  for (const x of [-18, 18]) {
    const t = grp(R.susp);
    boxC(x - 1.2, BED, -3.2, x + 1.2, 0.5, 3.2, conc, t);
    for (const z of [-2.6, 2.6]) boxC(x - 0.35, 0.5, z - 0.3, x + 0.35, 22, z + 0.3, tw, t);
    for (const y of [11.5, 21.0]) boxC(x - 0.3, y, -2.3, x + 0.3, y + 0.8, 2.3, tw, t);
    asm(t, () => C.towers + (x > 0 ? 0.3 : 0), 0.9, { dy: -24, s: 1 });
    R.towers.push(t);
  }
  R.anchors = [];
  for (const s of [-1, 1]) { const a = boxC(s > 0 ? 33 : -39, BANK_Y, -3.4, s > 0 ? 39 : -33, 7, 3.4, conc, R.susp); asm(a, () => C.anch, 0.6, { dy: 8, s: 0.4 }); R.anchors.push(a); }
  R.deck = [];
  for (let i = 0; i < SEG; i++) {
    const x0 = -25 + i * SEGL;
    const g = grp(R.susp, x0 + SEGL / 2, 0, 0);
    boxC(-SEGL / 2, 1.5, -2.2, SEGL / 2, BANK_Y, 2.2, M('#d8d4cc', { roughness: 0.7 }), g);
    const order = Math.abs(i - (SEG - 1) / 2);
    asm(g, () => C.deckS + order * 0.12, 0.45, { dy: -6, s: 0.6 });
    R.deck.push(g);
  }
  R.cablesS = [-2.6, 2.6].map(() => cylPool(48, 0.16, M('#e0e3e8', { metalness: 0.6, roughness: 0.3 })));
  R.hangers = cylPool(SEG * 2, 0.05, M('#cfd4dc', { metalness: 0.5 }));
  // reforço contra o vento (treliça sob a pista) e amortecedores
  R.stiff = grp(R.susp);
  const st = M('#5d6675', { metalness: 0.4 });
  for (const z of [-2.0, 2.0]) for (let i = 0; i < SEG; i++) { const x = -25 + i * SEGL; member(R.stiff, V3(x, 1.5, z), V3(x + SEGL, 0.5, z), 0.07, st); member(R.stiff, V3(x, 0.5, z), V3(x + SEGL, 0.5, z), 0.07, st); }
  asm(R.stiff, () => C.stiff, 0.9, { dy: -4, s: 0.8 });
  R.dampers = grp(R.susp);
  for (const x of [-5, 0, 5]) { const d = grp(R.dampers, x, 0, 0); boxC(-0.5, -0.3, -0.5, 0.5, 0.35, 0.5, M('#ffd23f'), d); const sp = mesh(GEO.cyl, M('#444')); sp.scale.set(0.12, 1.1, 0.12); sp.position.y = 0.9; d.add(sp); }
  asm(R.dampers, () => C.damp, 0.6, { dy: -4, s: 0.3 });
}
function cableY(x) { // cabo principal: blocos (±36, 6.5) → torres (±18, 22) → meio (0, 5)
  const ax = Math.abs(x);
  if (ax <= 18) return 5 + (22 - 5) * (ax / 18) ** 2;
  return lerp(22, 6.5, (ax - 18) / 18);
}
// ---------- 6. ponte estaiada
function buildStayed() {
  R.stay = grp(null);
  const tw = M('#eef0f3', { roughness: 0.4 }), conc = M('#9aa0a8', { roughness: 0.8 });
  R.pylons = [];
  for (const x of [-13, 13]) {
    const t = grp(R.stay);
    boxC(x - 1.2, BED, -3.2, x + 1.2, 0.5, 3.2, conc, t);
    for (const z of [-2.6, 2.6]) boxC(x - 0.4, 0.5, z - 0.3, x + 0.4, 24, z + 0.3, tw, t);
    boxC(x - 0.35, 24, -2.9, x + 0.35, 25, 2.9, tw, t);
    boxC(x - 0.35, 0.5, -2.3, x + 0.35, 1.3, 2.3, tw, t);
    asm(t, () => C.pylons + (x > 0 ? 0.3 : 0), 0.9, { dy: -26, s: 1 });
    R.pylons.push(t);
  }
  // ordem de montagem em balanço: a partir de cada torre, para os dois lados; fecho no meio
  const segs = [];
  for (let i = 0; i < SEG; i++) {
    const xc = -25 + i * SEGL + SEGL / 2;
    const px = xc < 0 ? -13 : 13;
    const isClose = Math.abs(xc) < 1;
    const ring = isClose ? 7 : Math.ceil(Math.abs(xc - px) / SEGL);
    segs.push({ i, xc, px, ring, isClose });
  }
  const T0 = () => C.cant0, DT = () => (C.cant1 - C.cant0) / 8;
  R.stDeck = segs.map(sg => {
    const g = grp(R.stay, sg.xc, 0, 0);
    boxC(-SEGL / 2, 1.5, -2.2, SEGL / 2, BANK_Y, 2.2, M('#d8d4cc', { roughness: 0.7 }), g);
    asm(g, () => T0() + sg.ring * DT() + (sg.xc > sg.px ? 0.07 : 0), 0.4, { dy: -5, s: 0.6 });
    return g;
  });
  R.stays = [];
  segs.filter(sg => !sg.isClose && sg.ring >= 1).forEach(sg => {
    for (const z of [-2.6, 2.6]) {
      const top = V3(sg.px, 23.5 - sg.ring * 1.1, z), end = V3(sg.xc + Math.sign(sg.xc - sg.px) * SEGL / 2, BANK_Y + 0.02, z * 0.85);
      const m = member(R.stay, top, end, 0.07, M('#f2c94c', { metalness: 0.5, roughness: 0.3 }));
      asm(m, () => T0() + sg.ring * DT() + 0.25, 0.35, { dy: 0, s: 0.01 });
      R.stays.push(m);
    }
  });
  // acabamento: asfalto, postes, carros
  R.asphalt = grp(R.stay);
  boxC(-25, BANK_Y, -2.0, 25, BANK_Y + 0.05, 2.0, M('#2f3238', { roughness: 0.9 }), R.asphalt);
  for (let x = -24; x < 25; x += 3) boxC(x, BANK_Y + 0.05, -0.08, x + 1.4, BANK_Y + 0.06, 0.08, M('#f5f5f5'), R.asphalt);
  asm(R.asphalt, () => C.asphalt, 0.6, { dy: 3, s: 0.9 });
  R.lamps = [];
  for (let x = -22; x <= 22; x += 6) for (const z of [-2.05, 2.05]) {
    const l = grp(R.stay, x, BANK_Y + 0.05, z);
    const p = mesh(GEO.cyl, M('#5d6675')); p.scale.set(0.06, 2.4, 0.06); p.position.y = 1.2; l.add(p);
    sph(0.18, new THREE.MeshStandardMaterial({ color: '#fff6d0', emissive: '#ffd36b', emissiveIntensity: 1.6 }), 0, 2.45, 0, l);
    asm(l, () => C.lamps + (x + 22) * 0.02, 0.4, { dy: 3, s: 0.2 });
    R.lamps.push(l);
  }
  R.carList = [];
  const cols = ['#e63946', '#4d7cfe', '#ffd23f', '#2a9d8f', '#ff8a2a', '#8e5bd1'];
  for (let k = 0; k < 6; k++) {
    const c = grp(null);
    boxC(-0.9, 0.12, -0.45, 0.9, 0.6, 0.45, M(cols[k]), c);
    boxC(-0.5, 0.6, -0.4, 0.4, 0.95, 0.4, M('#bfe3f7', { metalness: 0.3, roughness: 0.2 }), c);
    for (const [x, z] of [[-0.55, -0.47], [0.55, -0.47], [-0.55, 0.47], [0.55, 0.47]]) cylZ(0.2, 0.06, M('#111'), x, 0.2, z, c);
    c.userData = { lane: k % 2 ? 1.0 : -1.0, off: k * 9 };
    R.carList.push(c);
  }
}
function buildParticles() {
  R.splash = []; for (let i = 0; i < 60; i++) { const m = mesh(GEO.sph, new THREE.MeshStandardMaterial({ color: '#cfe9ff', transparent: true, opacity: 0.8, depthWrite: false }), false); m.visible = false; scene.add(m); R.splash.push(m); }
  R.dust = []; for (let i = 0; i < 30; i++) { const m = mesh(GEO.sph, new THREE.MeshStandardMaterial({ color: '#b39a7a', transparent: true, opacity: 0.7, depthWrite: false }), false); m.visible = false; scene.add(m); R.dust.push(m); }
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
  point: [0.1, -0.25, -1.2, 1.4], cheer: [0, -2.6, 0, 2.6],
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
function flyOut(g, t, t0, dir = 1, reset = true) {
  if (reset) {
    const b = g.userData.base ??= { p: g.position.clone(), r: g.rotation.clone() };
    g.position.copy(b.p); g.rotation.copy(b.r);
  }
  g.scale.setScalar(1);
  const k = P(t, t0, 0.6);
  if (k <= 0) return true;
  g.position.y += 25 * EZ.i2(k); g.rotation.z += dir * 0.8 * k; g.scale.setScalar(Math.max(0.001, 1 - k));
  return k < 1;
}
function updateWorld(t) {
  applyAsm(t);
  // rio: largura e correnteza
  const gap = gapAt(t);
  R.bankL.position.x = GAP0 - gap; R.bankR.position.x = gap - GAP0;
  R.bankL.position.x -= GAP0; R.bankR.position.x += GAP0;
  R.water.scale.x = 2 * gap; R.water.material.map.offset.y = -t * 0.05;
  updatePlank(t);
  updateBeam(t);
  updateArch(t);
  updateTruss(t, gap);
  updateSuspension(t);
  updateStayed(t);
  updateParticles(t);
}
function updatePlank(t) {
  const segs = R.plankSegs, N = segs.length, L = 33 / N;
  const drop = 1 - EZ.i2(P(t, C.plank0, C.slam - C.plank0));
  R.plank.position.set(0, 14 * drop, 0); R.plank.rotation.set(0, 1.2 * drop, 0);
  R.plank.visible = flyOut(R.plank, t, C.stone - 0.45, 1, false);
  const broken = between(t, C.brk, C.rwH.a);
  const th = broken ? 1.25 * EZ.i2(P(t, C.brk, 0.45)) : 0;
  // trampolim: quanto mais perto do meio, mais a tábua enverga e quica
  const wx = lerp(-8, 0, EZ.io(P(t, C.walk0, C.brk - C.walk0 - 0.1)));
  const grow = P(t, C.walk0, C.brk - C.walk0);
  const bounce = between(t, C.walk0, C.brk) ? Math.abs(Math.sin((t - C.walk0) * 7)) : 0;
  const A = (between(t, C.walk0, C.brk) ? 1 : 0) * (0.25 + 1.6 * grow) * (0.4 + 0.6 * bounce) * (1 - Math.abs(wx) / 16.5) + (t > C.slam && t < C.slam + 0.5 ? 0.6 * Math.sin((t - C.slam) * 25) * (1 - P(t, C.slam, 0.5)) : 0);
  const sag = x => -A * (1 - (x / 16.5) ** 2);
  segs.forEach((m, i) => {
    const xc = -16.5 + L * (i + 0.5);
    if (broken) {
      const sgn = xc < 0 ? -1 : 1, pivot = sgn * 15, rel = xc - pivot;
      const a = -sgn * th;
      m.position.set(pivot + rel * Math.cos(a), BANK_Y + 0.175 + rel * Math.sin(a), 0);
      m.rotation.set(0, 0, a);
    } else {
      m.position.set(xc, BANK_Y + 0.175 + sag(xc), 0);
      m.rotation.set(0, 0, Math.atan(2 * A * xc / 16.5 ** 2));
    }
  });
  // pessoa andando e quicando
  const w = R.walker;
  w.visible = between(t, C.walk0, C.rwH.a);
  if (w.visible) {
    let y = BANK_Y + 0.35 + sag(wx) + bounce * 1.6 * grow;
    let x = wx;
    if (broken) { const k = P(t, C.brk, 0.7); y = lerp(BANK_Y + 0.35, -2.5, EZ.i2(k)); x = wx; w.rotation.z = 2 * k; }
    else w.rotation.z = 0;
    w.position.set(x, y, 0); w.rotation.y = Math.PI / 2;
  }
}
function updateBeam(t) {
  R.piers.visible = t >= C.piers && flyOut(R.piers, t, C.archOut + 0.2, -1);
  R.beam.visible = t >= C.stone && flyOut(R.beam, t, C.beamOut);
  // viga do meio racha com o peso da carroça
  const cracked = between(t, C.crack, C.rwV.a);
  const th = cracked ? 0.9 * EZ.i2(P(t, C.crack, 0.4)) : 0;
  const [, sL, sR] = R.spans;
  if (t >= C.stone + 0.6 && t < C.beamOut) {
    if (cracked) {
      const rot = (m, px, sgn) => { const rel = m.position.x - px; const a = -sgn * th; m.position.set(px + rel * Math.cos(a), 1.8 + rel * Math.sin(a), 0); m.rotation.z = a; };
      rot(sL, -7.5, 1); rot(sR, 0, -1);
    }
  }
  const c = R.cart;
  c.visible = between(t, C.cart0, C.rwV.a);
  if (c.visible) {
    const x = lerp(-24, -3.75, EZ.o(P(t, C.cart0, C.crack - C.cart0)));
    const fall = cracked ? EZ.i2(P(t, C.crack, 0.6)) : 0;
    c.position.set(x, BANK_Y - fall * 4.5, 0); c.rotation.z = fall * 0.8;
  }
}
function updateArch(t) {
  R.arch.visible = t >= C.arch0 && flyOut(R.arch, t, C.archOut);
  const s = R.ship;
  s.visible = between(t, C.ship0, C.rwA.a);
  if (s.visible) {
    const z = lerp(32, 4.3, EZ.o(P(t, C.ship0, C.bonk - C.ship0)));
    const hit = t > C.bonk ? Math.exp(-(t - C.bonk) * 3) : 0;
    s.position.set(-3.75, 0, z + hit * 0.8 * Math.sin((t - C.bonk) * 14));
    s.rotation.set(0.05 * Math.sin(t * 2), 0, 0);
    R.mast.rotation.x = t > C.bonk ? 0.35 * EZ.back(P(t, C.bonk, 0.4)) : 0;
  }
}
function updateTruss(t, gap) {
  R.truss.visible = t >= C.truss0 && flyOut(R.truss, t, C.trussOut);
  if (between(t, C.trussFall, C.rwT.a)) {
    const k = EZ.i2(P(t, C.trussFall, 0.8));
    R.truss.position.y = -6 * k; R.truss.rotation.z = 0.25 * k * Math.sin(1.5);
  } else if (t < C.trussOut) { R.truss.position.y = 0; R.truss.rotation.z = 0; }
  const tr = R.train;
  tr.visible = between(t, C.train0, C.train1);
  if (tr.visible) tr.position.set(lerp(-34, 34, P(t, C.train0, C.train1 - C.train0)), BANK_Y + 0.1, 0);
}
function updateSuspension(t) {
  const on = t >= C.towers && flyOut(R.susp, t, C.suspOut);
  R.susp.visible = on;
  // Tacoma: a pista torce e ondula até cair
  const osc = between(t, C.wind, C.rwK.a);
  const A = osc ? 0.55 * EZ.i2(P(t, C.wind, C.fall - C.wind)) : 0;
  const fallen = between(t, C.fall, C.rwK.a);
  const deckPos = [];
  R.deck.forEach((g, i) => {
    const xc = -25 + i * SEGL + SEGL / 2;
    const env = Math.sin(Math.PI * (xc + 25) / 50);
    let tw = A * env * Math.sin((t - C.wind) * 6.5 + xc * 0.15);
    let y = A * 1.5 * env * Math.sin((t - C.wind) * 4 + xc * 0.2);
    if (fallen && Math.abs(xc) < 11) { const k = P(t, C.fall + Math.abs(xc) * 0.03, 0.9); y -= 9 * EZ.i2(k); tw += 1.2 * k; }
    if (osc || fallen) { g.position.y = y; g.rotation.x = tw; }
    else if (t >= C.deckS + 3) { g.position.y = 0; g.rotation.x = 0; }
    deckPos.push({ xc, y: (osc || fallen) ? y : g.position.y, tw: (osc || fallen) ? tw : 0, down: fallen && Math.abs(xc) < 11 });
  });
  // cabos principais e pendurais
  const grow = EZ.o(P(t, C.cables, 1.2));
  R.cablesS.forEach((pool, ci) => {
    const z = ci ? 2.6 : -2.6;
    if (!on || grow <= 0) { drawPoly(pool, [], 0); return; }
    const pts = []; for (let x = -36; x <= 36.01; x += 1.5) pts.push(V3(x, cableY(x), z));
    drawPoly(pool, pts, grow);
  });
  let hk = 0;
  if (on && t >= C.deckS) {
    deckPos.forEach(d => {
      if (Math.abs(d.xc) > 17 || t < C.deckS + Math.abs(d.xc) * 0.012 * 10 || d.down) return;
      for (const z of [-2.6, 2.6]) {
        const m = R.hangers.pool[hk++]; if (!m) return;
        const topY = cableY(d.xc), botY = BANK_Y + d.y + Math.sin(d.tw) * z * 0.85;
        const a = V3(d.xc, topY, z), b = V3(d.xc, botY, z * 0.85);
        const l = a.distanceTo(b); m.visible = true; m.scale.set(0.05, l, 0.05);
        m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(_up, b.clone().sub(a).normalize());
      }
    });
  }
  for (; hk < R.hangers.pool.length; hk++) R.hangers.pool[hk].visible = false;
}
function updateStayed(t) {
  R.stay.visible = t >= C.pylons;
  // carros atravessando no final
  R.carList.forEach((c, k) => {
    c.visible = t >= C.cars;
    if (!c.visible) return;
    const u = c.userData, dir = u.lane > 0 ? 1 : -1;
    const x = ((((t - C.cars) * 7 + u.off) % 70) + 70) % 70 - 35;
    c.position.set(dir > 0 ? x : -x, BANK_Y + 0.05, u.lane); c.rotation.y = dir > 0 ? 0 : Math.PI;
    c.scale.setScalar(EZ.back(P(t, C.cars + k * 0.15, 0.4)));
  });
}
function burstPts(t, t0, origin, n, pool, offset, opt) {
  const a = t - t0; if (a < 0 || a > opt.life) return offset;
  for (let i = 0; i < n && offset < pool.length; i++, offset++) {
    const m = pool[offset];
    const ang = rnd(i + opt.seed) * Math.PI * 2, el = 0.6 + rnd(i + opt.seed + 9) * 0.9, v = opt.spd * (0.4 + rnd(i + opt.seed + 50) * 0.8);
    m.visible = true;
    m.position.set(origin.x + Math.cos(ang) * Math.cos(el) * v * a, origin.y + Math.sin(el) * v * a - opt.g * a * a, origin.z + Math.sin(ang) * Math.cos(el) * v * a);
    m.scale.setScalar(opt.size * (1 - a / opt.life * 0.5));
    m.material.opacity = 0.8 * (1 - a / opt.life);
  }
  return offset;
}
function updateParticles(t) {
  R.splash.forEach(m => (m.visible = false));
  let s = 0;
  const sp = (t0, x, z, n, seed) => { s = burstPts(t, t0, V3(x, 0.1, z), n, R.splash, s, { life: 1.0, spd: 9, g: 12, size: 0.35, seed }); };
  sp(C.brk + 0.45, 0, 0, 14, 1);
  sp(C.crack + 0.45, -3.75, 0, 10, 31);
  sp(C.trussFall + 0.6, 0, 0, 16, 61);
  sp(C.fall + 0.75, 0, 0, 18, 91);
  sp(C.slam - 0.02, -15, 0, 6, 121); sp(C.slam - 0.02, 15, 0, 6, 131);
  R.dust.forEach(m => (m.visible = false));
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
  const [a, b] = ['COMO CONSTRUIR UMA ', 'PONTE'];
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
  ctx.fillText('TIPOS DE PONTE', 418, 1676);
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

// ================================================================ camada 2D própria das pontes
function drawEra(t, wt) {
  const i = eraIndex(wt), a = C.eraKeys[i][0];
  const k = EZ.back(P(wt, a, 0.45));
  const txt = ERAS[i].label;
  ctx.save(); ctx.translate(540, 172); ctx.scale(k, k);
  ctx.font = '700 34px F'; const tw = ctx.measureText(txt).width;
  ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#141824'; ctx.lineWidth = 5;
  rr(-tw / 2 - 26, -26, tw + 52, 52, 26); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#141824'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, 0, 2);
  ctx.restore();
}
// moeda / nota de dinheiro
function money(x, y, s, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  ctx.fillStyle = '#2ecc71'; ctx.strokeStyle = '#141824'; ctx.lineWidth = 6;
  rr(-80, -42, 160, 84, 12); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#1f8f55'; ctx.lineWidth = 4; rr(-66, -30, 132, 60, 8); ctx.stroke();
  ctx.fillStyle = '#0f5a34'; ctx.font = '700 46px F'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('R$', 0, 3);
  ctx.restore();
}
function calendar(x, y, s, t, t0) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(0.06 * Math.sin(t * 3));
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#141824'; ctx.lineWidth = 8;
  rr(-110, -120, 220, 230, 22); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e63946'; rr(-110, -120, 220, 70, { upperLeft: 22, upperRight: 22 }); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#141824'; for (const dx of [-55, 55]) { rr(dx - 9, -140, 18, 44, 9); ctx.fill(); }
  const n = Math.floor((t - t0) * 6);
  const yrs = 1 + Math.min(9, Math.floor((t - t0) * 2.4));
  ctx.fillStyle = '#ffffff'; ctx.font = '700 34px F'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('ANOS', 0, -84);
  ctx.fillStyle = '#141824'; ctx.font = '700 110px F'; ctx.fillText(String(yrs), 0, 30);
  // folha virando
  const f = ((t - t0) * 6) % 1;
  if (n < 60) { ctx.save(); ctx.globalAlpha = 1 - f; ctx.translate(0, -50); ctx.scale(1, 1 - f); ctx.fillStyle = '#f2f2f2'; ctx.fillRect(-100, 0, 200, 150); ctx.restore(); }
  ctx.restore();
}
// janelinha do túnel de vento: pista quadrada faz redemoinhos, pista aerodinâmica deixa o vento passar
function windTunnel(t, wt) {
  const k = EZ.back(P(wt, C.tunnel, 0.45)) * (1 - P(wt, C.stiff + 0.7, 0.3));
  if (k <= 0) return;
  const aero = P(wt, C.stiff - 0.2, 0.6);
  ctx.save(); ctx.translate(540, 600); ctx.scale(k, k);
  ctx.fillStyle = '#e9f3ff'; ctx.strokeStyle = '#141824'; ctx.lineWidth = 8;
  rr(-400, -190, 800, 380, 34); ctx.fill(); ctx.stroke();
  ctx.save(); rr(-396, -186, 792, 372, 30); ctx.clip();
  // linhas de vento
  ctx.lineCap = 'round'; ctx.lineWidth = 7;
  for (let i = 0; i < 9; i++) {
    const y0 = -150 + i * 37.5;
    ctx.strokeStyle = `rgba(77,155,255,${0.85})`;
    ctx.beginPath();
    for (let x = -400; x <= 400; x += 10) {
      const defl = Math.sign(y0 || 1) * 60 * Math.exp(-((x / 150) ** 2)) * Math.exp(-((y0 / 120) ** 2));
      const turb = (1 - aero) * (x > 0 ? 1 : 0) * 26 * Math.sin(x * 0.05 - t * 14 + i) * Math.min(1, x / 120);
      const y = y0 + defl * (0.6 + 0.4 * aero) + turb;
      x === -400 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // redemoinhos atrás da pista quadrada
  if (aero < 1) {
    ctx.globalAlpha = 1 - aero; ctx.strokeStyle = '#ff4d3d'; ctx.lineWidth = 7;
    for (let j = 0; j < 3; j++) {
      const cx = 120 + j * 100 + ((t * 180) % 100), cy = (j % 2 ? 1 : -1) * 40;
      ctx.beginPath(); ctx.arc(cx, cy, 28, t * 8 + j, t * 8 + j + 4.5); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // corte da pista: retângulo → asa
  ctx.fillStyle = '#5d6675'; ctx.strokeStyle = '#141824'; ctx.lineWidth = 7;
  const wob = (1 - aero) * 0.18 * Math.sin(t * 9);
  ctx.save(); ctx.rotate(wob);
  ctx.beginPath();
  const hw = 150, hh = lerp(38, 22, aero);
  ctx.moveTo(-hw, -hh);
  ctx.lineTo(hw, -hh * (1 - aero));
  ctx.lineTo(hw + 40 * aero, 0);
  ctx.lineTo(hw, hh * (1 - aero) + 0.01);
  ctx.lineTo(-hw, hh);
  ctx.quadraticCurveTo(-hw - 60 * aero, 0, -hw, -hh);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.restore();
  ctx.fillStyle = '#141824'; rr(-210, -232, 420, 64, 32); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.font = '700 36px F'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('TÚNEL DE VENTO', 0, -199);
  // selo de aprovado quando fica aerodinâmica
  if (aero > 0.5) {
    const s = EZ.back(P(wt, C.stiff + 0.35, 0.35));
    ctx.save(); ctx.translate(290, 120); ctx.scale(s, s); ctx.rotate(-0.15);
    ctx.fillStyle = '#2ecc71'; ctx.strokeStyle = '#141824'; ctx.lineWidth = 6; circ(0, 0, 54); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = '700 64px F'; ctx.fillText('✓', 0, 4); ctx.restore();
  }
  ctx.restore();
}
// cartão da Ponte Octávio Frias (São Paulo): mastro em X e duas pistas curvas
function cardSP(t, wt) {
  const t1 = E('e4') + 0.3;
  if (wt < C.card || wt > t1 + 0.3) return;
  const k = EZ.back(P(wt, C.card, 0.45)) * (1 - P(wt, t1, 0.3));
  ctx.save(); ctx.translate(540, 610); ctx.scale(k, k); ctx.rotate(-0.025);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; rr(-330, -222, 660, 470, 32); ctx.fill();
  const sky = ctx.createLinearGradient(0, -230, 0, 230); sky.addColorStop(0, '#ffb36b'); sky.addColorStop(1, '#ffe2b0');
  ctx.fillStyle = sky; ctx.strokeStyle = '#141824'; ctx.lineWidth = 8; rr(-330, -230, 660, 460, 32); ctx.fill(); ctx.stroke();
  ctx.save(); rr(-326, -226, 652, 452, 28); ctx.clip();
  // prédios
  ctx.fillStyle = '#9aa3b6';
  for (let i = 0; i < 12; i++) { const h = 60 + rnd(i + 40) * 120; ctx.fillRect(-330 + i * 56, 150 - h, 46, h + 80); }
  // rio
  ctx.fillStyle = '#4d8fc9'; ctx.fillRect(-330, 150, 660, 80);
  // mastro em X
  const grow = EZ.o(P(wt, C.card + 0.2, 0.6));
  const top = lerp(150, -170, grow);
  ctx.strokeStyle = '#141824'; ctx.lineWidth = 22; ctx.lineCap = 'round';
  line(-70, 150, 50, top); line(70, 150, -50, top);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 13;
  line(-70, 150, 50, top); line(70, 150, -50, top);
  // estais em leque
  if (grow > 0.5) {
    const q = P(wt, C.card + 0.5, 0.6);
    ctx.strokeStyle = '#f2c94c'; ctx.lineWidth = 3;
    for (let i = 1; i <= 7; i++) for (const s of [-1, 1]) {
      const ax = s * lerp(8, 30, i / 7), ay = lerp(top + 20, top + 120, i / 7);
      const bx = s * (40 + i * 34), by = 108 + (i * i) * 0.4;
      line(ax, ay, lerp(ax, bx, q), lerp(ay, by, q));
    }
  }
  // duas pistas curvas que se cruzam no mastro
  ctx.strokeStyle = '#141824'; ctx.lineWidth = 16;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-330, 110 + s * 6); ctx.quadraticCurveTo(0, 100 - s * 30, 330, 110 - s * 6); ctx.stroke(); }
  ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 9;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-330, 110 + s * 6); ctx.quadraticCurveTo(0, 100 - s * 30, 330, 110 - s * 6); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = '#141824'; rr(-300, -282, 600, 74, 37); ctx.fill();
  ctx.fillStyle = '#ffd23f'; ctx.font = '700 38px F'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('PONTE OCTÁVIO FRIAS', 0, -244);
  ctx.fillStyle = '#ffffff'; rr(-170, 196, 340, 64, 32); ctx.fill(); ctx.strokeStyle = '#141824'; ctx.lineWidth = 5; ctx.stroke();
  ctx.fillStyle = '#141824'; ctx.font = '700 32px F'; ctx.fillText('SÃO PAULO · 2008', 0, 229);
  ctx.restore();
}
function failOverlays(t, wt) {
  // pênsil cara e demorada: dinheiro voando e calendário correndo
  if (between(wt, C.cost, C.rwE.a)) {
    for (let i = 0; i < 9; i++) {
      const a = wt - C.cost - i * 0.16; if (a < 0) continue;
      const x = 160 + rnd(i + 3) * 760, y = 1250 - a * (380 + rnd(i) * 200);
      if (y < 200) continue;
      money(x, y, 0.75 + rnd(i + 9) * 0.4, Math.sin(a * 4 + i) * 0.4);
    }
    calendar(820, 540, EZ.back(P(wt, C.cost + 0.5, 0.4)), t, C.cost + 0.5);
  }
  windTunnel(t, wt);
  cardSP(t, wt);
}
function comic(t, wt) {
  const word = (t0, dur, v, txt, size, col) => {
    if (wt < t0 || wt > t0 + dur) return;
    const [x, y, z] = project(v); if (z > 1) return;
    const k = P(wt, t0, dur);
    ctx.save(); ctx.translate(cl(x, 260, 820), cl(y - 120, 260, 1300)); ctx.scale(EZ.back(cl(k * 3)), EZ.back(cl(k * 3))); ctx.rotate(-0.1); ctx.globalAlpha *= 1 - P(wt, t0 + dur * 0.7, dur * 0.3);
    bigWord(txt, 0, 0, size, col); ctx.restore();
  };
  if (!inRewind(t)) {
    word(C.slam, 0.7, V3(0, BANK_Y + 1, 0), 'TUM!', 120, '#ffd23f');
    word(C.brk + 0.4, 1.1, V3(0, 1.5, 0), 'SPLASH!', 130, '#4d9bff');
    word(C.crack, 1.0, V3(-3.75, 3, 0), 'CRACK!', 120, '#ff5a3c');
    word(C.bonk, 1.0, V3(-3.75, 5, 4.5), 'BONK!', 120, '#ffd23f');
    word(C.trussFall + 0.8, 1.0, V3(0, 3, 0), 'CRASH!', 130, '#ff5a3c');
    word(C.fall + 0.8, 1.2, V3(0, 3, 0), 'CRASH!', 140, '#ff5a3c');
  }
  // gancho: os 2 primeiros segundos
  if (t < 1.9) {
    const k = EZ.back(P(t, 0.05, 0.35)) * (1 - P(t, 1.6, 0.3));
    const pulse = 1 + 0.06 * Math.sin(t * 16);
    ctx.save(); ctx.translate(540, 560); ctx.scale(k * pulse, k * pulse); ctx.rotate(-0.06);
    bigWord('VAI', 0, -95, 150, '#ffffff');
    bigWord('AGUENTAR?', 0, 70, 150, '#ffd23f');
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
  buildWorld(); buildPlank(); buildBeam(); buildArch(); buildTruss(); buildSuspension(); buildStayed(); buildParticles();
  HOST = makeHost(hostScene);
  const HS = 2.4;
  HOSTW_PLACE = grp(null, 28, BANK_Y + 1.68 * HS, 5); HOSTW_PLACE.scale.setScalar(HS);
  HOSTW = makeHost(HOSTW_PLACE);
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
    HOSTW_PLACE.rotation.y = Math.atan2(camera.position.x - HOSTW_PLACE.position.x, camera.position.z - HOSTW_PLACE.position.z);
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

