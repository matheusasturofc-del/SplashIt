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


// ================================================================ medidas do mundo (quintal em corte, como maquete)
const ERAS = [];
const HS = 0.8;
const FEET = 1.68 * HS;
const BF = -10;           // piso interno do bunker
const CEIL = -5;          // teto interno do bunker
const BASEMENT = -3.2;    // piso do porão

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
  // gancho: porão comum desaba
  C.meteor = 0.0; C.boom = Math.max(2.2, wT('h2', 'explosão') + 0.1); C.cave = wT('h2', 'desaba') - 0.1;
  C.rwH = RW(E('h2') + 0.15, 0.3);
  // caixa de concreto
  C.dig = wT('c1', 'cava') - 0.2; C.box0 = wT('c1', 'caixa') - 0.3; C.box1 = wT('c1', 'metro') + 0.2;
  // portas
  C.door1 = S('p1') + 0.1; C.blast = wT('p1', 'onda') - 0.1; C.rwP1 = RW(E('p1') + 0.15, S('p1') - 0.05);
  C.door2 = wT('p2', 'porta') - 0.3;
  C.push = S('p3') + 0.1; C.rwP3 = RW(E('p3') + 0.15, S('p3') - 0.05);
  C.hinge = wT('p4', 'rolamentos') - 0.2; C.wheel = wT('p4', 'volante') - 0.1; C.pins = wT('p4', 'pinos') - 0.2; C.openD = C.hinge + 0.2;
  // ar
  C.smoke = S('a1') + 0.1; C.rwA = RW(E('a1') + 0.15, S('a1') - 0.05);
  C.filter = wT('a2', 'filtro') - 0.3; C.clean = wT('a2', 'limpo') - 0.3;
  // luz
  C.off = S('l1') + 0.3; C.rwL1 = RW(E('l1') + 0.15, S('l1') - 0.05);
  C.gen = wT('l2', 'gerador') - 0.25; C.batt = wT('l2', 'baterias') - 0.25; C.lightOn = wT('l2', 'baterias') + 0.4; C.fume = wT('l2', 'fumaça') - 0.2;
  C.rwL2 = RW(E('l2') + 0.15, wT('l2', 'motor') - 0.3);
  C.exhaust = wT('l3', 'chaminé') - 0.3;
  // comida
  C.empty = S('f1') + 0.1; C.rwF = RW(E('f1') + 0.15, S('f1') - 0.05);
  C.tank = wT('f2', 'tanque') - 0.25; C.cans = wT('f2', 'enlatados') - 0.25;
  // céu
  C.crazy = S('v1') + 0.1; C.rwV = RW(E('v1') + 0.15, S('v1') - 0.05);
  C.peri = wT('v2', 'periscópio') - 0.3; C.view = wT('v2', 'mostra') - 0.2;
  // decoração
  C.beds = wT('d1', 'beliches') - 0.2; C.table = wT('d1', 'mesa') - 0.2; C.radio = wT('d1', 'rádio') - 0.2; C.map = wT('d1', 'mapa') - 0.2;
  // final
  C.hostWorld = 0; C.stamp = S('o1') + 0.25; C.cta = S('o2') - 0.1;
  C.eraKeys = [[0, 0]];

  // ---------- câmera
  const CK = [];
  CK.push([0, [-9, 2.5, 0, 18, 0.15, 0.12, 40]], [0.7, [-9, 0.8, 0, 24, 0.2, 0.1, 40], 'o'], [C.cave, [-9, 0.2, 0, 25, 0.2, 0.08, 40]], [C.rwH.b, [-9, 0.5, 0, 25, 0.2, 0.08, 40]]);
  CK.push([C.dig + 0.4, [6, -4.5, 0, 38, 0.2, 0.15, 40]], [C.box1, [7, -7.2, 0, 31, 0.15, 0.08, 40]]);
  CK.push([C.door1 + 0.3, [1.2, -8.2, 1.4, 17, 0.3, 0.08, 40]], [C.rwP1.b, [1.2, -8.2, 1.4, 17, 0.3, 0.08, 40]]);
  CK.push([C.door2 + 0.3, [1.0, -8.4, 1.45, 15, 0.35, 0.06, 40]], [C.push + 0.3, [1.4, -8.4, 1.6, 14, 0.3, 0.06, 40]], [C.rwP3.b, [1.4, -8.4, 1.6, 14, 0.3, 0.06, 40]]);
  CK.push([C.hinge + 0.2, [0.8, -8.4, 1.45, 14, 0.35, 0.08, 40]], [C.openD + 0.6, [1.0, -8.0, 1.45, 16, 0.3, 0.06, 40]]);
  CK.push([C.smoke + 0.3, [3, -3.5, 0, 30, 0.2, 0.14, 40]], [C.rwA.b, [3, -3.5, 0, 30, 0.2, 0.14, 40]]);
  CK.push([C.filter + 0.3, [9, -5, 2, 18, 0.3, 0.08, 40]], [E('a2'), [8.5, -4, 1, 24, 0.25, 0.1, 40]]);
  CK.push([C.off + 0.2, [7, -7.5, 0, 24, 0.2, 0.06, 40]], [C.gen + 0.4, [9.5, -8, 1, 18, 0.35, 0.06, 40]], [C.rwL2.b, [9.5, -8, 1, 18, 0.35, 0.06, 40]]);
  CK.push([C.exhaust + 0.3, [11, -4, 2, 28, 0.3, 0.1, 40]], [E('l3'), [11.5, -2, 2.5, 26, 0.3, 0.12, 40]]);
  CK.push([C.empty + 0.3, [4, -7.6, 0, 18, 0.2, 0.06, 40]], [C.rwF.b, [4, -7.6, 0, 18, 0.2, 0.06, 40]]);
  CK.push([C.tank + 0.3, [4.5, -7.4, -1, 20, 0.25, 0.08, 40]], [E('f2'), [5, -7.4, -1, 21, 0.2, 0.08, 40]]);
  CK.push([C.crazy + 0.3, [6.5, -8, 1, 13, 0.2, 0.05, 40]], [C.rwV.b, [6.5, -8, 1, 13, 0.2, 0.05, 40]]);
  CK.push([C.peri + 0.3, [6, -4, 2, 30, 0.25, 0.1, 40]], [C.view + 0.2, [6.5, -6.5, 1, 22, 0.22, 0.08, 40]]);
  CK.push([C.beds + 0.3, [6.5, -7.6, 0, 26, 0.2, 0.08, 40]], [E('d1'), [7, -7.4, 0, 27, 0.18, 0.08, 40]]);
  CK.push([C.stamp - 0.3, [3, -4, 0, 42, 0.25, 0.12, 42]], [TL.duration, [3, -4, 0, 43, 0.18, 0.12, 42]]);
  C.camKeys = sortK(CK);

  C.shakes = [[C.boom, 0.45], [C.cave + 0.3, 0.35], [C.blast, 0.4], [C.box1 - 0.4, 0.15], [C.stamp + 0.18, 0.25]];

  // ---------- reações do bonequinho
  const Rx = (t, d, e, p, b) => REACT.push({ t, d, e, p, b });
  Rx(0.2, C.boom - 0.2, 'shock', 'cover', null);
  Rx(C.cave, C.rwH.a - C.cave, 'shock', 'up', 'Socorro!');
  Rx(E('c1') - 1.1, 1.1, 'happy', 'thumbs', null);
  Rx(C.blast, C.rwP1.a - C.blast, 'shock', 'up', 'Uou!');
  Rx(E('p2') - 1.0, 1.0, 'happy', 'thumbs', null);
  Rx(C.push, C.rwP3.a - C.push, 'worried', 'push', 'Ufff!');
  Rx(C.openD + 0.3, 1.2, 'happy', 'point', 'Fácil!');
  Rx(C.smoke + 0.5, C.rwA.a - C.smoke - 0.5, 'worried', 'cover', 'Cof cof!');
  Rx(E('a2') - 1.0, 1.0, 'relieved', 'wipe', 'Ufa!');
  Rx(C.off, C.rwL1.a - C.off, 'shock', 'cheeks', 'Cadê a luz?');
  Rx(C.lightOn, 1.0, 'happy', 'thumbs', null);
  Rx(C.fume + 0.3, C.rwL2.a - C.fume - 0.3, 'worried', 'cover', 'Cof!');
  Rx(E('l3') - 1.0, 1.0, 'happy', 'thumbs', null);
  Rx(C.empty + 0.4, C.rwF.a - C.empty - 0.4, 'worried', 'wipe', 'Fome...');
  Rx(E('f2') - 1.0, 1.0, 'happy', 'thumbs', null);
  Rx(C.crazy + 0.3, C.rwV.a - C.crazy - 0.3, 'think', 'cheeks', '?!');
  Rx(C.view, 1.4, 'happy', 'point', 'Que lindo!');
  Rx(E('d1') - 1.0, 1.0, 'happy', 'thumbs', null);
  Rx(C.stamp + 0.15, 2.4, 'happy', 'cheer', 'Uhuul!');
  Rx(C.cta, TL.duration - C.cta, 'happy', 'point', null);
  for (const r of C.REW) Rx(r.a, r.b - r.a, 'worried', 'point', 'Volta!');
  REACT.sort((a, b) => a.t - b.t);

  // ---------- etiquetas
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const Lb = (txt, t0, t1, at, off) => { LABELS.push({ txt, t0, t1, at, off }); CHIPS.push({ txt, t: t0 }); };
  Lb('BUNKER', wT('c1', 'bunker'), E('c1') + 0.3, () => V(13.5, -7.5, 4), [-180, -420]);
  Lb('PORTA BLINDADA', wT('p2', 'blindada'), E('p2') + 0.3, () => V(0.5, -7.6, 2.6), [80, -330]);
  Lb('VOLANTE', wT('p4', 'volante'), E('p4') + 0.2, () => V(1.0, -8.55, 1.45), [100, -320]);
  Lb('FILTRO DE AR', wT('a2', 'filtro'), E('a2') + 0.3, () => V(10, -5.9, 3.6), [-80, -330]);
  Lb('ESCAPAMENTO', wT('l3', 'escapamento'), E('l3') + 0.3, () => V(12.2, 0.8, 3.85), [-100, -300]);
  Lb('DESPENSA', wT('f2', 'despensa'), E('f2') + 0.3, () => V(4.4, -7.2, -3.5), [80, -330]);
  Lb('PERISCÓPIO', wT('v2', 'periscópio') + 0.3, E('v2') + 0.3, () => V(6, 0.6, 3.85), [-60, -300]);

  // ---------- setas
  const Ar = (t0, t1, at, dir, len, col, kind = 'line') => ARROWS.push({ t0, t1, at, dir: new THREE.Vector3(...dir), len, col, kind });
  const RED = '#ff4d3d', BLUE = '#4d9bff', YEL = '#ffd23f', GREEN = '#2ecc71', GREY = '#9aa3ad';
  Ar(C.blast - 0.4, C.blast + 0.3, () => V(-1, -3, 1.5), [0.4, -1, 0], 2.5, RED);
  Ar(C.push + 0.3, C.rwP3.a, () => V(1.4, -7.0, 2.4), [-1, 0, 0], 1.2, RED);
  Ar(C.wheel, C.pins + 0.6, () => V(1.0, -8.55, 1.45), [0, 0, 0], 1, YEL, 'spin');
  Ar(C.smoke + 0.3, C.rwA.a, () => V(-1, 1.5, 1), [0, -1, 0], 2.5, GREY);
  Ar(C.clean, E('a2') + 0.2, () => V(10, -1.5, 3.85), [0, -1, 0], 2, GREY);
  Ar(C.clean + 0.4, E('a2') + 0.2, () => V(10, -6.8, 3.85), [0, -1, 0], 1.5, GREEN);
  Ar(C.exhaust + 0.5, E('l3') + 0.2, () => V(12.2, -6, 3.85), [0, 1, 0], 2.5, GREY);
  Ar(C.peri + 0.5, C.view, () => V(6, -3, 3.85), [0, 1, 0], 2.5, GREEN);

  // ---------- efeitos sonoros
  sfx(0.0, 'whoosh', 0.8); sfx(0.5, 'whoosh', 0.5); sfx(1.1, 'whoosh', 0.6); sfx(C.boom, 'blowout', 1.0); sfx(C.boom + 0.05, 'crash', 0.8);
  sfx(C.cave - 0.3, 'creak', 0.8); sfx(C.cave, 'crash', 1.0); sfx(C.cave + 0.3, 'fall', 0.6, 0.6);
  for (let k = 0; k < 6; k++) sfx(C.dig + k * 0.3, 'thud', 0.35); asmSfx(C.box0, C.box1 - C.box0, 7, 'thud', 0.6);
  sfx(C.door1, 'pop', 0.4); sfx(C.blast - 0.2, 'blowout', 0.9); sfx(C.blast, 'crash', 0.9);
  sfx(C.door2, 'clank', 0.9); sfx(C.door2 + 0.35, 'thud', 1.0);
  sfx(C.push, 'strain', 0.6, 1.4);
  sfx(C.hinge, 'click', 0.6); sfx(C.wheel, 'clank', 0.6, 0); sfx(C.wheel + 0.3, 'clank', 0.5); asmSfx(C.pins, 0.6, 5, 'clac', 0.6); sfx(C.openD, 'creak', 0.4);
  sfx(C.smoke, 'whoosh', 0.6); sfx(C.filter, 'clank', 0.6); sfx(C.clean, 'hum', 0.3, 2);
  sfx(C.off, 'powerdown', 0.8); sfx(C.gen, 'clank', 0.6); sfx(C.batt, 'clank', 0.5); sfx(C.lightOn, 'powerup', 0.7); sfx(C.lightOn + 0.3, 'hum', 0.35, 2.5); sfx(C.fume, 'blowout', 0.4);
  sfx(C.exhaust, 'clank', 0.6); sfx(C.exhaust + 0.4, 'whoosh', 0.5);
  sfx(C.empty, 'pop', 0.4); sfx(C.tank, 'thud', 0.7); asmSfx(C.cans, 1.0, 8, 'clac', 0.35);
  sfx(C.crazy, 'alarm', 0.3); sfx(C.peri, 'zip', 0.6); sfx(C.view, 'ding', 0.6);
  for (const k of ['beds', 'table', 'radio', 'map']) sfx(C[k] + 0.2, 'pop', 0.65);
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
const dark = wt => between(wt, C.off, C.lightOn) ? 2.0 * P(wt, C.off, 0.25) * (1 - P(wt, C.lightOn, 0.2)) : 0;
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
function lpTree(x, z, s, pine, y = 0) {
  const t = grp(null, x, y, z);
  const tr = mesh(new THREE.CylinderGeometry(0.15, 0.2, 1, 6), LP('#6e4a2c')); tr.scale.set(s, 1.8 * s, s); tr.position.y = 0.9 * s; t.add(tr);
  if (pine) for (let k = 0; k < 3; k++) { const c = mesh(CONE6, LP(k % 2 ? '#3d8f45' : '#2f7a3a')); c.scale.setScalar(s * (1.1 - k * 0.27)); c.position.y = s * (2.1 + k * 0.85); t.add(c); }
  else { const a = mesh(ICO, LP('#4caf50')); a.scale.setScalar(1.3 * s); a.position.y = 2.6 * s; t.add(a); const b = mesh(ICO, LP('#5bbd55')); b.scale.setScalar(0.85 * s); b.position.set(0.6 * s, 3.2 * s, 0.3 * s); t.add(b); }
  return t;
}
function bush(x, y, z, s, col = '#58a945') { const g = grp(null, x, y, z); for (let k = 0; k < 3; k++) { const b = mesh(ICO, LP(k % 2 ? col : '#4e9a3e')); b.scale.set(0.8 * s, 0.6 * s, 0.7 * s); b.position.set((k - 1) * 0.6 * s, 0.35 * s + (k % 2) * 0.2 * s, (k % 2) * 0.2 * s); g.add(b); } return g; }
function addClouds(n = 7) {
  const cloudM = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1, emissive: '#dfe8f5', emissiveIntensity: 0.35 });
  R.clouds = [];
  for (let i = 0; i < n; i++) { const cg = grp(null, -70 + i * 24 + rnd(i) * 8, 16 + rnd(i + 2) * 10, -60 - rnd(i + 5) * 20); for (let k = 0; k < 4; k++) { const m = mesh(ICO1, cloudM, false); m.scale.setScalar(3 + rnd(i * 4 + k) * 2.5); m.position.set((k - 1.5) * 3.6, (k % 2) * 1.6, rnd(k + i) * 1.5); cg.add(m); } R.clouds.push(cg); }
}
function addTufts(n, okFn) {
  const tufts = new THREE.InstancedMesh(new THREE.ConeGeometry(0.1, 0.35, 4), LP('#4f9a3c'), n);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  let nt = 0;
  for (let i = 0; i < n * 6 && nt < n; i++) { const x = (rnd(i * 5 + 0.3) - 0.5) * 80, z = 3.8 - rnd(i * 5 + 1.7) * 40; if (!okFn(x, z)) continue; p.set(x, 0.14, z); q.setFromAxisAngle(_up, rnd(i) * 6); sc.setScalar(0.7 + rnd(i + 2) * 0.8); tufts.setMatrixAt(nt++, mtx.compose(p, q, sc)); }
  tufts.count = nt; scene.add(tufts);
}
// ---------- quintal em corte: terra com o porão, o poço de acesso e o buraco do bunker
function buildWorld() {
  const grass = LP('#7cc35a'), soil = LP('#8a5a3a'), soilD = LP('#6e4630');
  const col = (x0, x1, holes) => {
    let y = -16;
    for (const [h0, h1, zb] of holes) { if (h0 > y) boxC(x0, y, -60, x1, h0, 4, y < -10.9 ? soilD : soil); boxC(x0, h0, -60, x1, h1, zb, soil); y = h1; }
    if (y < -0.4) boxC(x0, y, -60, x1, -0.4, 4, soil);
  };
  col(-60, -14, []); col(-14, -13, []); col(-13, -5, [[-3.5, -0.4, -5]]); col(-5, -4, []); col(-4, -2, []);
  col(-2, 0, [[-10, -0.4, -2]]); col(0, 14, [[-11, -4, -5]]); col(14, 60, []);
  // grama (o poço fica aberto e a casa tem piso próprio)
  boxC(-60, -0.4, -60, -14, 0, 4, grass); boxC(-14, -0.4, -60, -4, 0, -5.4, grass); boxC(-4, -0.4, -60, -2, 0, 4, grass);
  boxC(-2, -0.4, -60, 0, 0, -2, grass); boxC(0, -0.4, -60, 60, 0, 4, grass);
  // terra que ainda não foi cavada
  R.fillB = boxC(0, -11, -5, 14, -4, 4, soil); R.fillS = boxC(-2, -10, -2, 0, -0.4, 4, soil);
  for (let i = 0; i < 26; i++) { const x = (rnd(i) - 0.5) * 60, y = -1.5 - rnd(i + 3) * 13; if (x > -14 && x < 15 && y > -12) continue; const r = mesh(DODE, LP(i % 3 ? '#9a8f84' : '#7d736a')); r.scale.set(0.3 + rnd(i + 5) * 0.4, 0.2 + rnd(i + 6) * 0.3, 0.25); r.position.set(x, y, 4.02); r.rotation.z = rnd(i) * 3; scene.add(r); }
  // porão: piso e caixas
  boxC(-13, -3.5, -5, -5, BASEMENT, 4, M('#9a958c'));
  for (const [x, z, s] of [[-12, -4, 1], [-10.6, -4.2, 0.8], [-6.2, -4, 1.1]]) boxC(x - 0.6 * s, BASEMENT, z - 0.6 * s, x + 0.6 * s, BASEMENT + 1.1 * s, z + 0.6 * s, M('#b7864f'));
  // casa (piso em duas metades para poder desabar)
  R.house = [];
  const hp = (x0, y0, z0, x1, y1, z1, m) => { const b = boxC(x0, y0, z0, x1, y1, z1, m); R.house.push(b); return b; };
  R.slabL = hp(-14, -0.4, -5.4, -9, 0, 4, M('#c89b6a')); R.slabR = hp(-9, -0.4, -5.4, -4, 0, 4, M('#c89b6a'));
  const wall = M('#f3e3c3'), wallB = M('#d9c3a0');
  R.wallBack = hp(-14, 0, -5.4, -4, 5, -5.0, wall); R.wallL = hp(-14, 0, -5.0, -13.6, 5, 4, wallB); R.wallR = hp(-4.4, 0, -5.0, -4, 5, 4, wallB);
  R.roof = [];
  for (const s of [-1, 1]) { const r = box(6.4, 0.3, 10.2, M('#c0392b'), -9 + s * 2.75, 6.3, -0.7); r.rotation.z = -s * 0.5; R.roof.push(r); R.house.push(r); }
  R.window = hp(-13.58, 2.0, -3.2, -13.5, 4.0, 0.2, M('#9fd6ff', { emissive: '#6fb8ff', emissiveIntensity: 0.25 }));
  R.houseLamp = hp(-9.6, 0, -2.6, -8.4, 0.9, -1.4, M('#8b5a33'));
  R.house.forEach(m => { m.userData.p0 = m.position.clone(); m.userData.r0 = m.rotation.clone(); });
  // jardim
  for (let i = 0; i < 36; i++) { const x = (rnd(i * 3) - 0.5) * 100, z = -8 - rnd(i * 3 + 1) * 45; if (Math.abs(x + 4) < 16 && z > -14) continue; lpTree(x, z, 0.9 + rnd(i + 2) * 0.8, rnd(i + 7) < 0.4); }
  lpTree(-18, 0.5, 1.2, false); lpTree(18, -2.5, 1.3, true); lpTree(16, 1.5, 1.0, false);
  const fence = LP('#f4efe6');
  for (let x = -40; x <= 40; x += 1.2) boxC(x - 0.08, 0, -9.0, x + 0.08, 1.1, -8.84, fence);
  for (const y of [0.4, 0.85]) boxC(-40.1, y, -8.84, 40.1, y + 0.1, -8.78, fence);
  addTufts(500, (x, z) => !(x > -14.5 && x < -3.5 && z > -6) && !(x > -2.5 && x < 0.5 && z > -2.5));
  addClouds();
  // arbustos que escondem as saídas (filtro, escapamento e periscópio)
  R.bushV = bush(10, 0, 3.0, 1.2); R.bushE = bush(12.2, 0, 3.0, 1.1, '#64b34f'); R.bushP = bush(6, 0, 3.0, 1.2, '#5aa94a');
  // tampa do poço
  R.hatch = grp(null, -2, 0, -1.0);
  boxC(0.02, 0.0, -0.96, 1.98, 0.12, 0.96, M('#5d6675', { metalness: 0.6, roughness: 0.4 }), R.hatch);
}
// ---------- bunker
function buildBunker() {
  const conc = M('#b9b7b0', { roughness: 0.9 }), concD = M('#a7a59e', { roughness: 0.9 });
  const C_ = (a, b, c, d, e, f, m, ord) => { const x = boxC(a, b, c, d, e, f, m); asm(x, () => C.box0 + ord * (C.box1 - C.box0 - 0.5) / 6, 0.5, { dy: 8, s: 0.6 }); return x; };
  C_(0, -11, -5, 14, -10, 4, concD, 0);
  C_(0, -10, -5, 1, -5, 0, conc, 1); C_(0, -10, 2.9, 1, -7.2, 4, conc, 1); C_(0, -7.2, 0, 1, -5, 4, conc, 2);
  C_(13, -10, -5, 14, -5, 4, conc, 3); C_(1, -10, -5, 13, -5, -4, conc, 4);
  C_(0, -5, -5, 14, -4, 4, concD, 5);
  // escada do poço
  R.ladder = grp(null);
  const lm = M('#7d8792', { metalness: 0.6, roughness: 0.4 });
  for (const z of [-1.75, -1.75]) member(R.ladder, V3(-1.6, BF, z), V3(-1.6, 0.5, z), 0.06, lm);
  member(R.ladder, V3(-0.4, BF, -1.75), V3(-0.4, 0.5, -1.75), 0.06, lm);
  for (let y = BF + 0.4; y < 0; y += 0.55) member(R.ladder, V3(-1.6, y, -1.75), V3(-0.4, y, -1.75), 0.045, lm);
  asm(R.ladder, () => C.box1 - 0.3, 0.5, { dy: 4, s: 0.6 });
  // luzes do teto
  R.lamps = [];
  for (const x of [3.5, 7, 10.5]) { const l = mesh(new THREE.SphereGeometry(0.3, 12, 8), new THREE.MeshStandardMaterial({ color: '#fff6d0', emissive: '#ffd36b', emissiveIntensity: 1.4 }), false); l.position.set(x, CEIL - 0.3, 0); scene.add(l); R.lamps.push(l); }
  // porta de madeira (voa) e porta blindada (redonda)
  R.wood = grp(null, 0.5, -8.6, 1.45);
  boxC(-0.1, -1.4, -1.38, 0.1, 1.35, 1.38, M('#9a6a3d'), R.wood);
  asm(R.wood, () => C.door1, 0.4, { dy: 3, s: 0.6 });
  R.vault = grp(null, 0.5, -8.6, 0.0);
  const steel = M('#7f8a96', { metalness: 0.7, roughness: 0.35 }), steelD = M('#5d6675', { metalness: 0.6, roughness: 0.4 });
  const disk = mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.55, 40), steel); disk.rotation.z = Math.PI / 2; disk.position.set(0, 0, 1.45); R.vault.add(disk);
  const rim = mesh(new THREE.TorusGeometry(1.25, 0.06, 8, 40), steelD); rim.rotation.y = Math.PI / 2; rim.position.set(0.29, 0, 1.45); R.vault.add(rim);
  R.wheelG = grp(R.vault, 0.45, 0, 1.45);
  const wr = mesh(new THREE.TorusGeometry(0.55, 0.07, 8, 30), M('#e63946', { metalness: 0.3 })); wr.rotation.y = Math.PI / 2; R.wheelG.add(wr);
  for (let k = 0; k < 3; k++) { const sp = mesh(GEO.cyl, steelD); sp.scale.set(0.05, 1.1, 0.05); sp.rotation.x = k * Math.PI / 3; R.wheelG.add(sp); }
  const hub = mesh(GEO.cyl, steelD); hub.scale.set(0.14, 0.2, 0.14); hub.rotation.z = Math.PI / 2; R.wheelG.add(hub);
  R.pinsG = [];
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + 0.3, p = mesh(GEO.cyl, M('#c9ced6', { metalness: 0.8, roughness: 0.25 })); p.scale.set(0.09, 0.5, 0.09); p.userData.a = a; R.vault.add(p); R.pinsG.push(p); }
  R.hinges = [];
  for (const y of [-0.9, 0.9]) { const h = mesh(GEO.cyl, M('#ffd23f', { metalness: 0.6, roughness: 0.3 })); h.scale.set(0.16, 0.5, 0.16); h.position.set(0.5, y, 0.05); R.vault.add(h); R.hinges.push(h); }
  asm(R.vault, () => C.door2, 0.5, { dy: 6, s: 0.8 });
  // filtro de ar: cano pelo corte até o arbusto
  const pm = M('#9aa3ad', { metalness: 0.5, roughness: 0.4 });
  R.vent = grp(null);
  member(R.vent, V3(10, 0.5, 3.85), V3(10, -5.2, 3.85), 0.24, pm);
  boxC(9.4, -6.6, 3.1, 10.6, -5.0, 3.98, M('#3b4048'), R.vent);
  for (let k = 0; k < 3; k++) boxC(9.45, -6.45 + k * 0.5, 3.98, 10.55, -6.2 + k * 0.5, 4.06, M(k % 2 ? '#1b1b1b' : '#5d6675'), R.vent);
  asm(R.vent, () => C.filter, 0.6, { dy: 3, s: 0.4 });
  // gerador, baterias e escapamento
  R.genG = grp(null);
  boxC(10.8, BF, 1.4, 12.8, BF + 1.3, 3.2, M('#ffd23f', { roughness: 0.5 }), R.genG);
  boxC(11.0, BF + 1.3, 1.6, 12.0, BF + 1.6, 2.4, M('#3b4048'), R.genG);
  asm(R.genG, () => C.gen, 0.5, { dy: 4, s: 0.4 });
  R.battG = grp(null);
  for (let k = 0; k < 3; k++) { boxC(8.4 + k * 0.75, BF, 2.0, 9.0 + k * 0.75, BF + 1.0, 3.0, M('#2f6db5'), R.battG); boxC(8.55 + k * 0.75, BF + 1.0, 2.3, 8.85 + k * 0.75, BF + 1.15, 2.7, M('#e63946'), R.battG); }
  asm(R.battG, () => C.batt, 0.5, { dy: 4, s: 0.4 });
  R.exh = grp(null);
  member(R.exh, V3(12.2, BF + 1.3, 3.85), V3(12.2, 0.4, 3.85), 0.2, M('#6b7280', { metalness: 0.5 }));
  asm(R.exh, () => C.exhaust, 0.6, { dy: -4, s: 0.3 });
  // despensa
  R.tankG = grp(null);
  const tk = mesh(new THREE.CylinderGeometry(0.95, 0.95, 3.4, 20), M('#4d9bff', { roughness: 0.3 })); tk.position.set(2.3, BF + 1.7, -2.9); R.tankG.add(tk);
  const tap = mesh(GEO.cyl, M('#c9ced6', { metalness: 0.8 })); tap.scale.set(0.08, 0.4, 0.08); tap.rotation.x = Math.PI / 2; tap.position.set(2.3, BF + 0.5, -1.8); R.tankG.add(tap);
  asm(R.tankG, () => C.tank, 0.5, { dy: 5, s: 0.4 });
  R.pantry = grp(null);
  const wd = M('#a8743f');
  boxC(3.6, BF, -4, 5.4, BF + 0.15, -3.0, wd, R.pantry);
  for (const y of [1.3, 2.6, 3.9]) boxC(3.7, BF + y, -4, 5.3, BF + y + 0.12, -3.0, wd, R.pantry);
  boxC(3.6, BF + 0.15, -4, 3.7, BF + 4.02, -3.0, wd, R.pantry); boxC(5.3, BF + 0.15, -4, 5.4, BF + 4.02, -3.0, wd, R.pantry);
  R.cansList = [];
  const canCols = ['#e63946', '#2a9d8f', '#ffd23f', '#ff8a2a'];
  for (const [si, y] of [[0, 0.15], [1, 1.42], [2, 2.72]]) for (let k = 0; k < 6; k++) { const c = mesh(GEO.cyl, M(canCols[(k + si) % 4], { metalness: 0.3 })); c.scale.set(0.12, 0.42, 0.12); c.position.set(3.95 + (k % 3) * 0.5, BF + y + 0.21, -3.7 + Math.floor(k / 3) * 0.35); scene.add(c); R.cansList.push(c); asm(c, () => C.cans + (si * 6 + k) * 0.05, 0.3, { dy: 1.5, s: 0.3 }); }
  asm(R.pantry, () => C.cans - 0.3, 0.4, { dy: 4, s: 0.5 });
  // periscópio
  R.periG = grp(null);
  member(R.periG, V3(6, BF + 3.0, 3.85), V3(6, 0.3, 3.85), 0.18, M('#3b4048', { metalness: 0.4 }));
  boxC(5.6, BF + 2.4, 3.4, 6.4, BF + 3.0, 3.98, M('#3b4048'), R.periG);
  asm(R.periG, () => C.peri, 0.5, { dy: 2, s: 0.3 });
  R.periTop = grp(null, 6, 0.3, 3.85);
  const ph = mesh(GEO.cyl, M('#3b4048', { metalness: 0.4 })); ph.scale.set(0.18, 1.2, 0.18); ph.position.y = 0.6; R.periTop.add(ph);
  boxC(-0.25, 1.15, -0.25, 0.25, 1.55, 0.35, M('#3b4048'), R.periTop);
  boxC(-0.18, 1.22, 0.35, 0.18, 1.48, 0.38, M('#9fd6ff', { emissive: '#6fb8ff', emissiveIntensity: 0.4 }), R.periTop);
  // decoração
  R.beds = grp(null);
  const bm = M('#5d6675', { metalness: 0.4 });
  for (const [x0, x1] of [[6.0, 6.15], [9.3, 9.45]]) for (const z of [-3.8, -2.1]) boxC(x0, BF, z - 0.075, x1, BF + 3.6, z + 0.075, bm, R.beds);
  for (const y of [0.6, 2.4]) { boxC(6.15, BF + y, -3.75, 9.3, BF + y + 0.15, -2.15, bm, R.beds); boxC(6.25, BF + y + 0.15, -3.7, 9.2, BF + y + 0.45, -2.2, M('#f7f3ea'), R.beds); boxC(7.6, BF + y + 0.45, -3.71, 9.21, BF + y + 0.55, -2.19, M(y < 1 ? '#2a9d8f' : '#e76f51'), R.beds); }
  asm(R.beds, () => C.beds, 0.45, { dy: 5, s: 0.3 });
  R.tableG = grp(null);
  boxC(5.0, BF + 1.1, -0.6, 8.0, BF + 1.25, 1.2, M('#8b5a33'), R.tableG);
  for (const [x, z] of [[5.2, -0.4], [7.8, -0.4], [5.2, 1.0], [7.8, 1.0]]) boxC(x - 0.08, BF, z - 0.08, x + 0.08, BF + 1.1, z + 0.08, M('#6e4426'), R.tableG);
  for (let k = 0; k < 4; k++) { const cd = box(0.3, 0.02, 0.42, M(k % 2 ? '#ffffff' : '#ffd23f'), 6.0 + k * 0.4, BF + 1.26 + k * 0.001, 0.3 + (k % 2) * 0.2, R.tableG); cd.rotation.y = 0.3 * k; }
  asm(R.tableG, () => C.table, 0.45, { dy: 4, s: 0.3 });
  R.radioG = grp(null);
  boxC(7.1, BF + 1.25, -0.4, 7.8, BF + 1.75, 0.0, M('#3b4048'), R.radioG);
  const ant = mesh(GEO.cyl, M('#c9ced6')); ant.scale.set(0.03, 0.8, 0.03); ant.position.set(7.7, BF + 2.15, -0.2); ant.rotation.z = -0.3; R.radioG.add(ant);
  boxC(7.15, BF + 1.35, 0.0, 7.45, BF + 1.65, 0.03, M('#ffd23f', { emissive: '#ffb300', emissiveIntensity: 0.5 }), R.radioG);
  asm(R.radioG, () => C.radio, 0.4, { dy: 3, s: 0.3 });
  R.mapT = canvasTex(256, 160, (g, w, h) => { g.fillStyle = '#e8d9b0'; g.fillRect(0, 0, w, h); g.fillStyle = '#7cc35a'; g.beginPath(); g.ellipse(80, 70, 50, 34, 0.4, 0, 7); g.fill(); g.beginPath(); g.ellipse(180, 100, 40, 28, -0.3, 0, 7); g.fill(); g.strokeStyle = '#e63946'; g.lineWidth = 6; g.beginPath(); g.moveTo(170, 80); g.lineTo(190, 100); g.moveTo(190, 80); g.lineTo(170, 100); g.stroke(); });
  R.mapG = grp(null);
  const mp = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.7), new THREE.MeshStandardMaterial({ map: R.mapT })); mp.position.set(11.0, -6.6, -3.98); R.mapG.add(mp);
  asm(R.mapG, () => C.map, 0.4, { dy: 0, s: 0.01 });
}
function buildParticles() {
  R.dirt = []; for (let i = 0; i < 30; i++) { const m = mesh(DODE, LP(i % 2 ? '#8a5a3a' : '#6e4630')); m.visible = false; scene.add(m); R.dirt.push(m); }
  R.smokeP = []; for (let i = 0; i < 40; i++) { const m = mesh(ICO1, new THREE.MeshStandardMaterial({ color: '#8d8f94', transparent: true, opacity: 0.6, depthWrite: false, flatShading: true }), false); m.visible = false; scene.add(m); R.smokeP.push(m); }
  R.fire = mesh(ICO1, new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.9, toneMapped: false }), false); R.fire.visible = false; scene.add(R.fire);
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
const CAMYAW = 0.25;
function pivotZ(m, px, py, a) { const p0 = m.userData.p0, dx = p0.x - px, dy = p0.y - py; m.position.set(px + dx * Math.cos(a) - dy * Math.sin(a), py + dx * Math.sin(a) + dy * Math.cos(a), p0.z); m.rotation.set(m.userData.r0.x, m.userData.r0.y, m.userData.r0.z + a); }
function updateWorld(t) {
  applyAsm(t);
  R.clouds.forEach((c, i) => { c.userData.x0 ??= c.position.x; c.position.x = c.userData.x0 + t * (0.2 + 0.04 * i); });
  // casa desaba no porão
  const cave = between(t, C.cave, C.rwH.a) ? EZ.i2(P(t, C.cave, 0.8)) : 0;
  const quake = between(t, C.boom, C.rwH.a) ? 0.05 * Math.sin(t * 40) * (1 - P(t, C.boom, 1.2)) : 0;
  R.house.forEach(m => { m.position.copy(m.userData.p0); m.rotation.copy(m.userData.r0); if (m !== R.slabL && m !== R.slabR) m.position.x += quake; });
  if (cave > 0) {
    pivotZ(R.slabL, -14, 0, -0.7 * cave); pivotZ(R.slabR, -4, 0, 0.7 * cave);
    pivotZ(R.wallL, -13.6, 0, -0.9 * cave); R.wallL.position.y -= 2.2 * cave;
    pivotZ(R.wallR, -4.4, 0, 0.9 * cave); R.wallR.position.y -= 2.2 * cave;
    R.wallBack.position.y -= 3.2 * cave; R.wallBack.rotation.x = 0.25 * cave;
    R.roof.forEach((r, i) => { r.position.y -= 5.2 * cave; r.rotation.z += (i ? 0.25 : -0.25) * cave; });
    R.window.position.y -= 3 * cave; R.houseLamp.position.y -= 2.5 * cave; R.houseLamp.rotation.z = 1.2 * cave;
  }
  // bola de fogo do meteoro
  R.fire.visible = t < C.boom + 0.8;
  if (R.fire.visible) {
    if (t < C.boom) { const k = P(t, 0, C.boom); R.fire.position.set(lerp(30, -26, k), lerp(40, 3, k), lerp(-60, -40, k)); R.fire.scale.setScalar(1.6); R.fire.material.opacity = 0.95; }
    else { const k = P(t, C.boom, 0.8); R.fire.position.set(-26, 3, -40); R.fire.scale.setScalar(2 + 16 * EZ.o(k)); R.fire.material.opacity = 0.9 * (1 - k); }
  }
  // terra cavada
  const dk = P(t, C.dig, C.box0 - C.dig + 0.2);
  for (const [m, y0, y1] of [[R.fillB, -11, -4], [R.fillS, -10, -0.4]]) {
    const h = (y1 - y0) * (1 - dk); m.visible = h > 0.02;
    if (m.visible) { m.scale.y = h; m.position.y = y0 + h / 2; }
  }
  // porta de madeira voa com a onda de choque
  R.wood.visible = between(t, C.door1, C.rwP1.a);
  if (R.wood.visible && t > C.blast) { const k = EZ.o(P(t, C.blast, 0.7)); R.wood.position.set(0.5 + 7 * k, -8.6 + 2.2 * Math.sin(Math.PI * k) - 1.2 * k, 1.45 + 0.8 * k); R.wood.rotation.set(0, 0, -5 * k); }
  // porta blindada: abre leve nos rolamentos, fecha e trava com o volante
  const open = between(t, C.openD, C.wheel) ? EZ.io(P(t, C.openD, 0.8)) * (1 - EZ.io(P(t, C.wheel - 0.7, 0.6))) : 0;
  R.vault.rotation.y = -1.2 * open + (between(t, C.push, C.rwP3.a) ? 0.006 * Math.sin(t * 30) : 0);
  R.wheelG.rotation.x = t > C.wheel ? 2 * Math.PI * EZ.io(P(t, C.wheel, 1.0)) : 0;
  const lock = t > C.pins ? EZ.back(P(t, C.pins, 0.5)) : (t > C.door2 && t < C.openD ? 1 : 0);
  R.pinsG.forEach(p => { const a = p.userData.a, r = 1.15 + 0.45 * lock; p.position.set(0.0, Math.cos(a) * r, 1.45 + Math.sin(a) * r); p.rotation.set(-a, 0, 0); });
  const hg = t > C.hinge ? 1 + 0.35 * Math.sin(Math.PI * P(t, C.hinge, 0.5)) : 1;
  R.hinges.forEach(h => h.scale.set(0.16 * hg, 0.5, 0.16 * hg));
  // luzes
  const lit = !between(t, C.off, C.lightOn);
  R.lamps.forEach(l => { l.visible = t >= C.box1 - 0.2; l.material.emissiveIntensity = lit ? 1.4 : 0.0; });
  // periscópio sobe do arbusto
  R.periTop.visible = t > C.peri;
  if (R.periTop.visible) { const k = EZ.back(P(t, C.peri + 0.3, 0.5)); R.periTop.position.y = 0.3 - 1.4 * (1 - k); R.periTop.rotation.y = 0.4 * Math.sin((t - C.peri) * 0.8); }
  updateParticles(t);
}
const _w = (t, t0, t1, a, b) => { const k = EZ.io(P(t, t0, t1 - t0)); return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), k > 0 && k < 1]; };
function placeActor(t, wt) {
  const A = HOSTW_PLACE, H = HOSTW;
  A.rotation.order = 'YXZ';
  let x = 0, y = BF, z = 0, yaw = CAMYAW, lean = 0, roll = 0, walking = false, squash = 1;
  if (wt < C.rwH.b) {
    x = -9; y = BASEMENT; z = 1.2;
    if (wt > C.cave) { const k = EZ.i2(P(wt, C.cave + 0.3, 0.4)); squash = 1 - 0.65 * k; }
  } else if (wt < S('p1')) { x = 5; y = 0; z = 2.6; }
  else if (wt < S('p2') - 0.05) {
    x = 3.0; z = 1.6; yaw = -Math.PI / 2;
    if (wt > C.blast) { const k = EZ.o(P(wt, C.blast, 0.5)); x += 2.4 * k; lean = -0.9 * k; yaw = lerp(-Math.PI / 2, -1.2, k); }
  } else if (wt < S('p3')) { x = 2.8; z = 2.6; }
  else if (wt < S('p4')) { x = 1.95 + 0.04 * Math.sin(wt * 18); z = 2.35; yaw = -Math.PI / 2; lean = 0.42 + 0.05 * Math.sin(wt * 9); }
  else if (wt < S('a1')) {
    x = 2.2; z = 2.6; yaw = wt > C.openD + 0.2 && wt < C.wheel - 0.4 ? CAMYAW : -Math.PI / 2;
    if (wt > C.wheel - 0.4) { x = 1.75; z = 1.45; }
  } else if (wt < S('a2')) { x = 5; z = 1.2; roll = 0.1 * Math.sin(wt * 5); lean = 0.15; }
  else if (wt < S('l1')) { x = 8.4; z = 2.4; }
  else if (wt < S('l2')) { x = 6.5; z = 1.0; }
  else if (wt < S('f1')) { x = 9.0; z = 0.2; if (between(wt, C.fume, C.rwL2.a)) { roll = 0.12 * Math.sin(wt * 4); lean = 0.2; } }
  else if (wt < S('v1')) { x = 4.6; z = -1.0; if (between(wt, C.empty, C.rwF.a)) lean = 0.2; }
  else if (wt < S('v2')) { x = 6.5; z = 1.2; if (between(wt, C.crazy, C.rwV.a)) { roll = 0.3 * Math.sin(wt * 6); yaw = CAMYAW + 0.6 * Math.sin(wt * 3); } }
  else if (wt < S('d1')) { const r = _w(wt, S('v2'), C.view - 0.4, [6.5, 1.2], [6.0, 2.6]); x = r[0]; z = r[1]; walking = r[2]; yaw = 0; }
  else if (wt < S('o1') - 0.4) { x = 7.6; z = 2.4; }
  else { x = 6.8; z = 2.6; }
  const bob = walking ? 0.12 * Math.abs(Math.sin(t * 12)) : 0;
  A.position.set(x, y + FEET * squash + bob, z);
  A.scale.set(HS * (2 - squash), HS * squash, HS * (2 - squash));
  A.rotation.set(lean, yaw, roll);
  if (between(wt, C.wheel, C.wheel + 1.0)) H.arms.forEach((a, i) => { a.g.rotation.x = -1.5; a.g.rotation.z = (i ? 1 : -1) * (0.3 + 0.4 * Math.sin(t * 9 + i * Math.PI)); });
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
  if (between(t, C.dig, C.box0 + 0.3)) for (let k = 0; k < 6; k++) d = burstPts(t, C.dig + k * 0.3, V3(2 + k * 2, 0.2, 1.5), 4, R.dirt, d, { life: 0.8, spd: 7, g: 10, size: 0.3, seed: k * 7 });
  if (between(t, C.cave, C.rwH.a)) d = burstPts(t, C.cave + 0.5, V3(-9, BASEMENT + 0.3, 1), 12, R.dirt, d, { life: 1.0, spd: 5, g: 6, size: 0.35, seed: 3 });
  R.smokeP.forEach(m => (m.visible = false));
  const puffs = (t0, t1, fn) => { if (!between(t, t0, t1)) return; R.smokeP.forEach((m, i) => { if (m.visible) return; const r = fn(i); if (!r) return; m.visible = true; m.position.copy(r[0]); m.scale.setScalar(r[1]); m.material.opacity = r[2]; }); };
  // fumaça e poeira lá fora (e entrando)
  puffs(C.smoke, C.rwA.a, i => { if (i > 25) return null; const ph = ((t - C.smoke) * 0.25 + rnd(i)) % 1; return [V3(-12 + rnd(i + 1) * 30 + ph * 6, 0.5 + rnd(i + 2) * 3, -6 + rnd(i + 3) * 9), 1.2 + rnd(i + 4) * 1.2, 0.55 * P(t, C.smoke, 0.5)]; });
  puffs(C.smoke + 0.4, C.rwA.a, i => { if (i <= 25) return null; const ph = ((t - C.smoke) * 0.35 + rnd(i)) % 1; return [V3(2 + rnd(i + 5) * 10, lerp(CEIL - 0.5, BF + 0.8, ph), -3 + rnd(i + 6) * 6), 0.7 + rnd(i + 7) * 0.5, 0.45]; });
  // fumaça do gerador enchendo o bunker
  puffs(C.fume, C.rwL2.a, i => { const ph = ((t - C.fume) * 0.4 + rnd(i)) % 1, k = P(t, C.fume, 1.5); if (rnd(i + 9) > k) return null; return [V3(11.8 - ph * 9 * rnd(i + 1), BF + 1.6 + ph * 3.2, -3 + rnd(i + 2) * 6), 0.6 + ph * 0.9, 0.55 * (1 - ph * 0.5)]; });
  // fumaça saindo pela chaminé no arbusto
  puffs(C.exhaust + 0.5, S('f1'), i => { if (i > 12) return null; const ph = ((t - C.exhaust) * 0.6 + i / 12) % 1; return [V3(12.2 + ph * 1.5, 1.0 + ph * 4, 3.4 - ph), 0.3 + ph * 0.8, 0.5 * (1 - ph)]; });
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
  const [a, b] = ['COMO CONSTRUIR UM ', 'BUNKER'];
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
  ctx.fillText('PEÇAS DO BUNKER', 418, 1676);
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

// ================================================================ camada 2D própria do bunker
function drawEra() {}
function calendarDay(x, y, s, n) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(0.05 * Math.sin(n));
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#141824'; ctx.lineWidth = 8; rr(-110, -120, 220, 230, 22); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e63946'; rr(-110, -120, 220, 70, { upperLeft: 22, upperRight: 22 }); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.font = '700 36px F'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('DIA', 0, -84);
  ctx.fillStyle = '#141824'; ctx.font = '700 96px F'; ctx.fillText(String(n), 0, 30); ctx.restore();
}
function failOverlays(t, wt) {
  // chuva de meteoros e clarão
  if (wt < C.rwH.a) {
    const k = 1 - P(wt, C.rwH.a - 0.3, 0.3);
    ctx.save(); ctx.globalAlpha = 0.28 * k; ctx.fillStyle = '#ff6a2a'; ctx.fillRect(0, 0, W, H); ctx.restore();
    for (let i = 0; i < 6; i++) {
      const ph = ((wt * 0.7 + i / 6) % 1), x = 1100 - ph * 1300 + i * 60, y = -80 + ph * 700 + i * 30;
      ctx.save(); ctx.globalAlpha = k;
      const g = ctx.createLinearGradient(x, y, x + 200, y - 120); g.addColorStop(0, 'rgba(255,220,90,1)'); g.addColorStop(1, 'rgba(255,90,40,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 14; ctx.lineCap = 'round'; line(x, y, x + 200, y - 120);
      ctx.fillStyle = '#fff3c0'; circ(x, y, 12); ctx.fill(); ctx.restore();
    }
    if (wt > C.boom) { const f = 1 - P(wt, C.boom, 0.5); ctx.save(); ctx.globalAlpha = 0.85 * f; ctx.fillStyle = '#fff6dc'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  }
  // fumaça lá fora / fumaça do gerador
  for (const [a, b, col] of [[C.smoke, C.rwA.a, '#7d7468'], [C.fume, C.rwL2.a, '#6b6f76']]) if (between(wt, a, b)) { ctx.save(); ctx.globalAlpha = 0.35 * P(wt, a, 1.0); ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  // comida acabando
  if (between(wt, C.empty, C.rwF.a)) calendarDay(840, 560, EZ.back(P(wt, C.empty, 0.4)), Math.min(7, 1 + Math.floor((wt - C.empty) * 3)));
  // meses sem ver o céu
  if (between(wt, C.crazy, C.rwV.a)) calendarDay(840, 560, EZ.back(P(wt, C.crazy, 0.4)), Math.min(180, 30 + Math.floor((wt - C.crazy) * 70)));
  // o que o periscópio mostra
  if (between(wt, C.view, E('v2') + 0.6)) {
    const k = EZ.back(P(wt, C.view, 0.45)) * (1 - P(wt, E('v2') + 0.3, 0.3));
    ctx.save(); ctx.translate(560, 560); ctx.scale(k, k);
    ctx.fillStyle = '#141824'; circ(0, 0, 250); ctx.fill();
    ctx.save(); circ(0, 0, 230); ctx.clip();
    const sky = ctx.createLinearGradient(0, -230, 0, 60); sky.addColorStop(0, '#3d7ad6'); sky.addColorStop(1, '#bfe3ff'); ctx.fillStyle = sky; ctx.fillRect(-240, -240, 480, 480);
    ctx.fillStyle = '#ffd23f'; circ(120, -120, 42); ctx.fill();
    ctx.fillStyle = '#ffffff'; for (const [cx, cy] of [[-120, -110], [-60, -130], [40, -70]]) { circ(cx, cy, 30); ctx.fill(); circ(cx + 30, cy + 6, 24); ctx.fill(); }
    ctx.fillStyle = '#7cc35a'; ctx.beginPath(); ctx.moveTo(-240, 70); ctx.quadraticCurveTo(-60, 10, 80, 60); ctx.quadraticCurveTo(170, 90, 240, 40); ctx.lineTo(240, 240); ctx.lineTo(-240, 240); ctx.fill();
    for (let i = 0; i < 9; i++) { ctx.fillStyle = ['#e63946', '#ffd23f', '#ff8ad8'][i % 3]; circ(-180 + i * 45, 130 + (i % 2) * 40, 10); ctx.fill(); }
    ctx.fillStyle = '#2f7a3a'; for (const tx of [-150, 150]) { ctx.beginPath(); ctx.moveTo(tx, -20); ctx.lineTo(tx - 40, 70); ctx.lineTo(tx + 40, 70); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = '#141824'; ctx.lineWidth = 6; line(-230, 0, -170, 0); line(170, 0, 230, 0); line(0, -230, 0, -170); line(0, 170, 0, 230);
    ctx.restore();
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
    word(C.boom, 0.9, V3(-9, 4, 0), 'BUM!', 150, '#ff5a3c');
    word(C.cave + 0.3, 1.0, V3(-9, 1, 0), 'CRASH!', 130, '#ffd23f');
    word(C.blast, 1.0, V3(2.5, -7, 1.45), 'BLAM!', 130, '#ff5a3c');
    word(C.pins + 0.1, 1.0, V3(3.0, -10.5, 1.45), 'CLAC CLAC!', 96, '#ffd23f');
    word(C.lightOn, 0.9, V3(7, -5.5, 0), 'PLIM!', 110, '#ffd23f');
  }
  if (t < 1.9) {
    const k = EZ.back(P(t, 0.05, 0.35)) * (1 - P(t, 1.6, 0.3));
    const pulse = 1 + 0.06 * Math.sin(t * 16);
    ctx.save(); ctx.translate(540, 520); ctx.scale(k * pulse, k * pulse); ctx.rotate(-0.06);
    bigWord('VAI', 0, -95, 150, '#ffffff');
    bigWord('SOBREVIVER?', 0, 70, 128, '#ffd23f');
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
  sun.position.set(14, 30, 30); sun.target.position.set(2, -4, 0);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 24, bottom: -24, near: 1, far: 120 }); sun.shadow.camera.updateProjectionMatrix();
  buildWorld(); buildBunker(); buildParticles();
  HOST = makeHost(hostScene);
  HOSTW_PLACE = grp(null, 0, FEET, 0); HOSTW_PLACE.scale.setScalar(HS);
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

