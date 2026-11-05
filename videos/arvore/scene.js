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


// ================================================================ medidas do mundo (árvore no meio do campo)
const ERAS = [];
const HS = 0.8;
const FEET = 1.68 * HS;
const FLOOR = 6.2;        // piso da casa na árvore
const BRANCH_Y = 12.3;    // tábuas pregadas no galho (gancho)

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
  // gancho: tábuas no galho
  C.bend = 0.3; C.snap = Math.max(2.4, wT('h2', 'cai') - 0.2);
  C.rwH = RW(E('h2') + 0.15, 0.3);
  // plataforma
  C.beams = wT('v1', 'vigas') - 0.3; C.bolts = wT('v1', 'parafusos') - 0.2; C.planks = wT('v1', 'plataforma') - 0.6;
  C.wind = S('v2') + 0.1; C.rip = wT('v2', 'arranca') - 0.1; C.rwV = RW(E('v2') + 0.15, S('v2') - 0.05);
  C.bracket = wT('v3', 'suporte') - 0.3; C.sway = wT('v3', 'balançar') - 0.6;
  // escada
  C.rope = S('e1') + 0.05; C.twist = wT('e1', 'gira') - 0.1; C.drop = wT('e1', 'despenca') - 0.1; C.rwE = RW(E('e1') + 0.15, S('e1') - 0.05);
  C.stairs = wT('e2', 'caracol') - 0.5; C.cabin = E('e2') - 0.4;
  // telhado
  C.rain = S('t1') + 0.1; C.rwT = RW(E('t1') + 0.15, S('t1') - 0.05);
  C.roof = wT('t2', 'telhado') - 0.3; C.gutter = wT('t2', 'calha') - 0.3;
  // balde e roldana
  C.carry = S('b1') + 0.05; C.oops = wT('b1', 'impossível') - 0.3; C.rwB = RW(E('b1') + 0.15, S('b1') - 0.05);
  C.pulley = wT('b2', 'roldana') - 0.3; C.lift = wT('b2', 'puxa') - 0.2;
  // tirolesa
  C.cable = wT('z1', 'cabo') - 0.3; C.zip = wT('z1', 'voando') - 0.6;
  // decoração
  C.hammock = wT('d1', 'rede') - 0.2; C.lights = wT('d1', 'luzinhas') - 0.2; C.binoc = wT('d1', 'binóculo') - 0.2; C.flag = wT('d1', 'bandeira') - 0.2;
  // final
  C.hostWorld = 0; C.stamp = S('o1') + 0.25; C.cta = S('o2') - 0.1;
  C.eraKeys = [[0, 0]];

  // ---------- câmera
  const CK = [];
  CK.push([0, [5.5, 13.6, 0, 13, 0.5, 0.05, 40]], [0.7, [5, 12.6, 0, 19, 0.45, 0.02, 40], 'o'], [C.snap, [3.5, 8, 0, 26, 0.4, 0.0, 40]], [C.rwH.b, [2, 7, 0, 30, 0.35, 0.05, 40]]);
  CK.push([C.beams + 0.4, [0, 5.5, 0, 22, 0.55, 0.1, 40]], [C.planks + 0.8, [0, 6.5, 1, 24, 0.4, 0.2, 40]]);
  CK.push([C.wind + 0.3, [0, 8, 0, 32, 0.4, 0.06, 40]], [C.rwV.b, [0, 8, 0, 32, 0.4, 0.06, 40]]);
  CK.push([C.bracket + 0.3, [1.4, 5.6, 4.6, 9, 0.6, 0.15, 40]], [E('v3'), [0, 7, 0, 30, 0.35, 0.06, 40]]);
  CK.push([C.rope + 0.3, [2.5, 3.5, 4.5, 20, 0.45, 0.05, 40]], [C.rwE.b, [2.5, 3.5, 4.5, 20, 0.45, 0.05, 40]]);
  CK.push([C.stairs + 0.3, [0, 3.5, 1, 22, 0.35, 0.12, 40]], [C.cabin + 0.6, [0, 7.5, 1, 24, 0.3, 0.08, 40]]);
  CK.push([C.rain + 0.3, [0, 8, 1.5, 17, 0.2, 0.05, 40]], [C.rwT.b, [0, 8, 1.5, 17, 0.2, 0.05, 40]]);
  CK.push([C.roof + 0.3, [0, 9, 1, 25, 0.35, 0.12, 40]], [E('t2'), [0.5, 9, 1, 24, 0.45, 0.1, 40]]);
  CK.push([C.carry + 0.2, [1, 3.5, 2.5, 18, 0.3, 0.06, 40]], [C.rwB.b, [1, 3.5, 2.5, 18, 0.3, 0.06, 40]]);
  CK.push([C.pulley + 0.3, [4, 5, 3.5, 24, 0.5, 0.06, 40]], [E('b2'), [4, 6.5, 3.5, 22, 0.55, 0.06, 40]]);
  CK.push([C.cable + 0.3, [-6, 6, 4.5, 26, 0.5, 0.1, 40]], [C.zip, [-4.5, 7.2, 4.8, 16, 0.75, 0.06, 40]], [C.zip + 2.2, [-24.5, 1.5, 9.6, 15, 0.75, 0.06, 40], 'lin'], [E('z1') + 0.2, [-24.5, 1.5, 9.6, 15, 0.8, 0.06, 40]]);
  CK.push([C.hammock + 0.2, [0, 8, 2, 22, 0.35, 0.08, 40]], [E('d1'), [0, 8.5, 2, 24, 0.3, 0.08, 40]]);
  CK.push([C.stamp - 0.3, [0, 9.5, 0, 38, 0.3, 0.06, 42]], [TL.duration, [0, 9.5, 0, 39, 0.22, 0.06, 42]]);
  C.camKeys = sortK(CK);

  C.shakes = [[C.snap, 0.3], [C.snap + 0.9, 0.35], [C.rip + 0.8, 0.3], [C.drop + 0.8, 0.3], [C.stamp + 0.18, 0.25]];

  // ---------- reações do bonequinho
  const Rx = (t, d, e, p, b) => REACT.push({ t, d, e, p, b });
  Rx(0.3, C.snap - 0.3, 'worried', 'cheeks', null);
  Rx(1.0, 1.3, 'worried', 'cheeks', 'Hã?');
  Rx(C.snap, C.rwH.a - C.snap, 'shock', 'up', 'Aaaah!');
  Rx(E('v1') - 1.0, 1.0, 'happy', 'thumbs', null);
  Rx(C.rip, C.rwV.a - C.rip, 'shock', 'up', 'Não!');
  Rx(E('v3') - 1.0, 1.0, 'happy', 'thumbs', null);
  Rx(C.drop, C.rwE.a - C.drop, 'shock', 'up', 'Ai!');
  Rx(E('e2') - 1.0, 1.0, 'happy', 'thumbs', null);
  Rx(C.rain + 0.5, C.rwT.a - C.rain - 0.5, 'worried', 'cover', 'Molhou!');
  Rx(E('t2') - 1.0, 1.0, 'happy', 'thumbs', null);
  Rx(C.oops, C.rwB.a - C.oops, 'shock', 'cheeks', 'Meu lanche!');
  Rx(C.lift + 0.8, 1.2, 'happy', 'thumbs', 'Delícia!');
  Rx(C.zip, 2.4, 'happy', 'cheer', 'Uhuul!');
  Rx(E('d1') - 1.0, 1.0, 'happy', 'thumbs', null);
  Rx(C.stamp + 0.15, 2.4, 'happy', 'cheer', 'Uhuul!');
  Rx(C.cta, TL.duration - C.cta, 'happy', 'point', null);
  for (const r of C.REW) Rx(r.a, r.b - r.a, 'worried', 'point', 'Volta!');
  REACT.sort((a, b) => a.t - b.t);

  // ---------- etiquetas
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const Lb = (txt, t0, t1, at, off) => { LABELS.push({ txt, t0, t1, at, off }); CHIPS.push({ txt, t: t0 }); };
  Lb('PLATAFORMA', wT('v1', 'plataforma'), E('v1') + 0.3, () => V(3.5, FLOOR, 4.5), [-120, -300]);
  Lb('APOIO FLUTUANTE', wT('v3', 'apoio'), E('v3') + 0.3, () => V(1.4, 5.8, 4.8), [60, -330]);
  Lb('ESCADA CARACOL', wT('e2', 'caracol'), E('e2') + 0.3, () => V(-2.2, 3, 1.5), [80, -330]);
  Lb('TELHADO', wT('t2', 'telhado'), E('t2') + 0.3, () => V(-3.5, 10.4, 3), [80, -280]);
  Lb('ROLDANA', wT('b2', 'roldana'), E('b2') + 0.3, () => V(5.4, 9.2, 3.5), [-60, -280]);
  Lb('TIROLESA', wT('z1', 'tirolesa'), E('z1') + 0.3, () => V(-14, 5.6, 7.2), [60, -300]);

  // ---------- setas
  const Ar = (t0, t1, at, dir, len, col, kind = 'line') => ARROWS.push({ t0, t1, at, dir: new THREE.Vector3(...dir), len, col, kind });
  const RED = '#ff4d3d', BLUE = '#4d9bff', YEL = '#ffd23f', GREEN = '#2ecc71';
  Ar(0.8, C.snap, () => V(6.2, BRANCH_Y + 3.5, 0), [0, -1, 0], 1.5, RED);
  for (const y of [9, 14]) Ar(C.wind, C.rip + 0.4, () => V(-12, y, 0), [1, 0, 0], 4, BLUE);
  Ar(C.sway, E('v3') + 0.2, () => V(1.4, 6.4, 4.8), [1, 0, 0], 1.0, YEL);
  Ar(C.sway, E('v3') + 0.2, () => V(1.4, 6.4, 4.8), [-1, 0, 0], 1.0, YEL);
  Ar(C.twist, C.drop, () => V(2.5, 3.5, 4.6), [0, 0, 0], 1, YEL, 'spin');
  Ar(C.gutter + 0.4, E('t2') + 0.2, () => V(4.6, 8.0, 4.4), [0, -1, 0], 2, BLUE);
  Ar(C.lift, C.lift + 1.4, () => V(5.4, 3.5, 3.5), [0, 1, 0], 2, GREEN);
  Ar(C.zip + 0.2, C.zip + 1.6, () => V(-8, 7, 6), [-1, -0.3, 0.2], 3, GREEN);

  // ---------- efeitos sonoros
  sfx(0.0, 'whoosh', 0.7); for (let k = 0; k < 5; k++) sfx(0.4 + k * 0.45, 'creak', 0.35 + k * 0.08);
  sfx(C.snap, 'snap', 1.0); sfx(C.snap + 0.1, 'fall', 0.7, 0.8); sfx(C.snap + 0.9, 'crash', 1.0);
  asmSfx(C.beams, 0.8, 3, 'thud', 0.6); asmSfx(C.bolts, 0.6, 4, 'clank', 0.6); asmSfx(C.planks, 1.4, 10, 'clac', 0.4);
  sfx(C.wind, 'whoosh', 0.8); sfx(C.wind + 0.2, 'strain', 0.5, C.rip - C.wind); sfx(C.rip, 'snap', 1.0); sfx(C.rip + 0.8, 'crash', 0.9);
  sfx(C.bracket, 'clank', 0.6); sfx(C.sway, 'whoosh', 0.5); sfx(C.sway + 0.3, 'slide', 0.4, 1.4);
  sfx(C.twist, 'creak', 0.6); sfx(C.drop, 'fall', 0.6, 0.6); sfx(C.drop + 0.8, 'thud', 1.0);
  asmSfx(C.stairs, 1.4, 10, 'clac', 0.4); asmSfx(C.cabin, 0.9, 6, 'thud', 0.4);
  sfx(C.rain, 'hum', 0.35, C.rwT.a - C.rain); asmSfx(C.roof, 0.8, 3, 'thud', 0.6); sfx(C.gutter, 'clank', 0.5); sfx(C.gutter + 0.3, 'slide', 0.4, 1.0);
  sfx(C.oops, 'fall', 0.5, 0.5); sfx(C.oops + 0.6, 'crash', 0.6);
  sfx(C.pulley, 'clank', 0.6); sfx(C.lift, 'zip', 0.6); sfx(C.lift + 1.3, 'ding', 0.6);
  sfx(C.cable, 'zip', 0.7); sfx(C.zip, 'whoosh', 0.9); sfx(C.zip + 0.3, 'hum', 0.4, 1.6);
  for (const k of ['hammock', 'lights', 'binoc', 'flag']) sfx(C[k] + 0.2, 'pop', 0.65);
  sfx(C.lights + 0.3, 'powerup', 0.4);
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
// ---------- campo e árvore
const trunkR = y => 1.35 - 0.35 * (y / 16);
function buildWorld() {
  boxC(-90, -0.4, -90, 90, 0, 50, LP('#7cc35a'));
  // árvores ao redor (sem atrapalhar a tirolesa)
  for (let i = 0; i < 46; i++) {
    const x = (rnd(i * 3) - 0.5) * 120, z = -10 - rnd(i * 3 + 1) * 60;
    if (Math.abs(x) < 14 && z > -18) continue;
    lpTree(x, z, 1.0 + rnd(i + 2) * 0.9, rnd(i + 7) < 0.45);
  }
  for (const [x, z, s, p] of [[16, 4, 1.3, true], [20, -6, 1.1, false], [-34, -4, 1.2, true], [12, 14, 1.0, false]]) lpTree(x, z, s, p);
  for (let i = 0; i < 9; i++) bush(-14 + rnd(i) * 34, 0, 12 + rnd(i + 2) * 8, 0.9 + rnd(i + 4) * 0.6, i % 2 ? '#58a945' : '#64b34f');
  for (let i = 0; i < 6; i++) { const h = mesh(ICO, LP(i % 2 ? '#6fb85a' : '#5ea94c')); h.scale.set(28, 10 + rnd(i) * 8, 18); h.position.set(-100 + i * 40, -2, -95 - rnd(i + 3) * 20); scene.add(h); }
  // florzinhas
  const fl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.12, 0), new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8 }), 160);
  const mtx = new THREE.Matrix4(), cc = new THREE.Color();
  for (let i = 0; i < 160; i++) { const x = (rnd(i * 7) - 0.5) * 50, z = -6 + rnd(i * 7 + 1) * 30; mtx.makeTranslation(x, 0.15, z); fl.setMatrixAt(i, mtx); fl.setColorAt(i, cc.set(['#ff5c8a', '#ffd23f', '#ffffff', '#b07cff'][i % 4])); }
  scene.add(fl);
  addTufts(600, (x, z) => Math.hypot(x, z) > 3);
  addClouds(8);
  // a árvore
  R.tree = grp(null);
  const bark = LP('#7a5232'), barkD = LP('#6a4628');
  const trunk = mesh(new THREE.CylinderGeometry(1.0, 1.35, 16, 9), bark); trunk.position.y = 8; R.tree.add(trunk);
  for (let k = 0; k < 5; k++) { const a = k * 1.26, r = mesh(new THREE.ConeGeometry(0.5, 1.8, 5), barkD); r.position.set(Math.sin(a) * 1.3, 0.5, Math.cos(a) * 1.3); r.rotation.set(Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9); R.tree.add(r); }
  for (const [a, b, r] of [[V3(-0.6, 13.5, -0.4), V3(-6.5, 16.5, -2.5), 0.32], [V3(0.3, 14.5, 0.6), V3(3.5, 18.5, 3), 0.28], [V3(-0.2, 15, -0.6), V3(1, 19.5, -5), 0.3]]) member(R.tree, a, b, r, barkD);
  const leaf = [LP('#3f9a4a'), LP('#4caf50'), LP('#5bbd55'), LP('#378b40')];
  R.canopy = grp(R.tree);
  for (const [x, y, z, s] of [[0, 19, 0, 5.6], [-5, 17.5, -2, 4.2], [4.5, 18, 2.5, 4.0], [1.5, 22, -1.5, 4.2], [-2.5, 21, 2.5, 3.6], [5.0, 17.2, -4.6, 3.0], [-6.5, 16, 3, 3.0], [2, 16.2, 5, 3.0], [9.5, 17.5, -2.5, 2.4]]) { const m = mesh(ICO, leaf[Math.floor(rnd(x + y) * 4)]); m.scale.set(s, s * 0.85, s); m.position.set(x, y, z); m.rotation.set(rnd(x) * 2, rnd(y) * 2, 0); R.canopy.add(m); }
  // galho do gancho, com tábuas pregadas
  R.branch = grp(R.tree, 0.8, 11.9, 0);
  member(R.branch, V3(0, 0, 0), V3(8.8, 0.15, 0), 0.32, barkD);
  const lf = mesh(ICO, leaf[1]); lf.scale.setScalar(0.9); lf.position.set(9.4, 0.4, -0.6); R.branch.add(lf);
  R.hookPlanks = [];
  for (let k = 0; k < 5; k++) { const p = boxC(4.2, 0.3, -0.95 + k * 0.4, 8.4, 0.45, -0.6 + k * 0.4, M('#c89b6a'), R.branch); p.userData.p0 = p.position.clone(); R.hookPlanks.push(p); }
}
// ---------- plataforma, escadas e casinha
function buildHouse() {
  const wood = M('#b98a5a', { roughness: 0.8 }), woodD = M('#8b5a33', { roughness: 0.8 }), woodL = M('#d2a877', { roughness: 0.8 });
  R.plat = grp(null);
  R.beamsG = grp(R.plat);
  for (const x of [-1.4, 1.4]) boxC(x - 0.15, 5.7, -4.0, x + 0.15, 6.0, 5.0, woodD, R.beamsG);
  asm(R.beamsG, () => C.beams, 0.5, { dy: -4, s: 0.6 });
  R.boltsG = grp(R.plat);
  const steel = M('#c9ced6', { metalness: 0.8, roughness: 0.25 });
  for (const z of [-0.55, 0.55]) { const b = mesh(GEO.cyl, steel); b.scale.set(0.08, 3.3, 0.08); b.rotation.z = Math.PI / 2; b.position.set(0, 5.85, z); R.boltsG.add(b); for (const x of [-1.6, 1.6]) { const h = mesh(GEO.cyl, steel); h.scale.set(0.16, 0.1, 0.16); h.rotation.z = Math.PI / 2; h.position.set(x, 5.85, z); R.boltsG.add(h); } }
  asm(R.boltsG, () => C.bolts, 0.4, { dy: 0, s: 0.01 });
  R.planksG = grp(R.plat);
  let k = 0;
  for (let z = -4.0; z < 4.99; z += 0.5, k++) {
    const z0 = z, z1 = z + 0.45, cut = [];
    if (z1 > -1.3 && z0 < 1.3) cut.push([-1.3, 1.3]);
    if (z1 > 1.8 && z0 < 3.2) cut.push([-0.9, 0.9]);
    const segs = cut.length ? [[-4, cut[0][0]], [cut[0][1], 4]] : [[-4, 4]];
    for (const [a, b] of segs) { const p = boxC(a, 6.0, z0, b, FLOOR, z1, k % 3 ? wood : woodL, R.planksG); asm(p, () => C.planks + k * 0.06, 0.35, { dy: 3, s: 0.5 }); }
  }
  // apoio flutuante (suporte amarelo sob a viga direita)
  R.bracketG = grp(R.plat);
  boxC(1.15, 5.5, 0.3, 1.7, 5.7, 1.1, M('#ffd23f'), R.bracketG);
  boxC(1.62, 5.52, 0.32, 1.72, 6.0, 1.08, M('#ffd23f'), R.bracketG);
  asm(R.bracketG, () => C.bracket, 0.45, { dy: -2, s: 0.3 });
  // escada de corda
  R.rope = grp(null, 2.5, 6.0, 5.1);
  const rp = M('#d8b47a', { roughness: 1 });
  for (const x of [-0.45, 0.45]) member(R.rope, V3(x, 0, 0), V3(x, -5.8, 0), 0.05, rp);
  for (let y = -0.5; y > -5.8; y -= 0.6) member(R.rope, V3(-0.45, y, 0), V3(0.45, y, 0), 0.06, woodD);
  asm(R.rope, () => C.rope, 0.4, { dy: 3, s: 0.6 });
  // escada caracol em volta do tronco
  R.stepsG = grp(null);
  const a0 = -2.5 * Math.PI, N = 22;
  R.helix = [];
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1), a = lerp(a0, 0, u), y = lerp(0.35, 5.85, u), r = 2.4;
    const s = box(0.6, 0.12, 1.7, woodL, Math.sin(a) * r, y, Math.cos(a) * r, R.stepsG); s.rotation.y = a;
    asm(s, () => C.stairs + i * 0.05, 0.3, { dy: 2, s: 0.4 });
    R.helix.push(V3(Math.sin(a) * r, y + 0.06, Math.cos(a) * r));
  }
  const rail = []; for (let i = 0; i <= 60; i++) { const u = i / 60, a = lerp(a0, 0, u); rail.push(V3(Math.sin(a) * 3.2, lerp(1.35, 6.9, u), Math.cos(a) * 3.2)); }
  R.railG = grp(null);
  R.railG.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), 120, 0.07, 6, false), woodD));
  for (let i = 0; i < N; i += 3) member(R.railG, V3(R.helix[i].x * 1.33, R.helix[i].y, R.helix[i].z * 1.33), V3(R.helix[i].x * 1.33, R.helix[i].y + 1.0, R.helix[i].z * 1.33), 0.05, woodD);
  asm(R.railG, () => C.stairs + 1.0, 0.4, { dy: 0, s: 0.01 });
  R.stairCurve = new THREE.CatmullRomCurve3(R.helix);
  // casinha de tábuas (com frestas)
  R.cabin = []; let n = 0;
  const cab = m => { asm(m, () => C.cabin + (n++ % 12) * 0.03, 0.3, { dy: 2, s: 0.5 }); R.cabin.push(m); return m; };
  for (let z = -3.6; z < 1.55; z += 0.5) { cab(boxC(-3.6, FLOOR, z, -3.4, 9.4, Math.min(z + 0.44, 1.6), woodL)); cab(boxC(3.4, FLOOR, z, 3.6, 9.4, Math.min(z + 0.44, 1.6), woodL)); }
  for (let x = -3.4; x < 3.35; x += 0.5) { cab(boxC(x, FLOOR, -3.6, Math.min(x + 0.44, 3.4), 9.4, -3.4, woodL)); if (x + 0.44 < -0.6 || x > 0.6) cab(boxC(x, FLOOR, 1.4, Math.min(x + 0.44, 3.4), 7.3, 1.6, woodL)); }
  R.flatRoof = grp(null);
  for (let z = -3.6; z < 1.55; z += 0.5) { const z1 = Math.min(z + 0.42, 1.6); if (z1 > -1.25 && z < 1.25) { boxC(-3.6, 9.4, z, -1.15, 9.6, z1, wood, R.flatRoof); boxC(1.15, 9.4, z, 3.6, 9.6, z1, wood, R.flatRoof); } else boxC(-3.6, 9.4, z, 3.6, 9.6, z1, wood, R.flatRoof); }
  asm(R.flatRoof, () => C.cabin + 0.4, 0.4, { dy: 2, s: 0.6 });
  // telhado inclinado e calha
  R.roofG = grp(null);
  for (const s of [-1, 1]) { const r = box(4.6, 0.25, 6.6, M('#c0392b', { roughness: 0.7 }), s * 2.15, 10.45, -0.95, R.roofG); r.rotation.z = -s * 0.37; }
  asm(R.roofG, () => C.roof, 0.5, { dy: 5, s: 0.6 });
  R.gutterG = grp(null);
  const gm = M('#9aa3ad', { metalness: 0.5, roughness: 0.4 });
  for (const s of [-1, 1]) member(R.gutterG, V3(s * 4.35, 9.55, -4.2), V3(s * 4.35, 9.55, 2.3), 0.14, gm);
  member(R.gutterG, V3(4.35, 9.55, 2.3), V3(4.35, 6.4, 2.3), 0.11, gm); member(R.gutterG, V3(4.35, 6.4, 2.3), V3(5.6, 5.9, 2.3), 0.11, gm);
  asm(R.gutterG, () => C.gutter, 0.4, { dy: 2, s: 0.4 });
  // roldana e balde
  R.pulleyG = grp(null);
  member(R.pulleyG, V3(3.6, 9.2, 1.0), V3(5.8, 9.2, 1.0), 0.1, woodD);
  const wh = mesh(new THREE.TorusGeometry(0.3, 0.08, 8, 16), M('#5d6675', { metalness: 0.5 })); wh.position.set(5.8, 8.95, 1.0); R.pulleyG.add(wh); R.wheel = wh;
  asm(R.pulleyG, () => C.pulley, 0.45, { dy: 2, s: 0.3 });
  R.bucket = grp(null, 6.1, 0.0, 1.0);
  const bk = mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.65, 12, 1, true), M('#4d7cfe', { side: THREE.DoubleSide })); bk.position.y = 0.33; R.bucket.add(bk);
  const bb = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 12), M('#3a5fd0')); bb.position.y = 0.02; R.bucket.add(bb);
  boxC(-0.2, 0.3, -0.12, 0.2, 0.5, 0.12, M('#e9a23b'), R.bucket); const cup = mesh(GEO.cyl, M('#ff5c8a')); cup.scale.set(0.1, 0.32, 0.1); cup.position.set(0.18, 0.5, 0.1); R.bucket.add(cup);
  asm(R.bucket, () => C.pulley + 0.2, 0.4, { dy: 1, s: 0.3 });
  R.ropes = cylPool(2, 0.03, M('#d8b47a'));
  // lanche (falha do b1)
  R.snack = [];
  for (const [col, sz] of [['#e9a23b', [0.6, 0.25, 0.4]], ['#ff5c8a', [0.25, 0.45, 0.25]], ['#e63946', [0.3, 0.3, 0.3]]]) { const m = box(sz[0], sz[1], sz[2], M(col), 0, 0, 0); m.visible = false; R.snack.push(m); }
  // tirolesa
  R.zipG = grp(null);
  member(R.zipG, V3(-3.8, FLOOR, 4.6), V3(-3.8, 9.2, 4.6), 0.12, woodD);
  member(R.zipG, V3(-26, 0, 10), V3(-26, 2.8, 10), 0.18, woodD);
  member(R.zipG, V3(-3.8, 8.9, 4.6), V3(-26, 2.5, 10), 0.035, M('#3b4048', { metalness: 0.6 }));
  asm(R.zipG, () => C.cable, 0.6, { dy: 0, s: 0.01 });
  R.trolley = grp(null);
  boxC(-0.2, -0.15, -0.1, 0.2, 0.1, 0.1, M('#e63946'), R.trolley); member(R.trolley, V3(0, -0.1, 0), V3(0, -0.9, 0), 0.03, M('#3b4048'));
  member(R.trolley, V3(-0.4, -0.9, 0), V3(0.4, -0.9, 0), 0.06, M('#ffd23f'));
  // decoração
  R.hammock = grp(null, -2.2, 7.3, -0.9);
  const hm = mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.2, 14, 1, true, Math.PI / 2, Math.PI), M('#ff8a2a', { side: THREE.DoubleSide })); hm.rotation.z = Math.PI / 2; R.hammock.add(hm);
  for (const x of [-1.2, 1.2]) member(R.hammock, V3(x * 0.92, 0, 0), V3(x, 0.9, 0), 0.03, M('#d8b47a'));
  asm(R.hammock, () => C.hammock, 0.45, { dy: 2, s: 0.3 });
  R.lightsG = grp(null);
  const lc = ['#ffd23f', '#ff5c8a', '#4dd2ff', '#7dff8a'];
  for (let i = 0; i <= 14; i++) { const u = i / 14, x = lerp(-3.6, 3.6, u), y = 9.3 - 0.35 * Math.sin(Math.PI * u); const b = mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: lc[i % 4], toneMapped: false }), false); b.position.set(x, y, 1.75); R.lightsG.add(b); }
  asm(R.lightsG, () => C.lights, 0.35, { dy: 0, s: 0.01 });
  R.binocG = grp(null, 2.0, 7.42, 1.5);
  for (const x of [-0.12, 0.12]) { const c = mesh(GEO.cyl, M('#2b2f39')); c.scale.set(0.09, 0.3, 0.09); c.rotation.x = Math.PI / 2; c.position.x = x; R.binocG.add(c); }
  asm(R.binocG, () => C.binoc, 0.35, { dy: 1, s: 0.2 });
  R.flagG = grp(null, 2.4, 10.6, -0.9);
  member(R.flagG, V3(0, 0, 0), V3(0, 3.2, 0), 0.05, M('#5d6675'));
  R.flagCloth = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8, 8, 2), new THREE.MeshStandardMaterial({ map: canvasTex(128, 80, (g, w, h) => { g.fillStyle = '#e63946'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd23f'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 12 : 28; g.lineTo(64 + Math.cos(a) * r, 40 + Math.sin(a) * r); } g.fill(); }), side: THREE.DoubleSide }));
  R.flagCloth.position.set(0.68, 2.75, 0); R.flagG.add(R.flagCloth);
  asm(R.flagG, () => C.flag, 0.45, { dy: 3, s: 0.2 });
}
function buildParticles() {
  R.drops = []; for (let i = 0; i < 50; i++) { const m = mesh(GEO.sph, new THREE.MeshStandardMaterial({ color: '#7cc8ff', transparent: true, opacity: 0.8, depthWrite: false }), false); m.visible = false; scene.add(m); R.drops.push(m); }
  R.leaves = []; for (let i = 0; i < 30; i++) { const m = mesh(ICO, LP(i % 2 ? '#4caf50' : '#8bc34a'), false); m.visible = false; scene.add(m); R.leaves.push(m); }
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
const CAMYAW = 0.3;
const ZIP0 = V3(-3.8, 8.9, 4.6), ZIP1 = V3(-26, 2.5, 10);
const zipU = t => P(t, C.zip, 2.2);
const bucketY = t => t > C.lift ? lerp(0, FLOOR + 0.25, EZ.io(P(t, C.lift, 1.3))) : 0;
function updateWorld(t) {
  applyAsm(t);
  R.clouds.forEach((c, i) => { c.userData.x0 ??= c.position.x; c.position.x = c.userData.x0 + t * (0.2 + 0.04 * i); });
  // galho enverga e quebra
  const hook = t < C.rwH.a;
  let bz = -0.03;
  if (hook) {
    bz = -(0.03 + 0.2 * EZ.io(P(t, C.bend, C.snap - C.bend))) + 0.025 * Math.sin(t * 9) * (t > C.bend ? 1 : 0);
    if (t > C.snap) bz -= 1.2 * EZ.i2(P(t, C.snap, 0.6));
  }
  R.branch.rotation.z = bz;
  R.hookPlanks.forEach((p, i) => {
    p.visible = hook;
    p.position.copy(p.userData.p0); p.rotation.set(0, 0, 0);
    if (hook && t > C.snap) { const k = EZ.i2(P(t, C.snap + i * 0.04, 0.8)); p.position.y -= 9 * k; p.position.x += (i - 2) * 0.6 * k; p.rotation.set(k * (i + 1), 0, k * 2); }
  });
  // vento balança a árvore
  let sway = 0;
  if (between(t, C.wind, C.rwV.a)) sway = 0.06 * Math.sin((t - C.wind) * 3.2) * P(t, C.wind, 0.8);
  if (between(t, C.sway, E('v3') + 0.3)) sway = 0.035 * Math.sin((t - C.sway) * 3.2);
  R.tree.rotation.z = sway;
  R.plat.position.set(0, 0, 0); R.plat.rotation.set(0, 0, 0);
  if (between(t, C.rip, C.rwV.a)) { const k = EZ.i2(P(t, C.rip, 0.8)); R.plat.position.y = -5.6 * k; R.plat.position.x = 1.5 * k; R.plat.rotation.set(0.25 * k, 0, -0.35 * k); }
  if (between(t, C.sway, E('v3') + 0.3)) R.bracketG.position.z += 0.25 * Math.sin((t - C.sway) * 3.2);
  // escada de corda gira
  R.rope.visible = R.rope.visible && t < S('e2') + 0.3;
  R.rope.rotation.set(0, 0, 0);
  if (between(t, C.twist, C.rwE.a)) { const k = P(t, C.twist, 0.5); R.rope.rotation.set(0.15 * Math.sin(t * 5) * k, 0.9 * Math.sin((t - C.twist) * 4) * k, 0); }
  // balde, cordas e roldana
  R.bucket.position.y = bucketY(t);
  R.wheel.rotation.z = -6 * EZ.io(P(t, C.lift, 1.3));
  if (t > C.pulley + 0.3) {
    const by = R.bucket.position.y;
    const ends = [[V3(6.1, 8.95, 1.0), V3(6.1, by + 0.75, 1.0)], [V3(5.5, 8.95, 1.0), V3(HOSTW_PLACE.position.x + 0.5, HOSTW_PLACE.position.y + 0.4, HOSTW_PLACE.position.z)]];
    R.ropes.pool.forEach((m, i) => { if (i === 1 && !between(t, C.pulley + 0.3, E('b2') + 0.3)) { m.visible = false; return; } const [a, b] = ends[i]; const d = b.clone().sub(a), l = d.length(); m.visible = true; m.scale.set(0.03, l, 0.03); m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(_up, d.normalize()); });
  } else R.ropes.pool.forEach(m => (m.visible = false));
  // tirolesa
  R.trolley.visible = t > C.cable + 0.4;
  R.trolley.position.copy(ZIP0).lerp(ZIP1, zipU(t));
  R.flagCloth.rotation.y = 0.3 * Math.sin(t * 3);
  updateParticles(t);
}
const _w = (t, t0, t1, a, b) => { const k = EZ.io(P(t, t0, t1 - t0)); return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), k > 0 && k < 1]; };
const _bp = new THREE.Vector3();
function placeActor(t, wt) {
  const A = HOSTW_PLACE, H = HOSTW;
  A.rotation.order = 'YXZ';
  let x = 0, y = 0, z = 0, yaw = CAMYAW, lean = 0, roll = 0, walking = false, center = null;
  R.snack.forEach(m => (m.visible = false));
  if (wt < C.rwH.b) {
    R.branch.updateWorldMatrix(true, false);
    _bp.set(6.2, 0.45, 0); R.branch.localToWorld(_bp);
    x = _bp.x; y = _bp.y; z = 0.1; roll = R.branch.rotation.z * 0.6;
    if (wt > C.snap) { const k = EZ.i2(P(wt, C.snap, 0.8)); y = lerp(BRANCH_Y + 0.2, 0.2, k); x = 6.4 + k; lean = 1.3 * k; roll = 0; }
  } else if (wt < S('v2')) { x = 5.6; z = 2.4; }
  else if (wt < S('v3')) {
    x = 2.4; y = FLOOR; z = 3.6;
    if (wt > C.rip) { const k = EZ.i2(P(wt, C.rip, 0.8)); y = lerp(FLOOR, 0.3, k); x += 1.5 * k; lean = -1.2 * k; }
  } else if (wt < S('e1')) { x = 4.6; z = 4.6; }
  else if (wt < S('e2')) {
    const k = EZ.io(P(wt, C.rope + 0.2, C.drop - C.rope - 0.3));
    const ry = R.rope.rotation.y;
    x = 2.5 + Math.sin(ry) * 0.6; z = 5.1 + Math.cos(ry) * 0.6; y = 3.0 * k; yaw = Math.PI + ry;
    if (wt > C.drop) { const f = EZ.i2(P(wt, C.drop, 0.7)); y = lerp(3.0, 0.3, f); z += 1.2 * f; lean = -1.3 * f; }
  } else if (wt < S('t1')) {
    if (wt < C.stairs + 1.2) { x = 2.8; z = 3.6; }
    else if (wt < E('e2') - 0.2) { const u = EZ.io(P(wt, C.stairs + 1.2, E('e2') - C.stairs - 1.4)); const p = R.stairCurve.getPointAt(u), tg = R.stairCurve.getTangentAt(u); x = p.x; y = p.y; z = p.z; yaw = Math.atan2(tg.x, tg.z); walking = true; }
    else { x = 1.6; y = FLOOR; z = 3.4; }
  } else if (wt < S('t2')) { x = 1.6; y = FLOOR; z = -0.4; }
  else if (wt < S('b1')) { x = 2.0; y = FLOOR; z = 3.6; }
  else if (wt < S('b2')) {
    const u = lerp(0.12, 0.45, EZ.io(P(wt, C.carry, C.oops - C.carry)));
    const p = R.stairCurve.getPointAt(u), tg = R.stairCurve.getTangentAt(u);
    x = p.x; y = p.y; z = p.z; yaw = Math.atan2(tg.x, tg.z); walking = wt < C.oops;
    if (wt > C.oops) roll = 0.25 * Math.sin((wt - C.oops) * 9) * (1 - P(wt, C.oops, 1.2));
    R.snack.forEach((m, i) => {
      m.visible = true;
      const hx = x + Math.sin(yaw) * 0.7, hz = z + Math.cos(yaw) * 0.7;
      if (wt < C.oops) m.position.set(hx, y + FEET + 0.15 + i * 0.4, hz);
      else { const k = P(wt, C.oops + i * 0.08, 0.7); m.position.set(hx + (i - 1) * 0.8 * k, lerp(y + FEET + 0.15 + i * 0.4, 0.2, EZ.i2(k)), hz + 0.8 * k); m.rotation.set(k * 5, k * 3, 0); }
    });
  } else if (wt < S('z1')) { x = 3.4; y = FLOOR; z = 2.2; yaw = Math.PI / 2; }
  else if (wt < S('d1')) {
    if (wt < C.zip - 0.3) { x = -3.0; y = FLOOR; z = 4.0; }
    else if (wt < C.zip + 2.2) { const p = ZIP0.clone().lerp(ZIP1, zipU(wt)); center = [p.x, p.y - 0.9 - 1.25, p.z + 0.1]; yaw = -1.2; lean = -0.15; }
    else { x = -24.6; z = 9.6; }
  } else if (wt < S('o1') - 0.4) { x = 1.2; y = FLOOR; z = 3.4; }
  else { x = 0.6; y = FLOOR; z = 3.8; }
  const bob = walking ? 0.1 * Math.abs(Math.sin(t * 12)) : 0;
  if (center) A.position.set(...center); else A.position.set(x, y + FEET + bob, z);
  A.rotation.set(lean, yaw, roll);
  if (between(wt, C.lift - 0.2, C.lift + 1.4)) H.arms.forEach((a, i) => { a.g.rotation.x = -1.3 + 0.6 * Math.sin(t * 9 + i * Math.PI); a.g.rotation.z = (i ? 1 : -1) * 0.2; });
  if (between(wt, C.rope + 0.2, C.drop)) H.arms.forEach((a, i) => { a.g.rotation.x = -2.6 + 0.4 * Math.sin(t * 8 + i * Math.PI); a.g.rotation.z = (i ? 1 : -1) * 0.2; });
  if (between(wt, C.carry, C.oops)) H.arms.forEach((a, i) => { a.g.rotation.x = -1.5; a.g.rotation.z = (i ? 1 : -1) * 0.15; });
  if (center) H.arms.forEach((a, i) => { a.g.rotation.x = 0; a.g.rotation.z = (i ? 1 : -1) * 2.9; });
}
function updateParticles(t) {
  R.drops.forEach(m => (m.visible = false));
  if (between(t, C.rain, C.rwT.a)) R.drops.forEach((m, i) => {
    const per = 0.6, ph = (t - C.rain + rnd(i) * per) % per / per;
    m.visible = true; m.scale.set(0.06, 0.14, 0.06);
    m.position.set(-3.2 + rnd(i + 1) * 6.4, lerp(9.4, FLOOR, ph), -3.2 + rnd(i + 3) * 4.6);
  });
  if (between(t, C.gutter + 0.4, E('t2') + 0.5)) R.drops.forEach((m, i) => {
    if (i > 20) return;
    const ph = ((t - C.gutter) * 1.5 + i / 20) % 1;
    m.visible = true; m.scale.set(0.09, 0.09, 0.09);
    m.position.set(5.6 + ph * 2.2, 5.9 - ph * ph * 5.8, 2.3);
  });
  R.leaves.forEach(m => (m.visible = false));
  const lv = between(t, C.wind, C.rwV.a) ? [C.wind, 1] : between(t, C.sway, E('v3')) ? [C.sway, 0.5] : null;
  if (lv) R.leaves.forEach((m, i) => {
    if (rnd(i + 5) > lv[1]) return;
    const ph = ((t - lv[0]) * 0.35 + rnd(i)) % 1;
    m.visible = true; m.scale.setScalar(0.18);
    m.position.set(-8 + ph * 22, 18 - ph * 10 + Math.sin(t * 3 + i) * 0.6, -4 + rnd(i + 2) * 8); m.rotation.set(t * 3 + i, t * 2, 0);
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
  const [a, b] = ['COMO CONSTRUIR UMA ', 'CASA NA ÁRVORE'];
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
  ctx.fillText('PEÇAS DA CASA', 418, 1676);
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

// ================================================================ camada 2D própria da casa na árvore
function drawEra() {}
function failOverlays(t, wt) {
  if (between(wt, C.rain, C.rwT.a)) {
    const k = P(wt, C.rain, 0.4);
    ctx.save(); ctx.globalAlpha = 0.18 * k; ctx.fillStyle = '#1c2c55'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 0.55 * k;
    ctx.strokeStyle = '#cfe6ff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (let i = 0; i < 70; i++) { const x = rnd(i) * (W + 200) - 100, y = ((rnd(i + 3) * H + t * 1900) % (H + 100)) - 50; line(x, y, x - 14, y + 46); }
    ctx.restore();
  }
  if (between(wt, C.wind, C.rwV.a)) {
    ctx.save(); ctx.globalAlpha = 0.5 * P(wt, C.wind, 0.5); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) { const y = 300 + i * 120, x = ((t * 900 + i * 230) % (W + 600)) - 300; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 120, y - 30, x + 240, y); ctx.stroke(); }
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
    word(C.snap, 0.8, V3(5, BRANCH_Y + 1, 0), 'CRACK!', 130, '#ff5a3c');
    word(C.snap + 0.85, 0.9, V3(6, 1, 0), 'TUM!', 130, '#ffd23f');
    word(C.rip + 0.8, 1.0, V3(2, 2, 2), 'CRASH!', 130, '#ff5a3c');
    word(C.drop + 0.7, 0.9, V3(2.5, 1, 6), 'POF!', 120, '#ffd23f');
    word(C.oops + 0.5, 1.0, V3(1, 1, 3), 'SPLAT!', 120, '#ff5a3c');
    word(C.zip + 0.3, 1.6, V3(-12, 7, 7), 'IUUUPI!', 110, '#2ecc71');
  }
  if (t < 1.9) {
    const k = EZ.back(P(t, 0.05, 0.35)) * (1 - P(t, 1.6, 0.3));
    const pulse = 1 + 0.06 * Math.sin(t * 16);
    ctx.save(); ctx.translate(540, 500); ctx.scale(k * pulse, k * pulse); ctx.rotate(-0.06);
    bigWord('VAI', 0, -95, 150, '#ffffff');
    bigWord('AGUENTAR?', 0, 70, 140, '#ffd23f');
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
  sun.position.set(16, 36, 26); sun.target.position.set(0, 6, 0);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 26, bottom: -20, near: 1, far: 120 }); sun.shadow.camera.updateProjectionMatrix();
  buildWorld(); buildHouse(); buildParticles();
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

