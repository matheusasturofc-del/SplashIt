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


// ================================================================ medidas do mundo (1 unidade = 1 casa do tabuleiro)
const FLOOR = -9;
const TABLE_R = 6.6;
const sqX = f => -3.5 + f, sqZ = r => 3.5 - r;      // colunas a..h = 0..7, fileiras 1..8 = 0..7 (brancas perto da câmera)
const SQ = (f, r, y = 0) => new THREE.Vector3(sqX(f), y, sqZ(r));
const BACK = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
const ERAS = [
  { id: 'india', label: 'ÍNDIA · SÉCULO 6' },
  { id: 'persia', label: 'PÉRSIA · SÉCULO 7' },
  { id: 'europa', label: 'EUROPA · IDADE MÉDIA' },
  { id: 'espanha', label: 'ESPANHA · POR VOLTA DE 1475' },
  { id: 'europa2', label: 'EUROPA' },
  { id: 'londres', label: 'LONDRES · 1883' },
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
  // gancho: guerra de verdade
  C.army0 = 0.3; C.clash = Math.max(1.5, wT('h2', 'guerra') - 0.4);
  C.rwH = RW(E('h2') + 0.15, 0.2);
  // tabuleiro
  C.board0 = wT('b1', 'mesa') - 0.2;
  C.blob0 = E('b2') - 0.6;
  // peças diferentes
  C.q1 = S('q1');
  C.rwQ = RW(E('q1') + 0.15, S('q1') - 0.05);
  C.pc = { pawn: wT('q2', 'soldados') - 0.15, knight: wT('q2', 'cavalos') - 0.15, bishop: wT('q2', 'elefantes') - 0.15, rook: wT('q2', 'carros') - 0.15 };
  C.pc.queen = C.pc.king = wT('q2', 'cada') - 0.1;
  C.jump = wT('q3', 'cavalo') - 0.2;
  // rei
  C.cap0 = S('k1') + 0.3;
  C.rwK = RW(E('k1') + 0.15, S('k1') - 0.05);
  C.net = wT('k2', 'cercado') - 0.2;
  C.tip = wT('k3', 'derrotado') - 0.1; C.untip = E('k3') + 0.4;
  // casas
  C.rwC = RW(E('c1') + 0.15, S('c1') - 0.05);
  C.paint = wT('c2', 'cores') - 0.3;
  // dama
  C.slow = S('d1') + 0.2;
  C.rwD = RW(E('d1') + 0.15, S('d1') - 0.05);
  C.morph = wT('d2', 'dama') - 0.25;
  C.qLines = wT('d2', 'quantas') - 0.1;
  C.bLines = wT('d3', 'bispo') - 0.1;
  // roque
  C.center = S('r1') + 0.1;
  C.rwR = RW(E('r1') + 0.15, S('r1') - 0.05);
  C.clear = S('r2') + 0.05;
  C.castle = wT('r2', 'rei') - 0.1;
  C.rookHop = wT('r2', 'torre') - 0.1;
  // relógio
  C.think = S('t1') + 0.2;
  C.rwT = RW(E('t1') + 0.15, S('t1') - 0.05);
  C.clock0 = wT('t2', 'relógio') - 0.3;
  C.press = [wT('t3', 'aperta'), wT('t3', 'lance')];
  // final
  C.phones = wT('e1', 'celular') - 0.6; C.trophy = wT('e1', 'campeonatos') - 0.1;
  C.hostWorld = S('e2') - 0.3;
  C.stamp = S('e2') + 0.25;
  C.cta = S('e3') - 0.1;
  // épocas
  C.eraKeys = [[0, 0], [S('k1') - 0.3, 1], [S('c1') - 0.3, 2], [S('d1') - 0.3, 3], [S('r1') - 0.3, 4], [S('t1') - 0.3, 5], [S('e1') - 0.3, 6]];

  // ---------- câmera: [alvoX, alvoY, alvoZ, distância, azimute, elevação, fov]
  const HI = [0, 0, 0.6, 15.5, 0.32, 0.72, 40];
  const TOP = [0, 0, 0, 14.5, 0.12, 1.12, 40];
  const CK = [];
  CK.push([0, [0, FLOOR + 0.8, 9.5, 24, 0.55, 0.42, 40]], [C.clash, [0, FLOOR + 0.8, 9.5, 18, 0.25, 0.38, 40]], [C.rwH.b, [0, FLOOR + 0.8, 9.5, 18, 0.1, 0.4, 40]]);
  CK.push([C.board0 + 0.9, TOP], [E('b2'), [0, 0, 0.3, 15, -0.1, 0.95, 40]]);
  CK.push([S('q1') + 0.4, HI], [C.rwQ.b, HI]);
  CK.push([C.pc.pawn + 0.3, [0, 0.4, 2.6, 9.5, 0.55, 0.35, 42]], [C.pc.king + 0.6, [0, 0.4, 0.5, 11, -0.45, 0.42, 42]]);
  CK.push([C.jump - 0.2, [-2.0, 0.5, 2.6, 6.5, 0.6, 0.45, 42]], [E('q3'), [-2.0, 0.5, 2.6, 6.2, 0.2, 0.4, 42]]);
  CK.push([S('k1') + 0.3, HI], [C.rwK.b, [0, 0, 0.6, 15, 0.2, 0.7, 40]]);
  CK.push([C.net + 0.2, [0.5, 0.7, -3.3, 6.5, 0.35, 0.38, 42]], [E('k3'), [0.5, 0.7, -3.3, 6.2, -0.2, 0.35, 42]]);
  CK.push([S('c1') + 0.3, TOP], [E('c3'), [0, 0, 0, 14.5, -0.12, 1.1, 40]]);
  CK.push([C.slow + 0.1, [-0.5, 0.7, 3.2, 6.5, 0.45, 0.5, 42]], [C.rwD.b, [-0.5, 0.7, 3.2, 6.5, 0.2, 0.5, 42]]);
  CK.push([C.morph + 0.2, HI], [C.qLines + 0.2, TOP], [E('d3'), [0, 0, 0, 14.5, -0.15, 1.05, 40]]);
  CK.push([S('r1') + 0.3, HI], [C.rwR.b, HI]);
  CK.push([C.castle - 0.3, [2.0, 0.5, 3.3, 7.5, 0.55, 0.45, 42]], [E('r3'), [2.0, 0.5, 3.3, 7.2, 0.15, 0.42, 42]]);
  CK.push([S('t1') + 0.3, [2.0, 0.4, 0.8, 13, 0.6, 0.45, 40]], [C.rwT.b, [2.0, 0.4, 0.8, 13, 0.45, 0.45, 40]]);
  CK.push([C.clock0 + 0.3, [5.6, 0.6, 0.2, 6, 0.75, 0.28, 42]], [E('t3'), [5.6, 0.6, 0.2, 5.8, 0.35, 0.25, 42]]);
  CK.push([S('e1') + 0.4, [0, 0.5, 1.5, 21, 0.3, 0.5, 40]], [C.hostWorld, [0, 0.5, 1.5, 21, 0.05, 0.48, 40]]);
  CK.push([C.hostWorld + 0.9, [0, -2.0, 6.0, 25, 0.05, 0.22, 42]], [TL.duration, [0, -1.8, 6.0, 26, 0.22, 0.25, 42]]);
  C.camKeys = sortK(CK);

  C.shakes = [[C.clash, 0.25], [C.stamp + 0.18, 0.2], [C.tip + 0.3, 0.08]];

  // ---------- reações do mestre de obras
  const Rx = (t, d, e, p, b) => REACT.push({ t, d, e, p, b });
  Rx(C.clash - 0.3, C.rwH.a - C.clash + 0.3, 'shock', 'up', 'Socorro!');
  Rx(E('b2') - 1.0, 1.0, 'happy', 'thumbs', null);
  Rx(C.q1 + 0.6, C.rwQ.a - C.q1 - 0.6, 'think', 'down', 'Zzz...');
  Rx(E('q3') - 1.0, 1.0, 'happy', 'thumbs', null);
  Rx(C.cap0 + 0.6, C.rwK.a - C.cap0 - 0.6, 'worried', 'wipe', 'Não acaba!');
  Rx(C.tip, 1.3, 'happy', 'cheer', 'Xeque-mate!');
  Rx(S('c1') + 0.4, C.rwC.a - S('c1') - 0.4, 'think', 'down', '?');
  Rx(E('c3') - 0.6, 0.9, 'happy', 'thumbs', null);
  Rx(C.slow + 0.4, C.rwD.a - C.slow - 0.4, 'think', 'down', 'Zzz...');
  Rx(C.morph + 0.3, 1.3, 'shock', 'cheeks', 'Uau!');
  Rx(C.center + 0.4, C.rwR.a - C.center - 0.4, 'shock', 'cheeks', 'Cuidado!');
  Rx(E('r3') - 0.8, 1.0, 'happy', 'thumbs', null);
  Rx(C.think + 0.4, C.rwT.a - C.think - 0.4, 'worried', 'down', 'Joga logo!');
  Rx(E('t3') - 1.0, 1.0, 'happy', 'thumbs', null);
  Rx(C.stamp + 0.15, 2.4, 'happy', 'cheer', 'Uhuul!');
  Rx(C.cta, TL.duration - C.cta, 'happy', 'point', null);
  for (const r of C.REW) Rx(r.a, r.b - r.a, 'worried', 'point', 'Volta!');
  REACT.sort((a, b) => a.t - b.t);

  // ---------- etiquetas
  const Lb = (txt, t0, t1, at, off) => { LABELS.push({ txt, t0, t1, at, off }); CHIPS.push({ txt, t: t0 }); };
  Lb('TABULEIRO', wT('b2', 'tabuleiro'), E('b2') + 0.3, () => SQ(0, 0, 0.05).add(new THREE.Vector3(-0.4, 0, 0.4)), [80, 220]);
  Lb('CHATURANGA', wT('q3', 'chaturanga'), E('q3') + 0.3, () => SQ(2, 2, 1.0), [120, -260]);
  Lb('XEQUE-MATE', wT('k3', 'xeque'), E('k3') + 0.3, () => SQ(4, 7, 1.2), [0, -300]);
  Lb('QUADRICULADO', wT('c3', 'quadriculado'), E('c3') + 0.3, () => SQ(0, 7, 0.05), [160, -200]);
  Lb('DAMA', wT('d3', 'dama'), wT('d3', 'bispo') - 0.1, () => SQ(3, 0, 1.4), [-60, -300]);
  Lb('ROQUE', wT('r3', 'roque'), E('r3') + 0.3, () => SQ(6, 0, 1.4), [-60, -280]);
  Lb('RELÓGIO', wT('t3', 'relógio'), E('t3') + 0.3, () => new THREE.Vector3(5.6, 0.9, 0.2), [-150, -260]);

  // ---------- setas
  const Ar = (t0, t1, at, dir, len, col, kind = 'line') => ARROWS.push({ t0, t1, at, dir: new THREE.Vector3(...dir), len, col, kind });
  const GREEN = '#2ecc71', RED = '#ff4d3d', YEL = '#ffd23f';
  Ar(C.jump, C.jump + 1.3, () => SQ(1, 0, 0.6), [0, 0, -1], 1.2, YEL);
  Ar(C.jump + 0.4, C.jump + 1.3, () => SQ(1, 1.4, 0.6), [1, 0, 0], 0.6, YEL);
  Ar(C.castle, C.castle + 1.1, () => SQ(4, 0, 1.6), [1, 0, 0], 1.4, GREEN);
  Ar(C.rookHop, C.rookHop + 1.0, () => SQ(7, 0, 1.4), [-1, 0, 0], 1.4, YEL);
  Ar(C.center + 0.3, C.rwR.a, () => SQ(4, 7, 1.2), [0, 0, 1], 1.4, RED);
  Ar(C.center + 0.3, C.rwR.a, () => SQ(0, 7, 1.0), [1, 0, 1], 1.4, RED);

  // ---------- efeitos sonoros
  sfx(C.army0, 'whoosh', 0.5); sfx(C.army0 + 0.3, 'hum', 0.3, C.clash - C.army0);
  sfx(C.clash, 'crash', 1.0); sfx(C.clash + 0.3, 'clank', 0.7); sfx(C.clash + 0.5, 'clank', 0.6);
  asmSfx(C.board0, 1.2, 8, 'pop', 0.35);
  sfx(C.blob0, 'whoosh', 0.5);
  sfx(C.q1 + 0.3, 'hum', 0.2, 1.5);
  for (const k of ['pawn', 'knight', 'bishop', 'rook', 'king']) sfx(C.pc[k] + 0.25, 'clank', 0.6);
  sfx(C.jump, 'whoosh', 0.6); sfx(C.jump + 0.8, 'clank', 0.7);
  for (let i = 0; i < 8; i++) sfx(C.cap0 + 0.3 + i * 0.45, 'pop', 0.35);
  sfx(C.net, 'alarm', 0.4); sfx(C.tip, 'thud', 0.8); sfx(C.tip + 0.15, 'tada', 0.6);
  sfx(C.paint, 'whoosh', 0.5); asmSfx(C.paint, 1.2, 6, 'beep', 0.3);
  sfx(C.slow + 0.3, 'creak', 0.4);
  sfx(C.morph, 'powerup', 0.6); asmSfx(C.morph, 1.2, 8, 'pop', 0.45); sfx(C.morph + 1.2, 'ding', 0.6);
  sfx(C.qLines, 'zip', 0.6); sfx(C.bLines, 'zip', 0.6);
  sfx(C.center, 'slide', 0.5, 0.6); sfx(C.center + 0.5, 'alarm', 0.5);
  sfx(C.clear, 'whoosh', 0.6); sfx(C.castle + 0.6, 'clank', 0.7); sfx(C.rookHop + 0.7, 'clank', 0.7);
  sfx(C.think + 0.3, 'creak', 0.4);
  sfx(C.clock0, 'whoosh', 0.5); sfx(C.clock0 + 0.5, 'clank', 0.7);
  for (const p of C.press) sfx(p, 'click', 0.9);
  sfx(C.trophy, 'ding', 0.6); asmSfx(C.phones, 1.0, 6, 'pop', 0.4);
  sfx(C.stamp + 0.18, 'stamp', 1.0); sfx(C.stamp + 0.22, 'tada', 0.8);
  sfx(C.cta, 'pop', 0.6);
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
const eraAt = t => kf(t, C.eraKeys.map(([a, v], i) => [a, v, 'lin']).flatMap(([a, v], i, arr) => i ? [[a - 0.001, arr[i - 1][1], 'lin'], [a + 0.6, v, 'io']] : [[a, v]]));
const eraIndex = t => { let k = 0; for (const [a, v] of C.eraKeys) if (t >= a) k = v; return k; };

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
const camera = new THREE.PerspectiveCamera(38, W / H, 0.3, 160);

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
const _v = new THREE.Vector3();
function canvasTex(w, h, fn) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
}
// pintura de fundo de cada época
function eraPainting(id) {
  return canvasTex(1024, 512, (g, w, h) => {
    const sky = (a, b) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, w, h); };
    const ground = c => { g.fillStyle = c; g.fillRect(0, h * 0.78, w, h * 0.22); };
    if (id === 'india') {
      sky('#ff9a4a', '#ffd28a'); g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(w * 0.78, h * 0.3, 50, 0, 7); g.fill();
      g.fillStyle = '#b5532c';
      for (const [x, s] of [[220, 1.3], [520, 1.7], [820, 1.1]]) { g.fillRect(x - 70 * s, h * 0.78 - 140 * s, 140 * s, 140 * s); g.beginPath(); g.arc(x, h * 0.78 - 140 * s, 70 * s, Math.PI, 0); g.fill(); g.fillRect(x - 5, h * 0.78 - 140 * s - 110 * s, 10, 50 * s); }
      g.fillStyle = '#2f6b3a'; for (const x of [80, 380, 680, 960]) { g.fillRect(x - 6, h * 0.5, 12, h * 0.28); for (let k = 0; k < 6; k++) { g.beginPath(); g.ellipse(x + Math.cos(k) * 36, h * 0.5 + Math.sin(k) * 10, 46, 12, k, 0, 7); g.fill(); } }
      ground('#c98a4a');
    } else if (id === 'persia') {
      sky('#1f6f8b', '#9fe0d8'); g.fillStyle = '#e8d3a8';
      for (let i = 0; i < 6; i++) { const x = 90 + i * 170; g.fillRect(x - 60, h * 0.32, 120, h * 0.46); g.fillStyle = '#1f6f8b'; g.beginPath(); g.moveTo(x - 38, h * 0.78); g.lineTo(x - 38, h * 0.5); g.quadraticCurveTo(x, h * 0.3, x + 38, h * 0.5); g.lineTo(x + 38, h * 0.78); g.fill(); g.fillStyle = '#e8d3a8'; }
      ground('#d8b77a');
    } else if (id === 'europa' || id === 'europa2') {
      sky('#4a5d7a', '#aebfd4'); g.fillStyle = '#6b6f78';
      g.fillRect(260, h * 0.42, 500, h * 0.36);
      for (const x of [230, 470, 730]) { g.fillRect(x, h * 0.22, 70, h * 0.56); for (let k = 0; k < 3; k++) g.fillRect(x + k * 26, h * 0.18, 16, 22); }
      for (let x = 260; x < 760; x += 40) g.fillRect(x, h * 0.38, 22, 20);
      g.fillStyle = '#3b3f48'; g.fillRect(480, h * 0.6, 60, h * 0.18);
      ground('#5e7a4a');
    } else if (id === 'espanha') {
      sky('#b8322e', '#ffcf6a'); g.fillStyle = '#7a2a1e';
      for (let i = 0; i < 5; i++) { const x = 110 + i * 200; g.fillRect(x - 80, h * 0.4, 160, h * 0.38); g.fillStyle = '#ffcf6a'; g.beginPath(); g.moveTo(x - 50, h * 0.78); g.lineTo(x - 50, h * 0.55); g.arc(x, h * 0.55, 50, Math.PI, 0); g.lineTo(x + 50, h * 0.78); g.fill(); g.fillStyle = '#7a2a1e'; }
      ground('#c89b5a');
    } else if (id === 'londres') {
      sky('#2c3e3a', '#8aa39a'); g.fillStyle = '#26302d';
      g.fillRect(700, h * 0.12, 80, h * 0.66); g.beginPath(); g.moveTo(690, h * 0.12); g.lineTo(740, h * 0.02); g.lineTo(790, h * 0.12); g.fill();
      g.fillStyle = '#e8e0c0'; g.beginPath(); g.arc(740, h * 0.22, 26, 0, 7); g.fill();
      g.fillStyle = '#26302d'; for (let x = 0; x < 680; x += 90) g.fillRect(x, h * (0.45 + (x % 3) * 0.04), 80, h * 0.4);
      ground('#3a3f3a');
    } else {
      sky('#16204a', '#4d7cfe'); g.fillStyle = '#0f1530';
      for (let x = 0; x < w; x += 70) { const hh = 120 + ((x * 37) % 160); g.fillRect(x, h * 0.78 - hh, 60, hh); }
      g.fillStyle = '#ffd36b'; for (let i = 0; i < 80; i++) g.fillRect((i * 97) % w, h * 0.4 + ((i * 53) % 130), 6, 8);
      ground('#2b2f39');
    }
  });
}
function buildRoom() {
  R.floor = boxC(-60, FLOOR - 0.5, -20, 60, FLOOR, 40, M('#b08a62', { roughness: 0.8 }));
  R.paints = ERAS.map(e => eraPainting(e.id));
  const bd = (z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(90, 45), new THREE.MeshBasicMaterial({ map: R.paints[0], transparent: true, toneMapped: false })); m.position.set(0, FLOOR + 19, z); scene.add(m); return m; };
  R.bgA = bd(-19.9); R.bgB = bd(-19.8); R.bgB.material.opacity = 0;
  // mesa redonda
  const top = mesh(new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.45, 64), M('#8b5a33', { roughness: 0.5 }));
  top.position.y = -0.25 - 0.225; scene.add(top);
  const leg = mesh(new THREE.CylinderGeometry(0.9, 1.4, -FLOOR - 0.7, 24), M('#6e4426')); leg.position.y = (FLOOR + -0.7) / 2; scene.add(leg);
  const foot = mesh(new THREE.CylinderGeometry(3.2, 3.6, 0.3, 32), M('#6e4426')); foot.position.y = FLOOR + 0.15; scene.add(foot);
}
function buildBoard() {
  R.squares = [];
  const g = grp(null); R.board = g;
  for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) {
    const m = boxC(sqX(f) - 0.5, -0.2, sqZ(r) - 0.5, sqX(f) + 0.5, 0, sqZ(r) + 0.5, new THREE.MeshStandardMaterial({ color: '#d8b98a', roughness: 0.55, emissive: '#000000' }), g);
    m.userData = { f, r };
    R.squares.push(m);
    asm(m, () => C.board0 + (f + r) * 0.06, 0.45, { dy: 3, ry: 1.2, s: 0.3 });
  }
  const fm = M('#5a3820', { roughness: 0.45 });
  const parts = [boxC(-4.45, -0.25, -4.45, 4.45, -0.02, -4.0, fm, g), boxC(-4.45, -0.25, 4.0, 4.45, -0.02, 4.45, fm, g),
    boxC(-4.45, -0.25, -4.0, -4.0, -0.02, 4.0, fm, g), boxC(4.0, -0.25, -4.0, 4.45, -0.02, 4.0, fm, g),
    boxC(-4.0, -0.25, -4.0, 4.0, -0.2, 4.0, fm, g)];
  parts.forEach((m, i) => asm(m, () => C.board0 - 0.2 + i * 0.05, 0.5, { dy: 2, s: 0.5 }));
}
// ---------- peças
const BASE = [[0, 0], [0.38, 0], [0.38, 0.07], [0.3, 0.11]];
const PPROF = {
  pawn: [[0.2, 0.2], [0.13, 0.45], [0.2, 0.5], [0.1, 0.54], [0, 0.55]],
  rook: [[0.27, 0.2], [0.24, 0.75], [0.32, 0.8], [0.32, 1.0], [0, 1.0]],
  bishop: [[0.22, 0.2], [0.14, 0.7], [0.22, 0.76], [0.12, 0.8], [0.2, 0.95], [0.17, 1.1], [0.06, 1.2], [0, 1.22]],
  queen: [[0.25, 0.2], [0.15, 0.9], [0.26, 0.98], [0.14, 1.02], [0.24, 1.2], [0.2, 1.3], [0, 1.31]],
  king: [[0.26, 0.2], [0.16, 1.0], [0.27, 1.08], [0.15, 1.12], [0.24, 1.3], [0.2, 1.38], [0, 1.39]],
  knight: [[0.24, 0.2], [0.22, 0.32], [0, 0.33]],
};
const GEOC = {};
const lathe = type => (GEOC[type] ??= new THREE.LatheGeometry([...BASE, ...PPROF[type]].map(([x, y]) => new THREE.Vector2(x, y)), 28));
function modernPiece(type, mat) {
  const g = new THREE.Group();
  g.add(mesh(lathe(type), mat));
  if (type === 'pawn') sph(0.15, mat, 0, 0.67, 0, g);
  if (type === 'bishop') sph(0.05, mat, 0, 1.26, 0, g);
  if (type === 'queen') { for (let k = 0; k < 8; k++) sph(0.045, mat, Math.cos(k * Math.PI / 4) * 0.2, 1.33, Math.sin(k * Math.PI / 4) * 0.2, g); sph(0.07, mat, 0, 1.4, 0, g); }
  if (type === 'king') { boxC(-0.04, 1.39, -0.04, 0.04, 1.7, 0.04, mat, g); boxC(-0.13, 1.5, -0.035, 0.13, 1.58, 0.035, mat, g); }
  if (type === 'rook') for (let k = 0; k < 4; k++) { const c = boxC(-0.07, 1.0, -0.07, 0.07, 1.12, 0.07, mat, g); c.position.x = Math.cos(k * Math.PI / 2) * 0.22; c.position.z = Math.sin(k * Math.PI / 2) * 0.22; }
  if (type === 'knight') {
    const neck = mesh(GEO.box, mat); neck.scale.set(0.26, 0.6, 0.34); neck.position.set(0, 0.6, 0.02); neck.rotation.x = -0.25; g.add(neck);
    const head = mesh(GEO.box, mat); head.scale.set(0.24, 0.24, 0.5); head.position.set(0, 0.86, 0.17); head.rotation.x = 0.35; g.add(head);
    for (const s of [-1, 1]) { const ear = mesh(new THREE.ConeGeometry(0.05, 0.14, 8), mat); ear.position.set(s * 0.07, 1.02, -0.02); g.add(ear); }
  }
  return g;
}
function chatPiece(type, mat, accent) {
  const g = new THREE.Group();
  g.add(mesh(lathe('knight'), mat));
  const skin = M('#d9a77a');
  if (type === 'pawn') {
    const b = mesh(new THREE.CapsuleGeometry(0.11, 0.22, 4, 10), accent); b.position.y = 0.5; g.add(b);
    sph(0.1, skin, 0, 0.78, 0, g);
    const sp = mesh(GEO.cyl, M('#7a5a3a')); sp.scale.set(0.02, 0.75, 0.02); sp.position.set(0.16, 0.65, 0); g.add(sp);
    const tip = mesh(new THREE.ConeGeometry(0.04, 0.1, 8), M('#c4ccd8', { metalness: 0.6 })); tip.position.set(0.16, 1.07, 0); g.add(tip);
  } else if (type === 'knight') {
    const neck = mesh(GEO.box, mat); neck.scale.set(0.24, 0.55, 0.3); neck.position.set(0, 0.6, 0.02); neck.rotation.x = -0.3; g.add(neck);
    const head = mesh(GEO.box, accent); head.scale.set(0.22, 0.22, 0.46); head.position.set(0, 0.84, 0.16); head.rotation.x = 0.3; g.add(head);
    const mane = mesh(GEO.box, M('#3a2a1a')); mane.scale.set(0.08, 0.5, 0.1); mane.position.set(0, 0.68, -0.15); mane.rotation.x = -0.3; g.add(mane);
  } else if (type === 'bishop') {
    const body = sph(1, mat, 0, 0.62, 0, g); body.scale.set(0.3, 0.26, 0.36);
    for (const [x, z] of [[-0.15, -0.18], [0.15, -0.18], [-0.15, 0.18], [0.15, 0.18]]) { const l = mesh(GEO.cyl, mat); l.scale.set(0.07, 0.3, 0.07); l.position.set(x, 0.38, z); g.add(l); }
    const hd = sph(0.17, mat, 0, 0.8, 0.3, g);
    const tr = mesh(new THREE.TorusGeometry(0.14, 0.045, 8, 16, Math.PI * 1.1), mat); tr.position.set(0, 0.62, 0.42); tr.rotation.y = Math.PI / 2; g.add(tr);
    for (const s of [-1, 1]) { const ear = sph(1, accent, s * 0.17, 0.82, 0.24, g); ear.scale.set(0.03, 0.14, 0.12); }
    const sad = boxC(-0.16, 0.86, -0.12, 0.16, 0.9, 0.12, accent, g); sad.position.y = 0.87;
  } else if (type === 'rook') {
    boxC(-0.24, 0.42, -0.3, 0.24, 0.72, 0.3, mat, g);
    for (const s of [-1, 1]) { const w = mesh(new THREE.TorusGeometry(0.17, 0.04, 8, 20), accent); w.position.set(s * 0.27, 0.42, 0); w.rotation.y = Math.PI / 2; g.add(w); }
    boxC(-0.2, 0.72, -0.26, 0.2, 0.76, 0.26, accent, g);
    const flag = mesh(GEO.cyl, M('#7a5a3a')); flag.scale.set(0.015, 0.45, 0.015); flag.position.set(0, 0.98, -0.2); g.add(flag);
    boxC(0.0, 1.1, -0.205, 0.18, 1.2, -0.195, accent, g);
  } else {
    const isK = type === 'king';
    const robe = mesh(new THREE.CylinderGeometry(0.12, 0.26, 0.7, 20), accent); robe.position.y = 0.66; g.add(robe);
    sph(0.14, skin, 0, 1.12, 0, g);
    if (isK) { const cr = mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.12, 12, 1, true), M('#ffcf3a', { metalness: 0.7, roughness: 0.3 })); cr.position.y = 1.27; g.add(cr); for (let k = 0; k < 5; k++) { const sp = mesh(new THREE.ConeGeometry(0.03, 0.1, 6), M('#ffcf3a', { metalness: 0.7 })); sp.position.set(Math.cos(k * 1.256) * 0.14, 1.37, Math.sin(k * 1.256) * 0.14); g.add(sp); } }
    else { const tb = sph(1, M('#f2f2f2'), 0, 1.24, 0, g); tb.scale.set(0.17, 0.12, 0.17); }
  }
  return g;
}
function buildPieces() {
  const matW = M('#f1e7d0', { roughness: 0.4 }), matB = M('#3b2a22', { roughness: 0.4 });
  const accW = M('#e9a23b'), accB = M('#a8322b');
  R.pieces = [];
  for (const side of [0, 1]) {
    for (let f = 0; f < 8; f++) for (const kind of ['back', 'pawn']) {
      const type = kind === 'pawn' ? 'pawn' : BACK[f];
      const r = side === 0 ? (kind === 'pawn' ? 1 : 0) : (kind === 'pawn' ? 6 : 7);
      const mat = side ? matB : matW, acc = side ? accB : accW;
      const root = grp(null);
      const blob = mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.6, 20), mat); blob.position.y = 0.3; root.add(blob);
      const chat = chatPiece(type, mat, acc); root.add(chat);
      const mod = modernPiece(type, mat); root.add(mod);
      if (side === 1) { chat.rotation.y = Math.PI; mod.rotation.y = Math.PI; }
      R.pieces.push({ type, side, f, r, root, blob, chat, mod, id: R.pieces.length });
    }
  }
  R.byKey = k => R.pieces.find(p => `${p.side}${p.type}${p.f}` === k);
}
// ---------- guerra do gancho
function soldier(col) {
  const g = new THREE.Group();
  const b = mesh(new THREE.CapsuleGeometry(0.22, 0.45, 4, 10), M(col)); b.position.y = 0.6; g.add(b);
  sph(0.2, M('#d9a77a'), 0, 1.15, 0, g);
  const h = sph(1, M('#c4ccd8', { metalness: 0.5 }), 0, 1.22, 0, g); h.scale.set(0.21, 0.13, 0.21);
  const sp = mesh(GEO.cyl, M('#7a5a3a')); sp.scale.set(0.03, 1.4, 0.03); sp.position.set(0.3, 0.9, 0); sp.rotation.z = -0.3; g.add(sp);
  return g;
}
function buildArmies() {
  R.army = [];
  for (const side of [0, 1]) for (let i = 0; i < 28; i++) {
    const s = soldier(side ? '#2a5db0' : '#c0392b');
    const row = i % 7, col = Math.floor(i / 7);
    s.userData = { side, x0: (side ? 1 : -1) * (8 + col * 1.3 + rnd(i + side * 50) * 0.5), z: 6.5 + row * 1.25 + rnd(i + 9) * 0.4, ph: rnd(i + side * 30) * 6 };
    s.rotation.y = side ? -Math.PI / 2 : Math.PI / 2;
    scene.add(s); R.army.push(s);
  }
}
// ---------- relógio, celulares, troféu
function buildProps() {
  const ck = grp(null, 5.6, -0.25, 0.2); R.clock = ck;
  boxC(-0.9, 0, -0.35, 0.9, 0.8, 0.35, M('#5a3820', { roughness: 0.4 }), ck);
  R.clockFaces = [];
  for (const s of [-1, 1]) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), new THREE.MeshBasicMaterial({ map: tx, toneMapped: false }));
    face.position.set(s * 0.42, 0.42, 0.36); ck.add(face);
    R.clockFaces.push({ c, tx });
  }
  R.btns = [-1, 1].map(s => boxC(s * 0.42 - 0.12, 0.8, -0.1, s * 0.42 + 0.12, 0.9, 0.1, M('#c4ccd8', { metalness: 0.6 }), ck));
  asm(ck, () => C.clock0, 0.6, { dy: 3, ry: 2, s: 0.3 });
  const tr = grp(null, -2.2, -0.25, -5.3); R.trophy = tr;
  const gold = M('#ffcf3a', { metalness: 0.8, roughness: 0.25 });
  boxC(-0.35, 0, -0.35, 0.35, 0.25, 0.35, M('#3b2a22'), tr);
  const cup = mesh(new THREE.CylinderGeometry(0.45, 0.15, 0.7, 24, 1, true), gold); cup.position.y = 0.95; tr.add(cup);
  const stem = mesh(GEO.cyl, gold); stem.scale.set(0.07, 0.35, 0.07); stem.position.y = 0.42; tr.add(stem);
  for (const s of [-1, 1]) { const h = mesh(new THREE.TorusGeometry(0.18, 0.04, 8, 16), gold); h.position.set(s * 0.48, 1.0, 0); tr.add(h); }
  asm(tr, () => C.trophy, 0.6, { dy: 3, ry: 3, s: 0.2 });
  R.phones = [];
  const scr = canvasTex(128, 256, (g, w, h) => { g.fillStyle = '#111'; g.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#7a4a2a' : '#efd9b0'; g.fillRect(8 + i * 14, 70 + j * 14, 14, 14); } });
  [[-3.4, 2.4, 0.4], [3.4, 3.2, -0.5], [-2.3, 5.4, 0.25], [2.5, 6.0, -0.3], [-3.7, 4.2, -0.2], [3.7, 5.0, 0.45]].forEach(([x, y, rz], i) => {
    const p = grp(null, x, y, 4.6 + (i % 2) * 0.6);
    boxC(-0.6, -1.1, -0.06, 0.6, 1.1, 0.06, M('#15171c', { roughness: 0.3 }), p);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.95), new THREE.MeshBasicMaterial({ map: scr, toneMapped: false })); s.position.z = 0.07; p.add(s);
    p.rotation.set(-0.2, 0, rz);
    asm(p, () => C.phones + i * 0.15, 0.5, { dy: -4, ry: 3, s: 0.2 });
    R.phones.push(p);
  });
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
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const FLOORCOL = ['#c98a4a', '#d8b77a', '#7d7f74', '#a65a3a', '#7d7f74', '#4a4f4a', '#3a3f55'].map(c => new THREE.Color(c));
const SQ_PLAIN = new THREE.Color('#d8b98a'), SQ_DARK = new THREE.Color('#7a4a2a'), SQ_LIGHT = new THREE.Color('#efd9b0');
const HL = { red: new THREE.Color('#ff3b30'), green: new THREE.Color('#2ecc71'), gold: new THREE.Color('#ffcf3a') };
let _capOrder = null;
function capTime(p) {
  if (!_capOrder) {
    const list = R.pieces.filter(q => q.type !== 'king').sort((a, b) => rnd(a.id * 3.1) - rnd(b.id * 3.1));
    _capOrder = new Map(list.map((q, i) => [q.id, i]));
  }
  if (!_capOrder.has(p.id)) return Infinity;
  const dt = (C.rwK.a - C.cap0) / 22;
  return C.cap0 + _capOrder.get(p.id) * dt;
}
function pieceState(p, t) {
  let f = p.f, r = p.r, y = 0, tilt = 0, sc = 1, vis = true;
  const key = `${p.side}${p.type}${p.f}`;
  // o cavalo pula em L (b1 → c3)
  if (key === '0knight1') {
    const k = EZ.io(P(t, C.jump, 0.9));
    f = lerp(1, 2, k); r = lerp(0, 2, k); y += Math.sin(Math.PI * k) * 1.4;
  }
  // rei no meio do tabuleiro (falha) e roque
  if (key === '0king4') {
    if (between(t, C.center, C.rwR.a)) { const k = EZ.io(P(t, C.center, 0.6)); r = lerp(0, 3, k); y += Math.sin(Math.PI * k) * 1.2; }
    const kc = EZ.io(P(t, C.castle, 0.7)); f = lerp(4, 6, kc);
  }
  if (key === '0rook7') { const k = EZ.io(P(t, C.rookHop, 0.7)); f = lerp(7, 5, k); y += Math.sin(Math.PI * k) * 1.3; }
  // bispo e cavalo do lado do rei saem para o roque
  if (key === '0bishop5' || key === '0knight6') { const k = P(t, C.clear, 0.5); if (k > 0) { y += 5 * EZ.i2(k); sc *= 1 - k; } }
  // o rei derrotado tomba
  if (key === '1king4') tilt = between(t, C.tip, C.untip) ? 1.35 * EZ.back(P(t, C.tip, 0.45)) * (1 - P(t, C.untip - 0.3, 0.3)) : 0;
  // capturas sem fim (falha)
  const tc = capTime(p);
  if (between(t, tc, C.rwK.a)) { const k = P(t, tc, 0.35); y += 3 * EZ.i2(k); sc *= 1 - k; }
  // peças iguais andando juntas (falha)
  if (between(t, C.q1, C.rwQ.a)) { const w = 0.5 - 0.5 * Math.cos((t - C.q1) * 3.2); r += (p.side ? -1 : 1) * w * (p.type === 'pawn' ? 1 : 0); y += Math.abs(Math.sin((t - C.q1) * 6.4)) * 0.25; }
  return { x: sqX(f), z: sqZ(r), y, tilt, sc, vis: vis && sc > 0.01 };
}
function updateWorld(t) {
  applyAsm(t);
  // época: pintura de fundo e cor do chão
  const ei = eraIndex(t), ea = C.eraKeys[ei][0], ep = ei ? EZ.io(P(t, ea, 0.7)) : 1;
  R.bgA.material.map = R.paints[Math.max(0, ei - 1)]; R.bgB.material.map = R.paints[ei];
  R.bgB.material.opacity = ep; R.bgA.material.opacity = 1;
  R.floor.material.color.copy(FLOORCOL[Math.max(0, ei - 1)]).lerp(FLOORCOL[ei], ep);
  // guerra do gancho
  const warOn = t <= C.rwH.a;
  R.army.forEach((s, i) => {
    s.visible = warOn;
    if (!warOn) return;
    const u = s.userData, sg = u.side ? 1 : -1;
    const k = EZ.i2(P(t, C.army0, C.clash - C.army0));
    const xEnd = sg * (0.6 + (i % 4) * 0.5);
    s.position.set(lerp(u.x0, xEnd, k) + (t > C.clash ? Math.sin(t * 9 + u.ph) * 0.25 : 0), FLOOR + Math.abs(Math.sin(t * 11 + u.ph)) * 0.18, u.z);
    s.rotation.z = t > C.clash + 0.4 && rnd(i + 3) > 0.6 ? sg * 1.3 * P(t, C.clash + 0.4 + rnd(i) * 0.6, 0.3) : 0;
  });
  // casas: madeira lisa → quadriculado; destaques
  const net = between(t, C.net, C.untip);
  R.squares.forEach(m => {
    const { f, r } = m.userData;
    const pk = P(t, C.paint + (f + r) * 0.06, 0.35);
    m.material.color.copy(SQ_PLAIN).lerp((f + r) % 2 ? SQ_LIGHT : SQ_DARK, pk);
    let hl = null, hk = 0;
    const dK = Math.max(Math.abs(f - 4), Math.abs(r - 7));
    if (net && dK <= 1 && !(f === 4 && r === 7)) { hl = HL.red; hk = 0.6 + 0.3 * Math.sin(t * 8); }
    if (between(t, C.slow, C.rwD.a) && r === 1 && (f === 2 || f === 4)) { hl = HL.green; hk = 0.5 + 0.3 * Math.sin(t * 6); }
    const ql = (df, dr) => (df === 0 || dr === 0 || Math.abs(df) === Math.abs(dr));
    if (between(t, C.qLines, C.qLines + 2.3) && ql(f - 3, r) && !(f === 3 && r === 0)) { const d = Math.max(Math.abs(f - 3), r); hl = HL.gold; hk = P(t, C.qLines + d * 0.12, 0.2) * (1 - P(t, C.qLines + 1.9, 0.4)); }
    if (between(t, C.bLines, C.bLines + 2.2) && Math.abs(f - 2) === r && r > 0) { hl = HL.gold; hk = P(t, C.bLines + r * 0.12, 0.2) * (1 - P(t, C.bLines + 1.8, 0.4)); }
    if (between(t, C.center + 0.4, C.rwR.a) && f === 4 && r === 3) { hl = HL.red; hk = 0.7 + 0.3 * Math.sin(t * 10); }
    if (hl) { m.material.emissive.copy(hl); m.material.emissiveIntensity = hk; } else m.material.emissiveIntensity = 0;
  });
  // peças: bolinhas iguais → chaturanga → peças modernas
  R.pieces.forEach(p => {
    const s = pieceState(p, t);
    p.root.visible = s.vis && t >= C.blob0;
    p.root.position.set(s.x, s.y, s.z);
    p.root.rotation.set(0, 0, 0);
    p.root.rotateX(p.side ? -s.tilt : s.tilt);
    const tc = C.pc[p.type] + p.f * 0.05;
    const tm = C.morph + (p.id % 16) * 0.07 + p.side * 0.04;
    const blobK = 1 - P(t, tc - 0.1, 0.15);
    p.blob.visible = blobK > 0.01; p.blob.scale.setScalar(Math.max(0.001, EZ.back(P(t, C.blob0 + p.f * 0.03, 0.4)) * blobK));
    const chatIn = EZ.back(P(t, tc, 0.4)), chatOut = 1 - P(t, tm, 0.15);
    p.chat.visible = chatIn > 0.01 && chatOut > 0.01; p.chat.scale.setScalar(Math.max(0.001, chatIn * chatOut));
    const modIn = EZ.back(P(t, tm + 0.12, 0.35));
    p.mod.visible = modIn > 0.01; p.mod.scale.setScalar(Math.max(0.001, modIn));
    p.chat.rotation.y = (p.side ? Math.PI : 0) + (1 - chatIn) * 3;
    p.mod.rotation.y = (p.side ? Math.PI : 0) + (1 - modIn) * 4;
    p.root.scale.setScalar(Math.max(0.001, s.sc));
  });
  // relógio
  updateClock(t);
  updateParticles(t);
}
function drawClockFace(cv, secs, running, flag) {
  const g = cv.getContext('2d'), w = cv.width, h = cv.height;
  g.fillStyle = '#f6f1e4'; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 2, 0, 7); g.fill();
  g.strokeStyle = '#222'; g.lineWidth = 3; g.stroke();
  for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * 50, h / 2 + Math.sin(a) * 50); g.lineTo(w / 2 + Math.cos(a) * 58, h / 2 + Math.sin(a) * 58); g.stroke(); }
  const a = -Math.PI / 2 + secs / 60 * Math.PI * 2;
  g.strokeStyle = running ? '#d62828' : '#222'; g.lineWidth = 4; g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + Math.cos(a) * 48, h / 2 + Math.sin(a) * 48); g.stroke();
  if (flag) { g.fillStyle = '#d62828'; g.beginPath(); g.moveTo(w / 2 + 30, 14); g.lineTo(w / 2 + 52, 22); g.lineTo(w / 2 + 30, 30); g.fill(); }
}
function updateClock(t) {
  if (t < C.clock0) return;
  const turn = t < C.press[0] ? 0 : t < C.press[1] ? 1 : 0;
  const run = s => Math.max(0, t - C.clock0 - 0.6) * (turn === s ? 8 : 0.0);
  const left = 40 + (t < C.press[0] ? (t - C.clock0) * 8 : (C.press[0] - C.clock0) * 8 + Math.max(0, t - C.press[1]) * 8);
  const right = 10 + (between(t, C.press[0], C.press[1]) ? (t - C.press[0]) * 8 : t > C.press[1] ? (C.press[1] - C.press[0]) * 8 : 0);
  drawClockFace(R.clockFaces[0].c, left, turn === 0, false); R.clockFaces[0].tx.needsUpdate = true;
  drawClockFace(R.clockFaces[1].c, right, turn === 1, false); R.clockFaces[1].tx.needsUpdate = true;
  R.btns.forEach((b, i) => { b.position.y = 0.85 - ((turn === 0 ? i === 1 : i === 0) ? 0.06 : 0); });
}
function burstPts(t, t0, origin, n, pool, offset, opt) {
  const a = t - t0; if (a < 0 || a > opt.life) return offset;
  for (let i = 0; i < n && offset < pool.length; i++, offset++) {
    const m = pool[offset];
    const ang = rnd(i + opt.seed) * Math.PI * 2, el = rnd(i + opt.seed + 9) * 1.2 - 0.2, v = opt.spd * (0.4 + rnd(i + opt.seed + 50) * 0.8);
    m.visible = true;
    m.position.set(origin.x + Math.cos(ang) * Math.cos(el) * v * a, origin.y + Math.sin(el) * v * a - opt.g * a * a, origin.z + Math.sin(ang) * Math.cos(el) * v * a);
    m.scale.setScalar(opt.size * (1 - a / opt.life * 0.6));
    if (m.material.transparent) m.material.opacity = 0.75 * (1 - a / opt.life);
  }
  return offset;
}
function buildParticles() {
  R.dust = []; for (let i = 0; i < 40; i++) { const m = mesh(GEO.sph, new THREE.MeshStandardMaterial({ color: '#c8a77a', transparent: true, opacity: 0.7, depthWrite: false }), false); m.visible = false; scene.add(m); R.dust.push(m); }
  R.spark = []; for (let i = 0; i < 70; i++) { const m = mesh(GEO.sph, new THREE.MeshBasicMaterial({ color: '#ffe066', toneMapped: false }), false); m.visible = false; scene.add(m); R.spark.push(m); }
}
function updateParticles(t) {
  R.dust.forEach(m => (m.visible = false));
  let d = 0;
  for (let j = 0; j < 3; j++) d = burstPts(t, C.clash + j * 0.25, V3((j - 1) * 1.5, FLOOR + 0.3, 8.5 + j), 12, R.dust, d, { life: 1.1, spd: 3, g: 1, size: 0.45, seed: 5 + j * 13 });
  R.spark.forEach(m => (m.visible = false));
  let s = 0;
  if (between(t, C.morph, C.morph + 1.6)) {
    for (const p of R.pieces) {
      const tm = C.morph + (p.id % 16) * 0.07 + p.side * 0.04;
      s = burstPts(t, tm, V3(sqX(p.f), 0.7, sqZ(p.r)), 2, R.spark, s, { life: 0.45, spd: 2.5, g: 2, size: 0.06, seed: p.id * 7 });
    }
  }
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
  const [a, b] = ['COMO FOI INVENTADO O ', 'XADREZ'];
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
  ctx.fillText('INVENÇÕES', 418, 1676);
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

// ================================================================ camada 2D própria do xadrez
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
function hourglass(x, y, s, t) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(Math.sin(t * 2) * 0.08);
  ctx.fillStyle = '#7a4a2a'; rr(-70, -110, 140, 18, 8); ctx.fill(); rr(-70, 92, 140, 18, 8); ctx.fill();
  ctx.fillStyle = 'rgba(200,230,255,.85)'; ctx.strokeStyle = '#141824'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(-55, -92); ctx.lineTo(55, -92); ctx.lineTo(8, 0); ctx.lineTo(55, 92); ctx.lineTo(-55, 92); ctx.lineTo(-8, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  const k = (t * 0.25) % 1;
  ctx.fillStyle = '#e9b44c';
  ctx.beginPath(); ctx.moveTo(-40 * (1 - k), -80 + 70 * k); ctx.lineTo(40 * (1 - k), -80 + 70 * k); ctx.lineTo(6, -6); ctx.lineTo(-6, -6); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-50, 88); ctx.lineTo(50, 88); ctx.lineTo(50 * k, 88 - 60 * k); ctx.lineTo(-50 * k, 88 - 60 * k); ctx.closePath(); ctx.fill();
  ctx.fillRect(-3, -6, 6, 92);
  ctx.restore();
}
function bigClock(x, y, s, t, t0) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = '#f6f1e4'; ctx.strokeStyle = '#141824'; ctx.lineWidth = 10; circ(0, 0, 120); ctx.fill(); ctx.stroke();
  ctx.lineWidth = 6; for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; line(Math.cos(a) * 96, Math.sin(a) * 96, Math.cos(a) * 110, Math.sin(a) * 110); }
  const sp = (t - t0) * 9;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#141824'; ctx.lineWidth = 10; line(0, 0, Math.cos(sp / 12 - Math.PI / 2) * 60, Math.sin(sp / 12 - Math.PI / 2) * 60);
  ctx.strokeStyle = '#d62828'; ctx.lineWidth = 6; line(0, 0, Math.cos(sp - Math.PI / 2) * 95, Math.sin(sp - Math.PI / 2) * 95);
  ctx.restore();
}
function failOverlays(t, wt) {
  // capturas que não acabam
  if (between(wt, C.cap0 + 0.3, C.rwK.a)) hourglass(880, 520, 1.0, t);
  // conselheiro lento
  if (between(wt, C.slow + 0.3, C.rwD.a)) hourglass(880, 520, 1.0, t);
  // jogador pensando por horas
  if (between(wt, C.think, C.rwT.a)) {
    const k = EZ.back(P(wt, C.think, 0.4));
    bigClock(780, 560, k, t, C.think);
    ctx.save(); ctx.globalAlpha = P(wt, C.think + 0.6, 0.3);
    bigWord(`${Math.min(9, 1 + Math.floor((wt - C.think) * 2.2))} HORAS DEPOIS...`, 540, 790, 64, '#ffffff'); ctx.restore();
  }
  // diagonais difíceis de ver no tabuleiro liso
  if (between(wt, S('c1') + 0.2, C.rwC.a)) {
    const k = P(wt, S('c1') + 0.2, 0.5);
    ctx.save(); ctx.globalAlpha = k; ctx.strokeStyle = '#ff4d3d'; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.setLineDash([22, 16]);
    for (let i = 0; i < 3; i++) {
      const a = project(SQ(i, 0, 0.05)), b = project(SQ(i + 5, 5 + (i % 2), 0.05));
      ctx.beginPath(); ctx.moveTo(a[0], a[1]);
      ctx.quadraticCurveTo((a[0] + b[0]) / 2 + Math.sin(t * 5 + i) * 60, (a[1] + b[1]) / 2 + 40 * Math.cos(t * 4 + i), b[0], b[1]); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.restore();
    const s = EZ.back(P(wt, S('c1') + 0.6, 0.3));
    ctx.save(); ctx.translate(820, 560); ctx.scale(s, s); bigWord('?', 0, 0, 220, '#ffd23f'); ctx.restore();
  }
}
function comic(t, wt) {
  const word = (t0, dur, v, txt, size, col) => {
    if (t < t0 || t > t0 + dur) return;
    const [x, y, z] = project(v); if (z > 1) return;
    const k = P(t, t0, dur);
    ctx.save(); ctx.translate(x, y - 120); ctx.scale(EZ.back(cl(k * 3)), EZ.back(cl(k * 3))); ctx.rotate(-0.1); ctx.globalAlpha *= 1 - P(t, t0 + dur * 0.7, dur * 0.3);
    bigWord(txt, 0, 0, size, col); ctx.restore();
  };
  word(C.clash, 1.1, V3(0, FLOOR + 1.5, 9), 'CRASH!', 120, '#ff5a3c');
  word(wT('k3', 'xá') - 0.1, 1.4, SQ(4, 7, 1.6), 'XÁ MAT!', 100, '#ffd23f');
  word(C.jump + 0.8, 0.8, SQ(2, 2, 1.4), 'L!', 110, '#ffd23f');
}
function overlays(t) {
  const rw = inRewind(t);
  if (rw) vhs(t, rw);
  if (t >= C.stamp) {
    const k = P(t, C.stamp, 0.22);
    const sc = lerp(3, 1, EZ.o(k));
    ctx.save(); ctx.translate(540, 520); ctx.rotate(-0.12); ctx.scale(sc, sc); ctx.globalAlpha = cl(k * 2);
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
    ctx.fillText('QUAL INVENÇÃO EU', 0, -30);
    ctx.fillStyle = '#e63946'; ctx.fillText('MOSTRO NO PRÓXIMO?', 0, 34);
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
  buildRoom(); buildBoard(); buildPieces(); buildArmies(); buildProps(); buildParticles();
  HOST = makeHost(hostScene);
  const HS = 3.2;
  HOSTW_PLACE = grp(null, 0, FLOOR + 1.68 * HS, 10.2); HOSTW_PLACE.scale.setScalar(HS);
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
window.prof = () => PROF;
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
