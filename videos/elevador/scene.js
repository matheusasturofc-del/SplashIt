/* Animação 3D do vídeo "Elevador" (Three.js).
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

// ================================================================ medidas do mundo (metros)
const FH = 2.5, NF = 5, ROOF = 12.5;
const BX = 4.1, SXL = -1.8, SXR = 1.6, BZ = 2.5, SZ = 1.4;
const CABX = -0.4, CABW = 2.0, CABH = 2.0, CABD = 2.0;
const CWX = 1.15, CWW = 0.54, CWH = 1.7, CWD = 0.5;
const PUL = { x: 0.375, y: 13.3, r: 0.775 };
const MOT = { x: 1.85, y: 13.15 };
const BRK = { x: 2.85, y: 13.15, r: 0.22 };
const DRUM = { x: -0.04, y: 13.25, r: 0.36 };
const RAILS = [-1.5, 0.7, 0.82, 1.48];
const GOV = { x: -1.46, y: 12.95, z: -1.2, r: 0.22 };
const PIT = -0.85;
const DOORF = 2;
const DOORX = -1.8;

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
  C.cab0 = wT('h1', 'caixa') - 0.15;
  C.rope0 = wT('h1', 'corda') - 0.05;
  C.mot0 = wT('h1', 'motor') - 0.1;
  C.lift0 = S('h2') - 0.2;
  C.burn = wT('h2', 'queimado') + 0.1;
  C.weight = S('h3') + 0.6;
  C.c1x = S('c1') + 0.1;
  C.pul0 = C.c1x + 0.25;
  C.rr0 = wT('c1', 'roda') + 0.1;
  C.cw0 = wT('c2', 'bloco') - 0.15;
  C.cwp0 = C.cw0 + 0.35;
  C.sw0 = S('g1') + 0.15; C.sw1 = E('g1') + 0.3; C.swW = 2 * Math.PI / 1.1;
  C.rl0 = wT('g2', 'trilhos') - 0.2;
  C.snap = wT('k1', 'arrebenta') + 0.1;
  C.dropK = 10; C.gK = 2 * C.dropK / (0.85 * 0.85); C.land = C.snap + 0.85;
  C.rwS = Math.max(C.land + 0.5, E('k1') + 0.1); C.rwE = C.rwS + 0.9;
  C.cb0 = wT('k2', 'cabos') - 0.1;
  C.off1 = wT('f1', 'acaba') + 0.1; C.on1 = S('f2') - 0.05;
  C.drift0 = wT('f1', 'lado') - 0.2; C.drift1 = E('f1') + 0.45;
  C.up0 = S('f2') + 0.05;
  C.brk0 = wT('f2', 'freio') - 0.1;
  C.brkE = wT('f2', 'energia');
  C.off2 = wT('f3', 'sem luz') - 0.1; C.clac = C.off2 + 0.08; C.on2 = S('s1') - 0.15;
  C.s1det = wT('s1', 'soltarem') + 0.05; C.s1frz = C.s1det + 0.5;
  C.s1rwS = S('s2') + 0.05; C.s1rwE = C.s1rwS + 0.6;
  C.gov0 = wT('s2', 'roda') - 0.1;
  C.g0 = wT('s2', 'gira') - 0.3;
  C.d2 = wT('s2', 'rápido') - 0.35;
  C.lock = wT('s2', 'trava') + 0.05;
  C.stop = wT('s3', 'agarram') + 0.25; C.jaw = C.stop - 0.2; C.gDrop = 2.3;
  C.otis0 = wT('s4', 'elisha') - 0.3; C.otis1 = E('s4') + 0.3;
  C.reset = S('p1') + 0.5;
  C.po0 = S('p1') + 0.35;
  C.pw0 = S('p1') + 0.55; C.pw1 = wT('p1', 'quase') - 0.1;
  C.pt0 = C.pw1; C.pt1 = E('p1') + 0.35;
  C.pout0 = S('p2') + 0.3;
  C.lt0 = wT('p2', 'trava') - 0.25;
  C.arr0 = wT('p2', 'cabine') - 0.5; C.arr1 = wT('p2', 'chega') + 0.35;
  C.unlock = Math.max(C.arr1 + 0.05, wT('p2', 'destrava'));
  C.rw0 = S('r1') - 0.7; C.rw1 = S('r1') + 0.6;
  C.cl0 = wT('r1', 'fecha'); C.slam = C.cl0 + 0.35;
  C.ro0 = S('r2') + 0.05;
  C.bm0 = wT('r2', 'cortina') - 0.2;
  C.cl2 = wT('r2', 'se alguma') - 0.15; C.h1 = wT('r2', 'corta') + 0.1;
  C.cl3 = wT('r3', 'quando'); C.h2 = wT('r3', 'mão') + 0.3;
  C.doorEnd = S('e1') - 0.2;
  C.acc = [wT('e1', 'botões'), wT('e1', 'painel'), wT('e1', 'espelho'), wT('e1', 'musiquinha')];
  C.press = S('e2') + 0.2; C.ride0 = S('e2') + 0.45; C.ride1 = C.ride0 + 2.2;
  C.stamp = S('e3') + 0.25;
  C.cta = S('e4') - 0.1;

  const K = [[0, 0]];
  K.push([C.lift0, 0], [C.burn, 0.3, 'io'], [C.burn + 0.35, 0, 'i']);
  K.push([S('c3') + 0.4, 0], [E('c3') + 0.1, 1]);
  C.c5a = S('c5') + 0.6; C.c5b = E('c5');
  K.push([C.c5a, 1], [C.c5b, 3]);
  C.cross = (C.c5a + C.c5b) / 2;
  C.g3up = wT('g3', 'sobe') - 0.4; K.push([C.g3up, 3], [C.g3up + 1.6, 4]);
  K.push([S('k3') - 0.1, 4], [E('k3') + 0.5, 2]);
  K.push([C.drift0, 2], [C.drift1, 0, 'i']);
  K.push([C.up0, 0], [C.up0 + 1.1, 2]);
  K.push([S('s1') - 0.1, 2], [S('s1') + 0.8, 3]);
  K.push([C.g0, 3], [C.g0 + 1.2, 3.5]);
  K.push([C.reset, 3.5], [C.reset + 0.01, 4, 'lin']);
  K.push([C.arr0, 4], [C.arr1, 2]);
  K.push([C.ride0, 2], [C.ride1, 4]);
  C.cabKeys = K;

  C.lightKeys = [[0, 0], [C.off1, 0], [C.off1 + 0.12, 1, 'lin'], [C.on1, 1], [C.on1 + 0.3, 0, 'lin'],
    [C.off2, 0], [C.off2 + 0.12, 1, 'lin'], [C.on2, 1], [C.on2 + 0.3, 0, 'lin']];

  C.bangs = [];
  for (let k = 0; k < 20; k++) {
    const tk = C.sw0 + (Math.PI / 2 + k * Math.PI) / C.swW;
    if (tk > C.sw1 + 0.3) break;
    const env = Math.min(P(tk, C.sw0, 0.6), 1 - P(tk, C.sw1, 0.6));
    if (env > 0.55) C.bangs.push({ t: tk, side: k % 2 === 0 ? 1 : -1 });
  }

  // câmera: [alvoX, alvoY, alvoZ, distância, azimute, elevação, fov]
  const OV = [0, 6.9, 0, 27, 0.32, 0.1, 38];
  const cabY = t => cabBottom(t) + 1.0;
  const cwY = t => cwBottomAt(t) + CWH / 2;
  const DOOR = [-1.9, 6.05, 0, 3.1, -0.7, 0.1, 56];
  const CK = [];
  CK.push([0, [0, 6.0, 0, 36, -1.1, 0.42, 38]], [2.6, OV]);
  CK.push([C.burn - 1.0, OV], [C.burn - 0.3, [1.0, 13.2, 0, 7.5, 0.55, 0.12, 40]], [S('h3') + 0.1, [1.0, 13.2, 0, 7.0, 0.25, 0.1, 40]],
    [S('h3') + 0.9, [CABX, 1.1, 0, 9, -0.35, 0.18, 40]], [S('c1') - 0.05, [CABX, 1.1, 0, 8.5, -0.1, 0.16, 40]]);
  CK.push([S('c1') + 0.6, [0.5, 13.0, 0, 8.5, -0.75, 0.16, 40]], [C.cw0 + 0.2, [0.7, 12.4, 0, 8.5, 0.15, 0.12, 40]],
    [C.cw0 + 1.8, [1.15, 11.2, 0, 7.5, 0.65, 0.1, 40]], [S('c3') + 0.3, OV]);
  const cwAtC4 = cwY(wT('c4', 'contrapeso'));
  CK.push([S('c4') - 0.2, OV], [S('c4') + 0.4, [CWX, cwAtC4, 0, 6.5, 0.7, 0.08, 40]], [E('c4') + 0.3, [CWX, cwAtC4, 0, 6.2, 0.35, 0.08, 40]],
    [S('c5') + 0.5, [0.3, 6.2, 0, 19, 0.45, 0.06, 38]], [E('c5'), [0.3, 7.0, 0, 18, 0.15, 0.06, 38]]);
  CK.push([S('g1') + 0.05, [CABX, 8.5, 0, 9.5, -0.45, 0.14, 40]], [E('g1') + 0.3, [CABX, 8.5, 0, 8.5, 0.4, 0.1, 40]],
    [S('g2') + 0.5, [0, 6.6, 0, 26, -0.75, 0.22, 38]], [E('g2'), [0, 6.6, 0, 25, 0.55, 0.12, 38]]);
  const cabAtG3 = cabY(wT('g3', 'guias'));
  CK.push([S('g3') + 0.2, [-1.4, cabAtG3, 0, 6.5, -0.7, 0.08, 40]], [wT('g3', 'sobe') - 0.3, [-1.2, cabAtG3, 0, 6.5, -0.3, 0.08, 40]],
    [S('k1') + 0.1, [0, 6.5, 0, 22, 0.25, 0.08, 38]], [E('k1') + 1.2, [0, 6.5, 0, 22, 0.05, 0.08, 38]]);
  CK.push([S('k2') + 0.5, [0.4, 12.2, 0, 8.5, -0.65, 0.2, 40]], [E('k3') - 0.2, [0.4, 12.0, 0, 8.5, 0.6, 0.15, 40]],
    [E('k3') + 0.6, OV]);
  CK.push([C.brk0 - 0.6, [0.8, 9, 0, 20, 0.2, 0.1, 38]], [C.brk0, [BRK.x - 0.3, 13.25, 0, 4.2, 0.45, 0.18, 42]],
    [C.off2 + 0.35, [BRK.x - 0.3, 13.25, 0, 3.8, -0.35, 0.12, 42]], [C.off2 + 1.1, [0, 7.2, 0, 24, 0.3, 0.1, 38]]);
  CK.push([S('s1') + 0.6, [0, 7.0, 0, 21, 0.4, 0.08, 38]], [S('s2') + 0.1, [0, 7.0, 0, 21, 0.2, 0.08, 38]],
    [S('s2') + 0.8, [GOV.x, 12.9, GOV.z, 4.6, -0.2, 0.2, 42]], [C.d2 - 0.4, [GOV.x, 12.9, GOV.z, 4.4, 0.1, 0.15, 42]],
    [C.d2 + 0.3, [CABX, 9.6, 0, 10, -0.2, 0.1, 40]]);
  const cabStop = cabBottomRaw(3.5, C.gDrop + 0.1);
  CK.push([C.stop - 0.7, [CABX, cabStop + 0.3, 0, 6.5, -0.65, -0.05, 42]], [S('s4') + 0.4, [CABX, cabStop + 0.3, 0, 6.3, 0.1, 0.02, 42]],
    [S('s4') + 1.4, [0, 7.0, 0, 22, 0.35, 0.08, 38]], [E('s4') + 0.05, [0, 7.0, 0, 22, 0.15, 0.08, 38]]);
  CK.push([S('p1') + 0.3, DOOR], [C.pw1 - 0.3, [-1.9, 6.0, 0, 3.2, -0.6, 0.1, 56]],
    [C.pt0 + 0.4, [-1.8, 5.6, 0, 3.4, -0.2, 0.18, 55]], [C.pt1 + 0.3, [-1.8, 5.6, 0, 3.3, -0.35, 0.2, 55]],
    [C.pt1 + 1.0, DOOR]);
  CK.push([C.lt0 - 0.1, DOOR], [C.lt0 + 0.5, [-1.95, 7.15, 0, 1.6, -0.95, -0.05, 52]], [C.unlock + 0.3, [-1.95, 7.1, 0, 1.6, -1.25, -0.05, 52]],
    [C.unlock + 1.0, DOOR], [E('p3'), [-1.9, 6.05, 0, 3.3, -0.7, 0.08, 56]]);
  CK.push([C.slam - 0.4, DOOR], [C.slam + 0.4, [-1.9, 6.0, 0, 3.0, -0.8, 0.1, 58]],
    [C.bm0 + 0.2, [-1.85, 6.0, 0, 2.9, -0.85, 0.06, 58]], [E('r3'), [-1.85, 6.0, 0, 3.0, -0.65, 0.06, 58]]);
  CK.push([C.doorEnd + 0.7, [CABX, 6.0, 0.3, 6.5, 0.25, 0.1, 40]], [C.ride0, [CABX, 6.0, 0.3, 6.3, 0.05, 0.1, 40]],
    [C.ride1, [CABX, 11.0, 0.3, 7.5, -0.2, 0.08, 40]], [S('e3') + 0.2, [CABX, 11.0, 0.3, 8.5, -0.3, 0.08, 40]],
    [S('e3') + 1.2, [0, 7.4, 0, 28, 0.2, 0.12, 38]], [TL.duration, [0, 7.4, 0, 30, -1.0, 0.18, 38]]);
  C.camKeys = sortK(CK);

  C.shakes = [[C.burn, 0.25], [C.burn + 0.35, 0.2], [C.land, 0.7], [C.drift1, 0.4], [C.stop, 0.3], [C.slam, 0.2], [C.stamp + 0.18, 0.4]];
  for (const b of C.bangs) C.shakes.push([b.t, 0.15]);

  C.doorKeys = [[0, 0], [C.po0, 0], [C.po0 + 0.6, 1], [C.pt1 + 0.25, 1], [C.pt1 + 0.85, 0],
    [C.unlock + 0.2, 0], [C.unlock + 0.85, 1],
    [C.cl0, 1], [C.slam, 0.42, 'i2'],
    [C.ro0, 0.42], [C.ro0 + 0.5, 1],
    [C.cl2, 1], [C.h1, 0.6, 'lin'], [C.h1 + 0.05, 0.6], [C.h1 + 0.5, 1],
    [C.cl3, 1], [C.h2, 0.62, 'lin'], [C.h2 + 0.05, 0.62], [C.h2 + 0.5, 1],
    [C.doorEnd + 1.2, 1], [C.doorEnd + 1.8, 0], [C.ride0 - 0.3, 0]];
  C.personKeys = [[C.pw0, [-3.6, -1.7]], [C.pw1, [-2.08, 0], 'o'], [C.pt1, [-2.08, 0]],
    [C.pt1 + 0.45, [-2.7, -0.3]], [C.pout0, [-2.7, -0.3]], [C.pout0 + 1.1, [-3.7, -2.0], 'i2'],
    [C.rw0 - 0.01, [-3.7, -2.0]], [C.rw0, [-3.7, -2.0], 'lin'], [C.rw1, [-1.95, 0], 'o'],
    [C.ro0, [-1.95, 0]], [C.ro0 + 0.6, [-2.45, 0]]];
  C.reachKeys = [[0, 0], [C.cl2, 0], [C.h1 - 0.1, 1], [C.h1 + 0.6, 1], [C.h1 + 1.0, 0],
    [C.cl3, 0], [C.h2 - 0.1, 1], [C.h2 + 0.6, 1], [C.h2 + 1.0, 0]];

  const Rx = (t, d, e, p, b) => REACT.push({ t, d, e, p, b });
  Rx(C.lift0 + 0.2, C.burn - C.lift0 - 0.2, 'worried', 'down', null);
  Rx(C.burn, 1.8, 'shock', 'cheeks', '!!');
  Rx(S('c3') + 0.8, 1.6, 'happy', 'thumbs', null);
  if (C.bangs.length) Rx(C.bangs[0].t, 1.8, 'wince', 'cheeks', 'Opa!');
  Rx(wT('g3', 'reto'), 1.5, 'happy', 'thumbs', null);
  Rx(C.snap, C.land - C.snap, 'shock', 'up', 'AAAH!');
  Rx(C.land, C.rwS - C.land, 'wince', 'cover', null);
  Rx(C.rwS, 1.0, 'worried', 'down', 'Peraí...');
  Rx(S('k3') + 0.2, 1.4, 'happy', 'thumbs', null);
  Rx(C.off1 + 0.1, C.drift1 - C.off1 - 0.2, 'worried', 'down', '?');
  Rx(C.drift1 - 0.1, 1.3, 'shock', 'cheeks', '!!');
  Rx(C.clac + 0.3, 1.8, 'relieved', 'wipe', 'Ufa!');
  Rx(C.s1det, C.s1rwS - C.s1det, 'shock', 'up', '!!!');
  Rx(C.lock, C.stop - C.lock, 'worried', 'cheeks', null);
  Rx(C.stop + 0.1, 1.8, 'relieved', 'wipe', 'Ufa!');
  Rx(C.otis0 + 0.5, 2.2, 'think', 'down', 'Uau!');
  Rx(C.pt0, C.pt1 - C.pt0 + 0.3, 'shock', 'cover', 'Cuidado!');
  Rx(wT('p3', 'trava') + 0.3, 1.4, 'happy', 'thumbs', null);
  Rx(C.slam, 1.4, 'wince', 'cheeks', 'Ai!');
  Rx(C.h1 + 0.1, 1.2, 'happy', 'thumbs', null);
  Rx(C.ride1, 0.9, 'happy', 'thumbs', null);
  Rx(C.stamp + 0.15, 2.4, 'happy', 'cheer', 'Uhuul!');
  Rx(C.cta, TL.duration - C.cta, 'happy', 'point', null);
  REACT.sort((a, b) => a.t - b.t);

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const Lb = (txt, t0, t1, at, off) => { LABELS.push({ txt, t0, t1, at, off }); CHIPS.push({ txt, t: t0 }); };
  Lb('CONTRAPESO', wT('c4', 'contrapeso'), nextBeatStart('c4') - 0.3, t => V(CWX, cwBottomAt(t) + CWH * 0.6, CWD / 2), [-210, -160]);
  Lb('GUIAS', wT('g3', 'guias'), nextBeatStart('g3') - 0.3, t => V(RAILS[0], cabBottom(t) - 0.6, 0), [-60, 200]);
  Lb('CABOS DE TRAÇÃO', wT('k3', 'cabos'), nextBeatStart('k3') - 0.2, t => V(CABX, (cabBottom(t) + CABH + PUL.y) / 2, 0), [140, 170]);
  Lb('FREIO', wT('f3', 'freio'), C.off2 + 0.6, () => V(BRK.x, BRK.y - 0.25, 0.2), [-80, 230]);
  Lb('FREIO DE SEGURANÇA', wT('s4', 'freio'), E('s4') + 0.2, t => V(RAILS[0] + 0.1, cabBottom(t) + 0.05, 0.3), [190, 230]);
  Lb('TRAVA DA PORTA', wT('p3', 'trava'), E('p3') + 0.3, () => V(-1.98, DOORF * FH + 2.25, 0), [60, -230]);
  Lb('CORTINA DE LUZ', S('r3') + 0.2, E('r3') + 0.4, () => V(-1.8, DOORF * FH + 1.3, 0), [80, -380]);

  // ---------- setas (movimento e força), ancoradas no 3D
  const Ar = (t0, t1, at, dir, len, col, kind = 'line') => ARROWS.push({ t0, t1, at, dir: new THREE.Vector3(...dir), len, col, kind });
  const UP = [0, 1, 0], DN = [0, -1, 0];
  const GREEN = '#2ecc71', RED = '#ff4d3d', BLUE = '#4d9bff', YEL = '#ffd23f', ORA = '#ff9f1c';
  const cabSide = t => V(CABX - 1.4, cabBottom(t) + 1.0, 0.7);
  const cwSide = t => V(CWX + 0.6, cwBottomAt(t) + CWH / 2, 0.4);
  // gancho: motor puxando tudo sozinho
  Ar(C.lift0, C.burn, () => V(DRUM.x - 0.4, DRUM.y - 1.4, 0.4), UP, 1.0, RED);
  // contrapeso: um sobe, o outro desce
  for (const [a0, a1] of [[S('c3') + 0.4, E('c3') + 0.2], [C.c5a, C.c5b]]) {
    Ar(a0, a1, cabSide, UP, 1.3, GREEN);
    Ar(a0, a1, cwSide, DN, 1.3, BLUE);
  }
  // cabine balançando para os lados
  Ar(C.sw0 + 0.3, C.sw1, t => V(CABX, cabBottom(t) + CABH + 0.55, 0.6), [1, 0, 0], 0.9, ORA);
  Ar(C.sw0 + 0.3, C.sw1, t => V(CABX, cabBottom(t) + CABH + 0.55, 0.6), [-1, 0, 0], 0.9, ORA);
  // queda
  Ar(C.snap + 0.05, C.land, t => V(CABX, cabBottom(t) + CABH + 0.6, 0.6), DN, 1.8, RED);
  Ar(C.drift0 + 0.2, C.drift1, cabSide, DN, 1.3, RED);
  Ar(C.up0, C.up0 + 1.1, cabSide, UP, 1.3, GREEN);
  // freio: molas apertam, energia abre, sem luz aperta de novo
  const shoeAt = s => () => V(BRK.x + s * 0.75, BRK.y, 0.3);
  for (const s of [-1, 1]) {
    Ar(wT('f2', 'apertado') - 0.2, C.brkE, shoeAt(s), [-s, 0, 0], 0.35, RED);
    Ar(C.brkE + 0.05, C.brkE + 1.4, () => V(BRK.x + s * 0.38, BRK.y, 0.3), [s, 0, 0], 0.35, YEL);
    Ar(C.clac, C.clac + 1.0, shoeAt(s), [-s, 0, 0], 0.35, RED);
  }
  // limitador girando junto com a cabine
  Ar(C.g0, C.g0 + 1.4, () => V(GOV.x, GOV.y, GOV.z), [0, 0, 1], 0, YEL, 'spin');
  Ar(C.d2, C.lock, () => V(GOV.x, GOV.y, GOV.z), [0, 0, 1], 0, RED, 'spin');
  Ar(C.d2, C.stop, cabSide, DN, 1.3, RED);
  // garras subindo e agarrando os trilhos
  Ar(C.jaw - 0.05, C.stop + 0.9, t => V(RAILS[0] - 0.1, cabBottom(t) - 0.55, 0.3), UP, 0.45, YEL);
  Ar(C.jaw - 0.05, C.stop + 0.9, t => V(RAILS[1] + 0.1, cabBottom(t) - 0.55, 0.3), UP, 0.45, YEL);
  // cabine chegando e a rampa empurrando a trava
  Ar(C.arr0 + 0.2, C.arr1 + 0.3, () => V(-2.0, DOORF * FH + 2.95, -0.33), DN, 0.35, BLUE);
  // portas voltando quando a luz é cortada
  for (const h of [C.h1, C.h2]) {
    Ar(h + 0.05, h + 0.7, () => V(-1.95, DOORF * FH + 0.6, -0.35), [0, 0, -1], 0.4, GREEN);
    Ar(h + 0.05, h + 0.7, () => V(-1.95, DOORF * FH + 0.6, 0.35), [0, 0, 1], 0.4, GREEN);
  }
  // portas fechando em cima da pessoa
  Ar(C.cl0, C.slam, () => V(-1.95, DOORF * FH + 0.6, -0.8), [0, 0, 1], 0.4, RED);
  Ar(C.cl0, C.slam, () => V(-1.95, DOORF * FH + 0.6, 0.8), [0, 0, -1], 0.4, RED);
  // subida final
  Ar(C.ride0, C.ride1, t => V(CABX + 0.2, cabBottom(t) + CABH + 0.55, 0.6), UP, 1.0, GREEN);

  for (let i = 0; i <= NF; i++) sfx(0.25 + i * 0.28, 'whoosh', 0.35), sfx(0.55 + i * 0.28, 'thud', 0.45);
  sfx(C.cab0 + 0.25, 'clank', 0.7);
  sfx(C.rope0, 'whoosh', 0.5);
  sfx(C.mot0 + 0.25, 'clank', 0.75);
  sfx(C.lift0, 'strain', 0.6, C.burn - C.lift0);
  sfx(C.burn, 'blowout', 1.0);
  sfx(C.burn + 0.35, 'thud', 0.7);
  sfx(C.c1x, 'whoosh', 0.7);
  asmSfx(C.pul0, 0.9, 3, 'clank', 0.55);
  sfx(C.rr0, 'whoosh', 0.45);
  sfx(C.cw0 + 0.2, 'clank', 0.5);
  for (let i = 0; i < 6; i++) sfx(C.cwp0 + i * 0.22 + 0.25, 'clank', 0.5);
  sfx(S('c3') + 0.4, 'hum', 0.35, E('c3') + 0.1 - S('c3') - 0.4);
  sfx(C.c5a, 'hum', 0.35, C.c5b - C.c5a);
  for (const b of C.bangs) sfx(b.t, 'thud', 0.65);
  asmSfx(C.rl0, 1.6, 7, 'clank', 0.45, 0.35);
  sfx(C.rl0 + 1.45, 'pop', 0.5);
  sfx(C.g3up, 'hum', 0.35, 1.6);
  sfx(C.snap - 0.7, 'creak', 0.7);
  sfx(C.snap, 'snap', 1.0);
  sfx(C.snap + 0.05, 'fall', 0.5, C.land - C.snap);
  sfx(C.land, 'crash', 1.0);
  sfx(C.rwS, 'rewind', 0.6, C.rwE - C.rwS);
  asmSfx(C.cb0, 1.8, 5, 'zip', 0.5);
  sfx(S('k3') - 0.1, 'hum', 0.3, E('k3') + 0.6 - S('k3'));
  sfx(C.off1, 'powerdown', 0.7);
  sfx(C.drift0, 'slide', 0.5, C.drift1 - C.drift0);
  sfx(C.drift1, 'crash', 0.7);
  sfx(C.on1, 'powerup', 0.6);
  sfx(C.up0, 'hum', 0.3, 1.1);
  asmSfx(C.brk0, 1.2, 5, 'clank', 0.5);
  sfx(C.brkE, 'zap', 0.6);
  sfx(C.off2, 'powerdown', 0.7);
  sfx(C.clac, 'clac', 1.0);
  sfx(C.on2, 'powerup', 0.4);
  sfx(S('s1') - 0.1, 'hum', 0.3, 0.9);
  sfx(C.s1det, 'snap', 0.9);
  sfx(C.s1frz, 'freeze', 0.7);
  sfx(C.s1rwS, 'rewind', 0.6, C.s1rwE - C.s1rwS);
  asmSfx(C.gov0, 1.4, 5, 'pop', 0.5);
  sfx(C.g0, 'hum', 0.3, 1.2);
  sfx(C.d2, 'snap', 0.9);
  sfx(C.d2 + 0.1, 'fall', 0.35, C.stop - C.d2);
  sfx(C.lock, 'clank', 0.9);
  sfx(C.jaw, 'screech', 0.8, 0.45);
  sfx(C.stop, 'thud', 0.8);
  sfx(C.otis0, 'pop', 0.6);
  sfx(E('s4') + 0.05, 'whoosh', 0.6);
  sfx(C.po0, 'slide', 0.5, 0.6);
  sfx(C.pt0, 'alarm', 0.5);
  sfx(C.pt1 + 0.25, 'slide', 0.5, 0.6);
  asmSfx(C.lt0, 1.0, 4, 'clank', 0.5);
  sfx(C.arr0, 'hum', 0.3, C.arr1 - C.arr0);
  sfx(C.unlock, 'clank', 0.7);
  sfx(C.unlock + 0.12, 'ding', 0.7);
  sfx(C.unlock + 0.2, 'slide', 0.5, 0.65);
  sfx(C.cl0, 'slide', 0.5, C.slam - C.cl0);
  sfx(C.slam, 'bonk', 1.0);
  sfx(C.ro0, 'slide', 0.45, 0.5);
  asmSfx(C.bm0, 1.2, 6, 'beep', 0.35);
  sfx(C.cl2, 'slide', 0.4, C.h1 - C.cl2);
  sfx(C.h1, 'alarm', 0.45); sfx(C.h1 + 0.05, 'slide', 0.4, 0.45);
  sfx(C.cl3, 'slide', 0.4, C.h2 - C.cl3);
  sfx(C.h2, 'alarm', 0.45); sfx(C.h2 + 0.05, 'slide', 0.4, 0.45);
  sfx(C.doorEnd, 'whoosh', 0.6);
  for (const a of C.acc) sfx(a + 0.2, 'pop', 0.6);
  sfx(C.press, 'click', 0.8);
  sfx(C.ride0, 'hum', 0.35, C.ride1 - C.ride0);
  sfx(C.ride1, 'ding', 0.8);
  sfx(C.stamp + 0.18, 'stamp', 1.0);
  sfx(C.stamp + 0.22, 'tada', 0.8);
  sfx(C.cta, 'pop', 0.6);
  SFX.sort((a, b) => a.t - b.t);
}

// ================================================================ estado
const cabF = t => kf(t, C.cabKeys);
const dark = t => kf(t, C.lightKeys);
function cabDy(t) {
  let dy = 0;
  if (t >= C.snap && t < C.rwE) {
    if (t < C.land) dy = 0.5 * C.gK * (t - C.snap) ** 2;
    else if (t < C.rwS) dy = C.dropK;
    else dy = C.dropK * (1 - EZ.io(P(t, C.rwS, C.rwE - C.rwS)));
  }
  if (t >= C.s1det && t < C.s1rwE) {
    let d = 0.5 * 15 * (Math.min(t, C.s1frz) - C.s1det) ** 2;
    if (t > C.s1rwS) d *= 1 - EZ.io(P(t, C.s1rwS, C.s1rwE - C.s1rwS));
    dy += d;
  }
  if (t >= C.d2 && t < C.reset) dy += kf(t, [[C.d2, 0], [C.stop, C.gDrop, 'i2'], [C.stop + 0.25, C.gDrop + 0.1, 'o']]);
  return dy;
}
const cabBottomRaw = (f, dy) => f * FH - dy;
const cabBottom = t => cabBottomRaw(cabF(t), cabDy(t));
function cwDy(t) {
  let dy = 0;
  if (t >= C.s1det && t < C.s1rwE) {
    let d = 0.5 * 15 * (Math.min(t, C.s1frz) - C.s1det) ** 2;
    if (t > C.s1rwS) d *= 1 - EZ.io(P(t, C.s1rwS, C.s1rwE - C.s1rwS));
    dy += d;
  }
  if (t >= C.d2 && t < C.reset) dy += 0.5 * 9 * Math.min(t - C.d2, 1.2) ** 2;
  return dy;
}
const cwBottomAt = t => Math.max(12 - CWH - 2.5 * cabF(t) - cwDy(t), PIT + 0.35);
const detached = t => (t >= C.s1det && t < C.s1rwE - 0.05) || (t >= C.d2 && t < C.reset);
const ropeSnapped = t => t >= C.snap && t < C.rwE - 0.05;
function cabSwing(t) {
  if (t < C.sw0 || t > C.sw1 + 0.6) return { dx: 0, rot: 0, spin: 0 };
  const env = Math.min(P(t, C.sw0, 0.6), 1 - P(t, C.sw1, 0.6));
  const ph = (t - C.sw0) * C.swW;
  return { dx: 0.46 * Math.sin(ph) * env, rot: 0.07 * Math.sin(ph + 0.6) * env, spin: 0.55 * Math.sin((t - C.sw0) * 2.3) * env };
}
function scare(t) {
  if (t >= C.snap && t < C.land) return 1;
  if (t >= C.s1det && t < C.s1rwS) return 1;
  if (t >= C.d2 && t < C.stop) return 0.6;
  if (t >= C.drift0 + 0.5 && t < C.drift1) return 0.5;
  return 0;
}
function shakeAt(t) {
  let x = 0, y = 0;
  for (const [t0, a] of C.shakes) {
    const d = t - t0; if (d < 0 || d > 0.7) continue;
    const k = a * Math.exp(-d * 7);
    x += k * Math.sin(d * 63); y += k * Math.cos(d * 51);
  }
  return [x, y];
}
const doorOpenAt = t => (t > S('p1') - 0.5 ? kf(t, C.doorKeys) : 0);
let _lockBottom = null;
const cabBottomAtLock = () => (_lockBottom ??= cabBottom(C.lock));
let _snapTop = null;
const cabTopAtSnap = () => (_snapTop ??= cabBottom(C.snap - 0.001) + CABH);

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
sun.position.set(9, 22, 16); sun.target.position.set(0, 6, 0);
sun.castShadow = Q.get('shadow') !== '0'; sun.shadow.mapSize.setScalar(+(Q.get('sh') || 2048));
Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 17, bottom: -5, near: 1, far: 70 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight('#bcd4ff', 0.9); fill.position.set(-12, 8, 10); scene.add(fill);
const cabLight = new THREE.PointLight('#fff1cf', 6, 4.5, 1.6); if (Q.get('pl') !== '0') scene.add(cabLight);

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
const COL = {
  wall: '#f7ecd9', wall2: '#ecdcc0', slab: '#b8bec7', shaft: '#5b6270', core: '#4b515d', mr: '#ece4d3', steel: '#c4ccd8',
  dsteel: '#2f343c', cab: '#3a6fb8', wood: '#dba46a', yellow: '#f0b021', plate: '#8f9aab', motor: '#3f9a68', red: '#d9452f',
  orange: '#ff9f1c', rope: '#9b6a3c', cable: '#aab4c2', grass: '#7cc35d', road: '#5b5f66',
};
const LAMPS = [], CLOUDS = [], FLOORS = [], LANDING = [];
const R = {};
function buildEnvironment() {
  const g = M(COL.grass);
  boxC(-60, -1, -60, SXL, 0, 60, g); boxC(SXR, -1, -60, 60, 0, 60, g);
  boxC(SXL, -1, -60, SXR, 0, -SZ, g); boxC(SXL, -1, SZ, SXR, 0, 60, g);
  boxC(SXL, PIT - 0.2, -SZ, SXR, PIT, SZ, M('#3b404b'));
  boxC(SXL, PIT, -SZ, SXL + 0.05, -0.01, SZ, M('#6b7280')); boxC(SXR - 0.05, PIT, -SZ, SXR, -0.01, SZ, M('#6b7280'));
  boxC(SXL + 0.05, PIT, -SZ, SXR - 0.05, -0.01, -SZ + 0.05, M('#6b7280'));
  boxC(-60, 0, 3.0, 60, 0.06, 5.0, M('#d4d0c8'));
  boxC(-60, -0.02, 5.0, 60, 0.03, 13, M(COL.road));
  for (let x = -40; x < 40; x += 3) boxC(x, 0.03, 8.9, x + 1.6, 0.05, 9.1, M('#f1f1f1'));
  const tree = (x, z, s) => {
    const tr = grp(null, x, 0, z);
    box(0.25 * s, 1.6 * s, 0.25 * s, M('#8a5a36'), 0, 0.8 * s, 0, tr);
    sph(1.0 * s, M('#4caf50'), 0, 2.0 * s, 0, tr); sph(0.75 * s, M('#5cc160'), 0.5 * s, 2.5 * s, 0.2 * s, tr); sph(0.7 * s, M('#43a047'), -0.5 * s, 2.4 * s, -0.2 * s, tr);
  };
  tree(-6.2, 1.5, 1.2); tree(6.4, 0.5, 1.4); tree(-7.5, -3, 1.0); tree(8, -4, 1.1); tree(-10, 4, 1.3); tree(11, 3.5, 1.0);
  const house = (x, z, w, h, c) => { boxC(x - w / 2, 0, z - 2, x + w / 2, h, z + 2, M(c)); const r = mesh(new THREE.ConeGeometry(w * 0.75, 1.6, 4), M('#c0503a')); r.position.set(x, h + 0.8, z); r.rotation.y = Math.PI / 4; scene.add(r); };
  house(-12, -10, 4, 3, '#f2d7a6'); house(13, -11, 5, 4, '#cfe3f2'); house(-18, -6, 4, 3.5, '#e8c5d8'); house(19, -5, 4, 3, '#d8e9c4');
  for (let i = 0; i < 7; i++) {
    const c = grp(null, -40 + i * 13 + rnd(i) * 6, 18 + rnd(i + 3) * 10, -45 - rnd(i + 5) * 15);
    for (let k = 0; k < 4; k++) sph(2 + rnd(i * 4 + k) * 1.5, M('#ffffff', { roughness: 1 }), k * 2.2 - 3, rnd(k + i) * 1.2, 0, c);
    c.userData = { speed: 0.4 + rnd(i + 9) * 0.5, x0: c.position.x }; CLOUDS.push(c);
  }
}
function buildFloor(i) {
  const y0 = i * FH, y1 = y0 + FH;
  const fg = grp(null);
  const W1 = M(COL.wall), W2 = M(COL.wall2);
  boxC(-BX - 0.1, y0 - 0.08, -BZ, SXL, y0 + 0.08, BZ, M(COL.slab), fg);
  boxC(SXR + 0.01, y0 - 0.08, -BZ, BX + 0.1, y0 + 0.08, BZ, M(COL.slab), fg);
  boxC(-BX - 0.1, y0 - 0.07, BZ, SXL, y0 + 0.07, BZ + 0.04, M('#e9a23b'), fg);
  boxC(SXR + 0.01, y0 - 0.07, BZ, BX + 0.1, y0 + 0.07, BZ + 0.04, M('#e9a23b'), fg);
  boxC(-BX - 0.1, y0 + 0.08, -BZ, -BX, y1 - 0.08, BZ, W1, fg);
  boxC(BX, y0 + 0.08, -BZ, BX + 0.1, y1 - 0.08, BZ, W1, fg);
  boxC(-BX, y0 + 0.08, -BZ - 0.1, SXL, y1 - 0.08, -BZ, W1, fg);
  boxC(SXR, y0 + 0.08, -BZ - 0.1, BX, y1 - 0.08, -BZ, W1, fg);
  boxC(-BX, y0 + 0.08, -BZ, SXL, y0 + 0.55, -BZ + 0.03, W2, fg);
  boxC(SXR, y0 + 0.08, -BZ, BX, y0 + 0.55, -BZ + 0.03, W2, fg);
  boxC(2.3, y0 + 0.9, -BZ + 0.01, 3.6, y0 + 1.9, -BZ + 0.04, M('#9fd7ff', { emissive: '#4d8fc4', emissiveIntensity: 0.25, roughness: 0.2 }), fg);
  boxC(SXL, y0, -BZ - 0.1, SXR, y1, -SZ - 0.15, M(COL.core), fg);
  boxC(SXL, y0, -SZ - 0.15, SXR, y1, -SZ, M(COL.shaft), fg);
  boxC(SXR, y0, -SZ, SXR + 0.2, y1, SZ, M(COL.shaft), fg);
  const DW = 0.55, DH = 2.0;
  boxC(DOORX - 0.1, y0, -SZ, DOORX + 0.1, y1, -DW, M(COL.shaft), fg);
  boxC(DOORX - 0.1, y0, DW, DOORX + 0.1, y1, SZ, M(COL.shaft), fg);
  boxC(DOORX - 0.1, y0 + DH, -DW, DOORX + 0.1, y1, DW, M(COL.shaft), fg);
  const trim = M('#9aa3b1', { metalness: 0.4, roughness: 0.35 });
  boxC(DOORX - 0.13, y0, -DW - 0.08, DOORX - 0.1, y0 + DH + 0.08, -DW, trim, fg);
  boxC(DOORX - 0.13, y0, DW, DOORX - 0.1, y0 + DH + 0.08, DW + 0.08, trim, fg);
  boxC(DOORX - 0.13, y0 + DH, -DW, DOORX - 0.1, y0 + DH + 0.08, DW, trim, fg);
  const pm = M('#d9dee6', { metalness: 0.55, roughness: 0.28 });
  const pa = boxC(DOORX - 0.03, y0 + 0.02, -DW, DOORX + 0.03, y0 + DH, 0, pm, fg);
  const pb = boxC(DOORX - 0.03, y0 + 0.02, 0, DOORX + 0.03, y0 + DH, DW, pm, fg);
  boxC(DOORX - 0.16, y0 + DH + 0.14, -0.22, DOORX - 0.12, y0 + DH + 0.36, 0.22, M('#151820'), fg);
  const indFace = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.2), new THREE.MeshBasicMaterial({ map: textTex(String(i === 0 ? 'T' : i), { w: 256, h: 128, font: '700 100px F', col: '#ff4d3d', bg: '#151820' }) }));
  indFace.rotation.y = -Math.PI / 2; indFace.position.set(DOORX - 0.175, y0 + DH + 0.25, 0); fg.add(indFace);
  boxC(DOORX - 0.14, y0 + 0.95, -0.95, DOORX - 0.1, y0 + 1.3, -0.78, M('#c3cad4', { metalness: 0.5 }), fg);
  const btn = sph(0.035, M('#dfe4ea', { emissive: '#ffcf3a', emissiveIntensity: 0 }).clone(), DOORX - 0.15, y0 + 1.12, -0.865, fg);
  LANDING.push({ pa, pb, indFace, btn, y0 });
  for (const [lx, lz] of [[-3.0, 0], [2.9, 0]]) {
    const lm = sph(0.18, new THREE.MeshStandardMaterial({ color: '#fff6d0', emissive: '#ffe08a', emissiveIntensity: 1.2 }), lx, y1 - 0.3, lz, fg);
    box(0.02, 0.2, 0.02, M('#666'), lx, y1 - 0.14, lz, fg);
    LAMPS.push(lm);
  }
  const pot = mesh(new THREE.CylinderGeometry(0.18, 0.13, 0.35, 16), M('#c0703c')); pot.position.set(-3.7, y0 + 0.25, -1.8); fg.add(pot);
  for (let k = 0; k < 4; k++) { const lf = sph(1, M('#3f9a4a'), -3.7 + (k - 1.5) * 0.1, y0 + 0.62 + (k % 2) * 0.12, -1.8, fg); lf.scale.set(0.12, 0.32, 0.12); lf.rotation.z = (k - 1.5) * 0.4; }
  const sofaC = ['#e76f51', '#2a9d8f', '#8e5bd1', '#f4a261', '#4d7cfe'][i];
  boxC(2.0, y0 + 0.08, -2.19, 3.8, y0 + 0.55, -1.6, M(sofaC), fg);
  boxC(2.0, y0 + 0.55, -2.4, 3.8, y0 + 1.0, -2.2, M(sofaC), fg);
  const num = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: textTex(i === 0 ? 'TÉRREO' : `${i}º ANDAR`, { w: 512, h: 256, font: '700 120px F', col: '#a3896a' }), transparent: true }));
  num.position.set(-3.0, y0 + 1.75, -BZ + 0.04); fg.add(num);
  FLOORS.push(fg);
  asm(fg, 0.15 + i * 0.28, 0.75, { dy: 9, ry: 0.9 * (i % 2 ? 1 : -1), s: 0.7 });
}
function buildMachineRoom() {
  const g = grp(null);
  boxC(-BX - 0.2, ROOF - 0.1, -BZ - 0.1, SXL, ROOF + 0.1, BZ + 0.1, M(COL.slab), g);
  boxC(SXR + 0.01, ROOF - 0.1, -BZ - 0.1, BX + 0.2, ROOF + 0.1, BZ + 0.1, M(COL.slab), g);
  boxC(SXL, ROOF - 0.1, -BZ - 0.1, SXR + 0.01, ROOF + 0.1, -SZ - 0.01, M(COL.slab), g);
  boxC(SXL, ROOF - 0.1, SZ, SXR, ROOF + 0.1, BZ + 0.1, M(COL.slab), g);
  for (const z of [-0.75, 0.75]) boxC(SXL, ROOF - 0.05, z - 0.1, SXR, ROOF + 0.12, z + 0.1, M('#d64545'), g);
  boxC(-2.4, ROOF + 0.1, -2.0, 3.4, 14.3, -1.9, M(COL.mr), g);
  boxC(-2.5, ROOF + 0.1, -2.0, -2.4, 14.3, 1.6, M(COL.mr), g);
  boxC(3.4, ROOF + 0.1, -2.0, 3.5, 14.3, 1.6, M(COL.mr), g);
  boxC(-2.6, 14.3, -2.1, 3.6, 14.45, 1.7, M(COL.slab), g);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.3), new THREE.MeshBasicMaterial({ map: textTex('CASA DE MÁQUINAS', { w: 1024, h: 128, font: '700 80px F', col: '#8d7a62' }), transparent: true }));
  sign.position.set(-0.9, 14.0, -1.86); g.add(sign);
  const rl = M('#8a8f96', { metalness: 0.5 });
  for (const [a, b] of [[-BX, -2.6], [3.6, BX]]) {
    boxC(a, ROOF + 0.9, BZ - 0.05, b, ROOF + 0.96, BZ + 0.05, rl, g);
    for (let x = a; x <= b + 0.01; x += 0.4) boxC(x - 0.02, ROOF, BZ - 0.02, x + 0.02, ROOF + 0.9, BZ + 0.02, rl, g);
  }
  asm(g, 0.15 + NF * 0.28, 0.8, { dy: 8, ry: -0.8, s: 0.6 });
}

// ================================================================ peças do elevador
function personMesh(shirt, hair, scale = 1) {
  const p = new THREE.Group();
  const skin = M('#f2c29b');
  const legL = grp(p, -0.09, 0.75, 0), legR = grp(p, 0.09, 0.75, 0);
  for (const l of [legL, legR]) { const m = mesh(new THREE.CapsuleGeometry(0.075, 0.55, 4, 10), M('#33415c')); m.position.y = -0.36; l.add(m); }
  const body = mesh(new THREE.CapsuleGeometry(0.2, 0.42, 6, 16), M(shirt)); body.position.y = 1.08; p.add(body);
  const head = grp(p, 0, 1.62, 0);
  sph(0.19, skin, 0, 0, 0, head);
  const hr = sph(1, M(hair), 0, 0.04, -0.03, head); hr.scale.set(0.2, 0.19, 0.2);
  const eyeM = M('#1d1d1d');
  const eL = sph(0.03, eyeM, -0.07, 0.01, 0.17, head), eR = sph(0.03, eyeM, 0.07, 0.01, 0.17, head);
  const mouth = sph(1, M('#5a1e1e'), 0, -0.08, 0.17, head); mouth.scale.set(0.05, 0.02, 0.02);
  const armL = grp(p, -0.27, 1.32, 0), armR = grp(p, 0.27, 1.32, 0);
  for (const a of [armL, armR]) {
    const m = mesh(new THREE.CapsuleGeometry(0.065, 0.42, 4, 10), M(shirt)); m.position.y = -0.27; a.add(m);
    sph(0.075, skin, 0, -0.55, 0, a);
  }
  p.scale.setScalar(scale);
  p.userData = { legL, legR, armL, armR, head, body, mouth, eL, eR };
  return p;
}
function buildCabin() {
  const cab = grp(null); R.cab = cab;
  const inner = grp(cab); R.cabInner = inner;
  const blue = M(COL.cab, { metalness: 0.35, roughness: 0.4 }), wood = M(COL.wood), dk = M(COL.dsteel, { metalness: 0.4 });
  const hw = CABW / 2, hd = CABD / 2;
  boxC(-hw, 0, -hd, hw, 0.12, hd, dk, inner);
  boxC(-hw, CABH - 0.1, -hd, hw, CABH, hd, blue, inner);
  boxC(-hw + 0.07, 0.12, -hd, hw - 0.07, CABH - 0.1, -hd + 0.07, blue, inner);
  boxC(-hw + 0.07, 0.12, -hd + 0.07, hw - 0.1, CABH - 0.1, -hd + 0.1, wood, inner);
  boxC(hw - 0.07, 0.12, -hd, hw, CABH - 0.1, hd, blue, inner);
  boxC(hw - 0.1, 0.12, -hd + 0.07, hw - 0.07, CABH - 0.1, hd - 0.02, wood, inner);
  boxC(-hw, 0.12, -hd, -hw + 0.07, CABH - 0.1, -0.55, blue, inner);
  boxC(-hw, 0.12, 0.55, -hw + 0.07, CABH - 0.1, hd, blue, inner);
  boxC(-hw, 1.92, -0.55, -hw + 0.07, CABH - 0.1, 0.55, blue, inner);
  const cpm = M('#c9d0da', { metalness: 0.6, roughness: 0.3 });
  R.cdA = boxC(-hw - 0.05, 0.12, -0.55, -hw - 0.01, 1.92, 0, cpm, inner);
  R.cdB = boxC(-hw - 0.05, 0.12, 0, -hw - 0.01, 1.92, 0.55, cpm, inner);
  R.cabLamp = boxC(-0.5, CABH - 0.13, -0.4, 0.5, CABH - 0.1, 0.4, new THREE.MeshStandardMaterial({ color: '#fffbe8', emissive: '#fff1c4', emissiveIntensity: 1.4 }), inner);
  boxC(-hw + 0.15, 1.0, -hd + 0.12, hw - 0.15, 1.04, -hd + 0.16, M('#b08b5a', { metalness: 0.5 }), inner);
  boxC(-hw, CABH, -0.12, hw, CABH + 0.16, 0.12, dk, inner);
  boxC(-0.06, CABH + 0.16, -0.06, 0.06, CABH + 0.28, 0.06, dk, inner);
  R.people = [personMesh('#e76f51', '#3b2a20', 0.72), personMesh('#2a9d8f', '#d9a441', 0.72), personMesh('#8e5bd1', '#1f1f1f', 0.72)];
  R.people.forEach((p, i) => { p.position.set(-0.5 + i * 0.45, 0.12, 0.1 + (i % 2) * 0.25); p.rotation.y = (i - 1) * 0.25; inner.add(p); });
  R.mirror = boxC(-0.75, 0.6, -hd + 0.1, -0.05, 1.7, -hd + 0.13, M('#cfeaf7', { metalness: 0.9, roughness: 0.05 }), inner);
  asm(R.mirror, () => C.acc[2], 0.5, { dy: 0, dz: 1.5, ry: 1.5, s: 0.2 });
  R.panel = grp(inner, hw - 0.11, 1.15, 0.5);
  box(0.03, 0.55, 0.2, M('#c8ced8', { metalness: 0.6 }), 0, 0, 0, R.panel);
  R.btns = [];
  for (let k = 0; k < 5; k++) R.btns.push(sph(0.03, new THREE.MeshStandardMaterial({ color: '#5d6675', emissive: '#ffd84a', emissiveIntensity: 0 }), -0.025, -0.2 + k * 0.1, 0, R.panel));
  asm(R.panel, () => C.acc[1], 0.5, { dy: 0, dx: -1.2, ry: 3, s: 0.2 });
  R.shoes = grp(inner);
  for (const y of [0.2, 1.8]) { boxC(-hw - 0.12, y - 0.1, -0.1, -hw, y + 0.1, 0.1, M(COL.orange), R.shoes); boxC(hw, y - 0.1, -0.1, hw + 0.12, y + 0.1, 0.1, M(COL.orange), R.shoes); }
  R.jaws = grp(inner);
  R.jawL = boxC(-hw - 0.14, -0.2, -0.12, -hw - 0.02, 0.05, 0.12, M(COL.red), R.jaws);
  R.jawR = boxC(hw + 0.02, -0.2, -0.12, hw + 0.14, 0.05, 0.12, M(COL.red), R.jaws);
  R.lever = box(0.5, 0.05, 0.05, M(COL.red), -hw - 0.13, CABH - 0.25, -hd - 0.1, R.jaws);
  boxC(-hw - 0.11, 0.05, -0.02, -hw - 0.07, CABH - 0.25, 0.02, M(COL.red), R.jaws);
  asm(cab, () => C.cab0, 0.7, { dy: 7, ry: 2.2, s: 0.4 });
}
function buildDrumPhase() {
  const g = grp(null); R.drumG = g;
  R.drum = grp(g, DRUM.x, DRUM.y, 0);
  cylZ(DRUM.r, 0.5, M(COL.rope), 0, 0, 0, R.drum);
  cylZ(DRUM.r + 0.08, 0.04, M(COL.dsteel), 0, 0, 0.25, R.drum); cylZ(DRUM.r + 0.08, 0.04, M(COL.dsteel), 0, 0, -0.25, R.drum);
  for (let k = 0; k < 4; k++) box(0.05, DRUM.r * 1.9 - 0.02 * k, 0.02, M('#5a3d22'), 0, 0, 0.262 + 0.006 * k, R.drum).rotation.z = k * Math.PI / 4;
  boxC(DRUM.x - 0.1, ROOF + 0.1, -0.08, DRUM.x + 0.1, DRUM.y, 0.08, M('#7d858f'), g);
  R.m0 = grp(g, 0.95, 13.2, 0);
  R.m0body = box(0.9, 0.62, 0.6, new THREE.MeshStandardMaterial({ color: COL.motor, metalness: 0.3, roughness: 0.45 }), 0, 0, 0, R.m0);
  for (let k = 0; k < 6; k++) box(0.04, 0.66, 0.64, M('#2f6d4b'), -0.35 + k * 0.14, 0, 0, R.m0);
  const sh = mesh(GEO.cyl, M(COL.steel)); sh.scale.set(0.05, 0.9, 0.05); sh.rotation.z = Math.PI / 2; sh.position.set(-0.55, 0.05, 0); R.m0.add(sh);
  asm(g, () => C.mot0, 0.7, { dy: 5, dx: 3, rz: -1.5, s: 0.3 });
}
function buildPulley() {
  const g = grp(null); R.pulG = g;
  const stand = grp(g); boxC(PUL.x - 0.15, ROOF + 0.12, -0.3, PUL.x + 0.15, PUL.y, 0.3, M('#7d858f'), stand);
  asm(stand, () => C.pul0, 0.5, { dy: -3, s: 0.2 });
  const wh = grp(g, PUL.x, PUL.y, 0);
  R.wheel = grp(wh);
  const rim = mesh(new THREE.TorusGeometry(PUL.r, 0.07, 14, 48), M(COL.yellow, { metalness: 0.3, roughness: 0.35 })); R.wheel.add(rim);
  for (const z of [-0.2, 0.2]) { const r2 = mesh(new THREE.TorusGeometry(PUL.r + 0.04, 0.035, 10, 48), M(COL.dsteel)); r2.position.z = z; R.wheel.add(r2); }
  for (let k = 0; k < 6; k++) { const sp = box(0.09, PUL.r * 2 - 0.02 * k, 0.06 + 0.006 * k, M(COL.yellow, { metalness: 0.3 }), 0, 0, 0, R.wheel); sp.rotation.z = k * Math.PI / 6; }
  cylZ(0.14, 0.5, M(COL.steel, { metalness: 0.7, roughness: 0.25 }), 0, 0, 0, R.wheel);
  asm(wh, () => C.pul0 + 0.25, 0.7, { dy: 4, rz: 6, ry: 1.5, s: 0.1 });
  R.motor = grp(g, MOT.x, MOT.y, 0);
  box(1.0, 0.65, 0.6, M(COL.motor, { metalness: 0.3, roughness: 0.45 }), 0, 0, 0, R.motor);
  for (let k = 0; k < 7; k++) box(0.04, 0.69, 0.64, M('#2f6d4b'), -0.42 + k * 0.14, 0, 0, R.motor);
  R.led = sph(0.05, new THREE.MeshStandardMaterial({ color: '#7dff9a', emissive: '#3dff6a', emissiveIntensity: 1.5 }), 0.35, 0.36, 0.2, R.motor);
  const sh = mesh(GEO.cyl, M(COL.steel, { metalness: 0.7 })); sh.scale.set(0.06, MOT.x - PUL.x - 0.5, 0.06); sh.rotation.z = Math.PI / 2; sh.position.set(-(MOT.x - PUL.x) / 2, 0.15, 0); R.motor.add(sh);
  asm(R.motor, () => C.pul0 + 0.5, 0.6, { dy: 0, dx: 4, ry: -2, s: 0.3 });
}
function buildBrake() {
  const g = grp(null, BRK.x, BRK.y, 0); R.brk = g;
  const drumWrap = grp(g); R.brkDrum = grp(drumWrap);
  cylZ(BRK.r, 0.3, M('#d4dae2', { metalness: 0.7, roughness: 0.25 }), 0, 0, 0, R.brkDrum);
  box(0.06, BRK.r * 1.8, 0.02, M(COL.dsteel), 0, 0, 0.16, R.brkDrum);
  const sh = mesh(GEO.cyl, M(COL.steel, { metalness: 0.7 })); sh.scale.set(0.05, 0.6, 0.05); sh.rotation.z = Math.PI / 2; sh.position.x = -0.35; drumWrap.add(sh);
  asm(drumWrap, () => C.brk0, 0.5, { dy: 0, dx: 2, rz: 4, s: 0.2 });
  R.shoeL = grp(g); R.shoeR = grp(g);
  for (const [sg, s] of [[R.shoeL, -1], [R.shoeR, 1]]) {
    const inner = grp(sg);
    box(0.1, 0.5, 0.34, M(COL.red), s * (BRK.r + 0.06), 0, 0, inner);
    box(0.04, 0.42, 0.3, M('#5a4a3a'), s * (BRK.r + 0.005), 0, 0, inner);
    box(0.05, 0.4, 0.05, M('#8a929c', { metalness: 0.6 }), s * (BRK.r + 0.08), 0.42, 0, inner);
    asm(inner, () => C.brk0 + (s < 0 ? 0.3 : 0.45), 0.5, { dy: 0, dx: s * 2, rz: -s * 2, s: 0.3 });
  }
  R.springs = grp(g);
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) { const tr = mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 16), M('#3a3f48', { metalness: 0.7 })); tr.rotation.x = Math.PI / 2; tr.position.set(s * (BRK.r + 0.08), 0.6 + k * 0.04, 0); R.springs.add(tr); }
  box(0.8, 0.06, 0.2, M('#5f6672'), 0, 0.88, 0, R.springs);
  asm(R.springs, () => C.brk0 + 0.6, 0.5, { dy: 2, s: 0.3 });
  R.magnet = grp(g, 0, 1.05, 0);
  box(0.42, 0.24, 0.3, M('#394150'), 0, 0, 0, R.magnet);
  for (let k = 0; k < 4; k++) { const tr = mesh(new THREE.TorusGeometry(0.11, 0.018, 6, 20), M('#d98b2b', { metalness: 0.8, roughness: 0.3 })); tr.rotation.y = Math.PI / 2; tr.position.x = -0.12 + k * 0.08; R.magnet.add(tr); }
  asm(R.magnet, () => C.brk0 + 0.8, 0.5, { dy: 2.5, ry: 3, s: 0.2 });
}
function buildCounterweight() {
  const g = grp(null); R.cw = g;
  const fr = grp(g);
  const dk = M(COL.dsteel, { metalness: 0.4 });
  boxC(-CWW / 2 - 0.06, 0, -CWD / 2, -CWW / 2, CWH, CWD / 2, dk, fr); boxC(CWW / 2, 0, -CWD / 2, CWW / 2 + 0.06, CWH, CWD / 2, dk, fr);
  boxC(-CWW / 2, CWH - 0.08, -CWD / 2 + 0.01, CWW / 2, CWH, CWD / 2 - 0.01, dk, fr); boxC(-CWW / 2, 0, -CWD / 2 + 0.01, CWW / 2, 0.08, CWD / 2 - 0.01, dk, fr);
  boxC(-0.04, CWH, -0.04, 0.04, CWH + 0.18, 0.04, dk, fr);
  asm(fr, () => C.cw0, 0.5, { dy: 5, ry: 2, s: 0.3 });
  for (let i = 0; i < 6; i++) {
    const pl = boxC(-CWW / 2 + 0.01, 0.1 + i * 0.25, -CWD / 2 + 0.03, CWW / 2 - 0.01, 0.32 + i * 0.25, CWD / 2 - 0.03, M(COL.plate, { metalness: 0.6, roughness: 0.35 }), g);
    asm(pl, () => C.cwp0 + i * 0.22, 0.4, { dy: 4, ry: 3 });
  }
  R.cwShoes = grp(g);
  for (const y of [0.15, CWH - 0.15]) { boxC(-CWW / 2 - 0.16, y - 0.08, -0.08, -CWW / 2 - 0.06, y + 0.08, 0.08, M(COL.orange), R.cwShoes); boxC(CWW / 2 + 0.06, y - 0.08, -0.08, CWW / 2 + 0.16, y + 0.08, 0.08, M(COL.orange), R.cwShoes); }
}
function buildRails() {
  const n = 7, seg = (ROOF - PIT) / n;
  const rm = M(COL.steel, { metalness: 0.75, roughness: 0.25 });
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < 4; j++) {
      const x = RAILS[j], y0 = PIT + k * seg;
      const g = grp(null);
      boxC(x - 0.04, y0, -0.06, x + 0.04, y0 + seg, 0.06, rm, g);
      boxC(x - 0.06, y0 + 0.003, -0.015, x + 0.06, y0 + seg - 0.003, 0.015, rm, g);
      if (j === 0) boxC(SXL + 0.1, y0 + 0.4, -0.05, x, y0 + 0.5, 0.05, M('#6f7887'), g);
      if (j === 3) boxC(x, y0 + 0.4, -0.05, SXR, y0 + 0.5, 0.05, M('#6f7887'), g);
      const q0 = k / n;
      asm(g, () => C.rl0 + q0 * 1.1, 0.5, { dy: 0, dx: j % 2 ? 4 : -4, dz: 3, rz: j % 2 ? -1.5 : 1.5, s: 0.5 });
    }
  }
}
function buildGovernor() {
  const g = grp(null); R.gov = g;
  const stand = boxC(GOV.x - 0.08, ROOF + 0.12, GOV.z - 0.08, GOV.x + 0.08, GOV.y, GOV.z + 0.08, M('#7d858f'), g);
  asm(stand, () => C.gov0, 0.4, { dy: -2, s: 0.2 });
  const wg = grp(g, GOV.x, GOV.y, GOV.z);
  R.govW = grp(wg);
  R.govRim = mesh(new THREE.TorusGeometry(GOV.r, 0.035, 10, 32), new THREE.MeshStandardMaterial({ color: COL.yellow, metalness: 0.3, roughness: 0.5 })); R.govW.add(R.govRim);
  for (let k = 0; k < 3; k++) box(0.03, GOV.r * 2 - 0.01 * k, 0.026 + 0.006 * k, M(COL.dsteel), 0, 0, 0, R.govW).rotation.z = k * Math.PI / 3;
  R.fly = [sph(0.045, M('#333'), 0.08, 0, 0.04, R.govW), sph(0.045, M('#333'), -0.08, 0, 0.04, R.govW)];
  asm(wg, () => C.gov0 + 0.2, 0.6, { dy: 3, rz: 8, s: 0.1 });
  const tg = grp(g, GOV.x, PIT + 0.35, GOV.z);
  R.tens = grp(tg);
  R.tens.add(mesh(new THREE.TorusGeometry(GOV.r, 0.035, 10, 32), M('#59606e')));
  box(0.03, GOV.r * 2, 0.03, M(COL.dsteel), 0, 0, 0, R.tens);
  asm(tg, () => C.gov0 + 0.45, 0.6, { dy: -3, rz: -8, s: 0.1 });
  R.govRope = grp(g);
  const rm = M('#2a2d33');
  for (const s of [-1, 1]) { const c = mesh(GEO.cyl, rm); c.scale.set(0.015, GOV.y - PIT - 0.35, 0.015); c.position.set(GOV.x + s * GOV.r, (GOV.y + PIT + 0.35) / 2, GOV.z); R.govRope.add(c); }
  R.marks = [];
  for (let k = 0; k < 24; k++) R.marks.push(box(0.05, 0.1, 0.05, M('#ffcf3a'), GOV.x - GOV.r, 0, GOV.z, R.govRope));
  asm(R.govRope, () => C.gov0 + 0.7, 0.6, { dy: 0, dx: -3, s: 1 });
}
function buildLatch() {
  const y = DOORF * FH + 2.3;
  const g = grp(null, -1.98, y, 0); R.latch = g;
  const glass = mesh(GEO.box, new THREE.MeshPhysicalMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, depthWrite: false }), false);
  glass.scale.set(0.12, 0.5, 1.15); g.add(glass);
  asm(glass, () => C.lt0, 0.5, { dy: 1.5, ry: 3, s: 0.2 });
  boxC(-0.01, -0.22, -0.55, 0.01, -0.18, 0.55, M('#5d6878'), g);
  const hg = grp(g, 0, 0.02, 0.05);
  R.hook = grp(hg);
  box(0.05, 0.07, 0.6, M(COL.red), 0, 0, 0.05, R.hook); box(0.05, 0.2, 0.06, M(COL.red), 0, -0.1, 0.33, R.hook);
  const roller = cylZ(0.06, 0.05, M(COL.yellow), 0, 0, -0.27, R.hook); roller.rotation.set(0, 0, Math.PI / 2);
  asm(hg, () => C.lt0 + 0.25, 0.5, { dy: 0, dz: -1.2, rx: 3, s: 0.2 });
  const pin = boxC(-0.03, -0.2, 0.3, 0.03, -0.1, 0.45, M(COL.steel, { metalness: 0.6 }), g);
  asm(pin, () => C.lt0 + 0.45, 0.4, { dy: -1, s: 0.2 });
  R.ramp = boxC(-0.03, -0.1, -0.36, 0.03, 0.4, -0.3, M(COL.cab), g);
  R.lockLed = sph(0.05, new THREE.MeshStandardMaterial({ color: '#ff5a4a', emissive: '#ff2a1a', emissiveIntensity: 1.2 }), -0.07, 0.18, 0.45, g);
}
function buildCurtain() {
  const g = grp(null); R.curt = g;
  R.emL = boxC(-1.86, DOORF * FH + 0.1, -0.03, -1.8, DOORF * FH + 1.9, 0.03, M('#1b1f27'), g);
  R.emR = boxC(-1.86, DOORF * FH + 0.1, -0.03, -1.8, DOORF * FH + 1.9, 0.03, M('#1b1f27'), g);
  R.beams = [];
  for (let i = 0; i < 11; i++) {
    const b = mesh(GEO.cyl, new THREE.MeshBasicMaterial({ color: '#ff3b3b', transparent: true, opacity: 0.8 }), false);
    b.rotation.x = Math.PI / 2; b.position.set(-1.83, DOORF * FH + 0.2 + i * 0.165, 0); g.add(b); R.beams.push(b);
  }
}
function buildRopes() {
  const mk = (n, r, mat) => { const pool = []; for (let i = 0; i < n; i++) { const m = mesh(GEO.cyl, mat); m.visible = false; scene.add(m); pool.push(m); } return { pool, r }; };
  R.rope = mk(40, 0.04, M(COL.rope));
  R.cables = [0, 1, 2, 3, 4].map(() => mk(40, 0.02, M(COL.cable, { metalness: 0.8, roughness: 0.3 })));
  R.weightArrow = grp(null);
  const ar = new THREE.MeshStandardMaterial({ color: '#e63946', emissive: '#e63946', emissiveIntensity: 0.3 });
  const sh = mesh(GEO.cyl, ar); sh.scale.set(0.12, 0.6, 0.12); sh.position.y = 0.3; R.weightArrow.add(sh);
  const cone = mesh(new THREE.ConeGeometry(0.28, 0.4, 20), ar); cone.rotation.x = Math.PI; cone.position.y = -0.2; R.weightArrow.add(cone);
}
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
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
    m.visible = true; m.scale.set(rope.r, l + rope.r * 0.5, rope.r);
    m.position.copy(a).add(_v).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(_up, _d);
  }
  for (; k < rope.pool.length; k++) rope.pool[k].visible = false;
}
function ropePts(t, off, z) {
  const sw = cabSwing(t);
  const cx = CABX + sw.dx, cy = cabBottom(t) + CABH + 0.28;
  const r = PUL.r + off;
  const pts = [new THREE.Vector3(cx, cy, z), new THREE.Vector3(PUL.x - r, PUL.y, z)];
  for (let k = 1; k <= 14; k++) { const a = Math.PI - (k / 14) * Math.PI; pts.push(new THREE.Vector3(PUL.x + Math.cos(a) * r, PUL.y + Math.sin(a) * r, z)); }
  pts.push(new THREE.Vector3(PUL.x + r, cwBottomAt(t) + CWH + 0.18, z));
  return pts;
}
function buildVisitor() { R.visitor = personMesh('#e76f51', '#3b2a20', 1.0); scene.add(R.visitor); }
function buildParticles() {
  R.smoke = []; for (let i = 0; i < 18; i++) { const m = mesh(GEO.sph, new THREE.MeshStandardMaterial({ color: '#4a4a50', transparent: true, opacity: 0.6, roughness: 1, depthWrite: false }), false); m.visible = false; scene.add(m); R.smoke.push(m); }
  R.sparks = []; for (let i = 0; i < 70; i++) { const m = mesh(GEO.sph, new THREE.MeshBasicMaterial({ color: '#ffd23f' }), false); m.visible = false; scene.add(m); R.sparks.push(m); }
  R.dust = []; for (let i = 0; i < 40; i++) { const m = mesh(GEO.sph, new THREE.MeshStandardMaterial({ color: '#b39a7a', transparent: true, opacity: 0.7, depthWrite: false }), false); m.visible = false; scene.add(m); R.dust.push(m); }
}

// ================================================================ mestre de obras 3D (cena separada, canto inferior esquerdo)
const HV = { w: 380, h: 340 };
const hostScene = new THREE.Scene();
hostScene.environment = scene.environment; hostScene.environmentIntensity = 0.4;
if (!ENV) hostScene.add(new THREE.AmbientLight('#ffffff', 0.5));
const hostCam = new THREE.PerspectiveCamera(30, HV.w / HV.h, 0.1, 50);
hostCam.position.set(0, 1.25, 5.4); hostCam.lookAt(0, 1.05, 0);
hostScene.add(new THREE.HemisphereLight('#ffffff', '#8a7a6a', 1.6));
const hk = new THREE.DirectionalLight('#fff3e0', 2.6); hk.position.set(2, 4, 5); hostScene.add(hk);
const hrim = new THREE.DirectionalLight('#9fd0ff', 2.0); hrim.position.set(-3, 2, -3); hostScene.add(hrim);
const HOST = {};
function buildHost() {
  const add = (m, p) => { p.add(m); return m; };
  const root = new THREE.Group(); hostScene.add(root); HOST.root = root;
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
function updateHost(t) {
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

// ================================================================ atualização do mundo
function updateWorld(t) {
  applyAsm(t);
  const dk = dark(t);
  hemi.intensity = lerp(ENV ? 1.35 : 1.75, 0.25, dk); sun.intensity = lerp(3.0, 0.15, dk); fill.intensity = lerp(ENV ? 0.9 : 1.3, 0.2, dk);
  scene.environmentIntensity = lerp(0.35, 0.05, dk);
  for (const l of LAMPS) l.material.emissiveIntensity = lerp(1.2, 0, dk);
  for (const c of CLOUDS) c.position.x = -45 + ((c.userData.x0 + 45 + t * c.userData.speed) % 95);

  const sw = cabSwing(t);
  const yb = cabBottom(t);
  const land = (t >= C.land && t < C.land + 0.3) ? Math.sin(P(t, C.land, 0.3) * Math.PI) : 0;
  if (t >= C.cab0 + 0.7) R.cab.position.set(CABX + sw.dx, yb, 0);
  else if (t >= C.cab0) { R.cab.position.x += CABX; R.cab.position.y += yb; }
  R.cabInner.rotation.set(0, sw.spin, sw.rot);
  R.cabInner.scale.set(1 + 0.08 * land, 1 - 0.12 * land, 1 + 0.08 * land);
  R.cabLamp.material.emissiveIntensity = lerp(1.4, 0.1, dk);
  cabLight.position.set(CABX + sw.dx, yb + CABH - 0.4, 0.3);
  cabLight.color.set(dk > 0.5 ? '#ff5a3c' : '#fff1cf'); cabLight.intensity = t >= C.cab0 ? lerp(6, 2, dk) : 0;
  const sc = scare(t);
  R.people.forEach((p, i) => {
    const u = p.userData;
    p.position.y = 0.12 + sc * (0.15 + 0.08 * Math.sin(t * 18 + i));
    u.armL.rotation.z = lerp(-0.15, -2.6, sc) + (sc ? 0.2 * Math.sin(t * 20 + i) : 0);
    u.armR.rotation.z = lerp(0.15, 2.6, sc) - (sc ? 0.2 * Math.sin(t * 22 + i) : 0);
    u.mouth.scale.set(0.05, lerp(0.02, 0.06, sc), 0.02);
    u.head.rotation.z = (t > C.ride1 && t < C.ride1 + 3) ? 0.15 * Math.sin(t * 8 + i) : 0;
  });
  R.shoes.visible = t > C.rl0 + 1.4;
  R.jaws.visible = t > C.gov0 + 0.9;
  const eng = (t >= C.jaw && t < C.reset) ? EZ.o(P(t, C.jaw, 0.2)) : 0;
  R.jawL.position.y = -0.075 + 0.16 * eng; R.jawR.position.y = -0.075 + 0.16 * eng;
  const lev = (t >= C.lock && t < C.reset) ? cl((cabBottomAtLock() - cabBottom(t)) / 0.6) : 0;
  R.lever.rotation.z = 0.6 * lev;
  R.btns.forEach((b, k) => (b.material.emissiveIntensity = (k === 4 && t >= C.press && t < C.ride1 + 0.3) ? 2 : 0));
  const o = doorOpenAt(t);
  const co = Math.abs(cabF(t) - DOORF) < 0.02 ? o : 0;
  R.cdA.position.z = -0.275 - 0.5 * co; R.cdB.position.z = 0.275 + 0.5 * co;

  R.cw.position.set(CWX, cwBottomAt(t), 0);
  R.cwShoes.visible = t > C.rl0 + 1.4;

  // fase do tambor
  const outP = P(t, C.c1x, 0.6);
  if (t >= C.mot0 + 0.7) { R.drumG.position.set(-4 * EZ.i2(outP), 5 * EZ.i2(outP), 2 * outP); R.drumG.rotation.set(0, 0, 1.5 * outP); }
  R.drumG.visible = t >= C.mot0 && outP < 1;
  R.drum.rotation.z = cabBottom(t) / DRUM.r;
  const strain = t > C.lift0 && t < C.burn ? P(t, C.lift0, C.burn - C.lift0) : 0;
  const burned = t >= C.burn;
  R.m0body.material.color.set(burned ? '#3a2e2e' : new THREE.Color(COL.motor).lerp(new THREE.Color('#ff3b1f'), strain));
  R.m0body.material.emissive.set('#ff2200'); R.m0body.material.emissiveIntensity = burned ? 0 : strain * 0.6;
  R.m0.position.x = 0.95 + strain * 0.03 * Math.sin(t * 70);
  // polia
  R.wheel.rotation.z = -(cabF(t) * FH) / PUL.r;
  R.led.material.color.set(dk > 0.5 ? '#ff5a4a' : '#7dff9a'); R.led.material.emissive.set(dk > 0.5 ? '#ff2a1a' : '#3dff6a');
  // freio
  const closed = t < C.brkE ? 1 : Math.max(1 - EZ.o(P(t, C.brkE, 0.3)), (t >= C.off2 && t < C.on2 + 0.2) ? EZ.o(P(t, C.off2 + 0.02, 0.08)) : 0);
  const gap = 0.12 * (1 - closed);
  R.shoeL.position.x = -gap; R.shoeR.position.x = gap;
  R.brkDrum.rotation.z = -(cabF(t) * FH) / BRK.r;
  // limitador
  const lockB = t >= C.lock && t < C.reset;
  const disp = lockB ? cabBottomAtLock() : cabBottom(t);
  R.govW.rotation.z = disp / GOV.r;
  R.tens.rotation.z = disp / GOV.r;
  R.govRim.material.color.set(lockB ? '#ff3b3b' : COL.yellow); R.govRim.material.emissive.set(lockB ? '#ff2020' : '#000000');
  const vel = Math.abs(cabBottom(t + 0.02) - cabBottom(t)) / 0.02;
  const fo = cl(vel / 6) * 0.07;
  R.fly[0].position.x = 0.08 + fo; R.fly[1].position.x = -0.08 - fo;
  const span = GOV.y - PIT - 0.35;
  R.marks.forEach((m, k) => {
    const yy = ((k * span / 12 + disp) % (span * 2) + span * 2) % (span * 2); const left = yy < span;
    m.position.set(GOV.x + (left ? -GOV.r : GOV.r), left ? PIT + 0.35 + yy : GOV.y - (yy - span), GOV.z);
  });
  // portas dos andares
  LANDING.forEach((L, i) => {
    const oo = i === DOORF ? o : 0;
    L.pa.position.z = -0.275 - 0.55 * oo; L.pb.position.z = 0.275 + 0.55 * oo;
    L.btn.material.emissiveIntensity = (i === DOORF && t > C.po0 - 0.6 && t < C.unlock) ? 2 : 0;
  });
  // trava
  R.latch.visible = t >= C.lt0 && t < E('p3') + 0.8;
  const rampY = 0.15 + cl(cabF(t) - 2, 0, 2) * 0.6;
  R.ramp.position.y = rampY; R.ramp.visible = t > C.lt0 + 0.6;
  const unl = cl((0.42 - rampY) / 0.25);
  R.hook.rotation.x = -0.6 * unl;
  R.lockLed.material.color.set(unl > 0.6 ? '#3ad16b' : '#ff5a4a'); R.lockLed.material.emissive.set(unl > 0.6 ? '#20ff60' : '#ff2a1a');
  // cortina de luz
  const bp = P(t, C.bm0, 1.2);
  R.curt.visible = bp > 0 && t < C.doorEnd + 1.2;
  const half = 0.55 * o;
  R.emL.position.z = -half; R.emR.position.z = half;
  const reach = kf(t, C.reachKeys);
  R.beams.forEach((b, i) => {
    const q = st(bp, i, 11, 0.3);
    const yy = DOORF * FH + 0.2 + i * 0.165;
    const broken = reach > 0.85 && Math.abs(yy - (DOORF * FH + 1.3)) < 0.12;
    b.visible = q > 0 && half > 0.02;
    const len = broken ? half * 0.8 : 2 * half * EZ.o(q);
    b.scale.set(broken ? 0.014 : 0.009, Math.max(0.001, len), broken ? 0.014 : 0.009);
    b.position.z = -half + len / 2;
    b.material.color.set(broken ? (Math.sin(t * 40) > 0 ? '#fff04a' : '#ffb000') : '#ff3b3b');
  });
  updateVisitor(t);
  updateRopes(t);
  const wa = t > C.weight && t < S('c1') ? P(t, C.weight, 0.4) * (1 - P(t, S('c1') - 0.3, 0.3)) : 0;
  R.weightArrow.visible = wa > 0.01;
  R.weightArrow.position.set(CABX, yb - 0.7 + 0.12 * Math.sin(t * 6), 0.4);
  R.weightArrow.scale.setScalar(Math.max(0.001, EZ.back(cl(wa))));
  updateParticles(t);
}
function updateRopes(t) {
  const sw = cabSwing(t);
  const cx = CABX + sw.dx, cy = cabBottom(t) + CABH + 0.28;
  if (t < C.c1x + 0.6) {
    const gp = P(t, C.rope0, 0.5);
    if (gp > 0) drawPoly(R.rope, [new THREE.Vector3(CABX, DRUM.y, 0), new THREE.Vector3(cx, lerp(DRUM.y, cy, EZ.o(gp)), 0)]);
    else drawPoly(R.rope, [], 0);
    R.cables.forEach(c => drawPoly(c, [], 0));
    return;
  }
  const cableP = P(t, C.cb0, 1.8);
  if (t < C.cb0 + 0.6 && !detached(t)) {
    if (ropeSnapped(t)) {
      const rec = t - C.snap;
      const endY = cabTopAtSnap() + 0.6 + 0.9 * EZ.o(cl(rec / 0.3)) + 0.12 * Math.sin(rec * 18) * Math.exp(-rec * 4);
      const pts = ropePts(t, 0, 0); pts[0] = new THREE.Vector3(PUL.x - PUL.r, endY, 0);
      drawPoly(R.rope, pts);
    } else {
      const grow = P(t, C.rr0, 1.0);
      drawPoly(R.rope, ropePts(t, 0, 0), t < C.rr0 ? 0.35 : lerp(0.35, 1, EZ.o(grow)));
    }
  } else drawPoly(R.rope, [], 0);
  R.cables.forEach((c, i) => {
    const z = (i - 2) * 0.08;
    const q = st(cableP, i, 5, 0.4);
    if (q <= 0) { drawPoly(c, [], 0); return; }
    if (detached(t)) {
      const pts = [];
      for (let s = 0; s <= 8; s++) pts.push(new THREE.Vector3(cx + Math.sin(s * 1.3 + t * 9 + i) * 0.08, cy + s * 0.18, z));
      drawPoly(c, pts);
      return;
    }
    drawPoly(c, ropePts(t, 0, z), EZ.o(q));
  });
}
function updateVisitor(t) {
  const v = R.visitor, u = v.userData;
  const vis = (t >= C.pw0 && t < C.pout0 + 1.2) || (t >= C.rw0 && t < C.doorEnd + 0.6);
  v.visible = vis;
  if (!vis) return;
  const p = kf(t, C.personKeys), p2 = kf(t - 0.06, C.personKeys);
  const dx = p[0] - p2[0], dz = p[1] - p2[1];
  const moving = Math.hypot(dx, dz) > 0.004;
  const teeter = t >= C.pt0 && t < C.pt1;
  const squish = t >= C.slam && t < C.ro0;
  const reach = kf(t, C.reachKeys);
  v.position.set(p[0], DOORF * FH + 0.08 + (moving ? Math.abs(Math.sin(t * 11)) * 0.05 : 0), p[1]);
  v.rotation.set(0, moving ? Math.atan2(dx, dz) : Math.PI / 2, 0);
  if (teeter) v.rotateX(0.18 + 0.12 * Math.sin((t - C.pt0) * 9));
  v.scale.set(squish ? 0.86 : 1, 1, 1);
  const ph = moving ? Math.sin(t * 11) : 0;
  u.legL.rotation.x = 0.5 * ph; u.legR.rotation.x = -0.5 * ph;
  u.armL.rotation.set(-0.4 * ph, 0, -0.1); u.armR.rotation.set(0.4 * ph, 0, 0.1);
  if (teeter) { const a = (t - C.pt0) * 11; u.armL.rotation.set(a, 0, -0.6); u.armR.rotation.set(-a + 1, 0, 0.6); }
  if (reach > 0) u.armR.rotation.set(lerp(0, -1.55, EZ.io(reach)), 0, 0.05);
  u.mouth.scale.set(0.05, teeter || squish ? 0.06 : 0.02, 0.02);
}
function burstPts(t, t0, origin, n, pool, offset, opt) {
  const a = t - t0; if (a < 0 || a > opt.life) return offset;
  for (let i = 0; i < n && offset < pool.length; i++, offset++) {
    const m = pool[offset];
    const ang = rnd(i + opt.seed) * Math.PI * 2, el = rnd(i + opt.seed + 9) * 1.2 - 0.2, v = opt.spd * (0.4 + rnd(i + opt.seed + 50) * 0.8);
    m.visible = true;
    m.position.set(origin.x + Math.cos(ang) * Math.cos(el) * v * a, origin.y + Math.sin(el) * v * a - opt.g * a * a, origin.z + Math.sin(ang) * Math.cos(el) * v * a);
    m.scale.setScalar(opt.size * (1 - a / opt.life * 0.6));
    if (m.material.transparent) m.material.opacity = 0.7 * (1 - a / opt.life);
  }
  return offset;
}
function updateParticles(t) {
  R.smoke.forEach(m => (m.visible = false));
  if (t >= C.burn && t < C.c1x + 0.3) {
    R.smoke.forEach((m, i) => {
      const life = 1.6 + rnd(i) * 0.8; const a0 = t - C.burn - i * 0.07; if (a0 < 0) return;
      const k = (a0 % life) / life;
      m.visible = true; m.position.set(0.95 + (rnd(i + 3) - 0.5) * 0.5 + k * 0.4, 13.5 + k * 2.2, (rnd(i + 7) - 0.5) * 0.4);
      m.scale.setScalar(0.12 + k * 0.45); m.material.opacity = 0.55 * (1 - k);
    });
  }
  let s = 0;
  R.sparks.forEach(m => (m.visible = false));
  for (const b of C.bangs) s = burstPts(t, b.t, new THREE.Vector3(b.side < 0 ? SXL + 0.1 : 0.75, cabBottom(b.t) + 1.2, 0.3), 10, R.sparks, s, { life: 0.4, spd: 4, g: 4, size: 0.035, seed: b.t * 10 });
  if (t >= C.jaw && t < C.stop + 0.4) {
    const yb = cabBottom(t);
    for (let j = 0; j < 3; j++) {
      s = burstPts(t, C.jaw + j * 0.12, new THREE.Vector3(RAILS[0], yb, 0.1), 8, R.sparks, s, { life: 0.35, spd: 3.5, g: 6, size: 0.03, seed: 100 + j * 20 });
      s = burstPts(t, C.jaw + j * 0.12, new THREE.Vector3(RAILS[1], yb, 0.1), 8, R.sparks, s, { life: 0.35, spd: 3.5, g: 6, size: 0.03, seed: 160 + j * 20 });
    }
  }
  let d = 0;
  R.dust.forEach(m => (m.visible = false));
  d = burstPts(t, C.land, new THREE.Vector3(CABX, 0.1, 0.5), 20, R.dust, d, { life: 1.0, spd: 2.5, g: 1, size: 0.14, seed: 7 });
  d = burstPts(t, C.drift1, new THREE.Vector3(CABX, 0.1, 0.5), 14, R.dust, d, { life: 0.8, spd: 2, g: 1, size: 0.12, seed: 77 });
  burstPts(t, 0.9, new THREE.Vector3(0, 0.2, 2.5), 6, R.dust, d, { life: 0.7, spd: 2, g: 1, size: 0.18, seed: 3 });
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
function drawCaption(t) {
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
  const a = 'COMO CONSTRUIR UM ', b = 'ELEVADOR';
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
  ctx.fillText('PEÇAS INSTALADAS', 418, 1676);
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
  ctx.save(); ctx.translate(250, 1600); ctx.scale(s, s); ctx.rotate(0.05 * Math.sin(t * 5));
  ctx.font = '700 44px F';
  const tw = Math.max(60, ctx.measureText(cur.b).width);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#141824'; ctx.lineWidth = 6;
  rr(-20, -44, tw + 40, 78, 30); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4, 30); ctx.lineTo(-30, 66); ctx.lineTo(36, 30); ctx.fill();
  ctx.fillStyle = '#141824'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(cur.b, 0, -4);
  ctx.restore();
}
function comic(t) {
  for (const b of C.bangs) {
    if (t < b.t || t > b.t + 0.45) continue;
    const [x, y] = project(new THREE.Vector3(b.side < 0 ? SXL : 0.8, cabBottom(b.t) + 1.4, 0.5));
    const k = P(t, b.t, 0.45);
    ctx.save(); ctx.translate(x + b.side * 60, y - 30); ctx.scale(EZ.back(cl(k * 2)), EZ.back(cl(k * 2))); ctx.rotate(b.side * 0.15); ctx.globalAlpha *= 1 - k;
    bigWord('PÁ!', 0, 0, 58, '#ffffff'); ctx.restore();
  }
  if (t >= C.clac && t < C.clac + 1.0) {
    const [x, y] = project(new THREE.Vector3(BRK.x, BRK.y - 0.45, 0.3));
    const k = P(t, C.clac, 0.25);
    ctx.save(); ctx.translate(x, y); ctx.scale(EZ.back(k), EZ.back(k)); ctx.rotate(-0.12); ctx.globalAlpha *= 1 - P(t, C.clac + 0.7, 0.3);
    bigWord('CLAC!', 0, 0, 80, '#ffd23f'); ctx.restore();
  }
  if (t >= C.land && t < C.land + 0.8) {
    const [x, y] = project(new THREE.Vector3(CABX, 1.2, 1));
    const k = P(t, C.land, 0.8);
    ctx.save(); ctx.translate(x, y - 160); ctx.scale(EZ.back(cl(k * 3)), EZ.back(cl(k * 3))); ctx.rotate(-0.1); ctx.globalAlpha *= 1 - P(t, C.land + 0.5, 0.3);
    bigWord('CRASH!', 0, 0, 110, '#ff5a3c'); ctx.restore();
  }
  if (t > C.brkE && t < C.off2 && t > C.brk0 + 1.0) {
    const [x, y] = project(new THREE.Vector3(BRK.x + 0.35, BRK.y + 1.15, 0.2));
    ctx.save(); ctx.translate(x, y); ctx.rotate(0.15 * Math.sin(t * 20)); ctx.scale(1.4, 1.4);
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#141824'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(6, -30); ctx.lineTo(-10, 2); ctx.lineTo(2, 2); ctx.lineTo(-6, 30); ctx.lineTo(14, -6); ctx.lineTo(2, -6); ctx.lineTo(12, -30); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  if (t >= C.pt0 && t < C.pt1) {
    const [x, y] = project(new THREE.Vector3(R.visitor.position.x, DOORF * FH + 2.1, R.visitor.position.z));
    ctx.save(); ctx.translate(x + 40, y - 40); ctx.rotate(0.2 * Math.sin(t * 20)); bigWord('!', 0, 0, 120, '#ff4d3d'); ctx.restore();
  }
  if (t >= C.slam && t < C.ro0) {
    const [x, y] = project(new THREE.Vector3(R.visitor.position.x, DOORF * FH + 1.95, R.visitor.position.z));
    for (let k = 0; k < 4; k++) { const a = t * 5 + k * Math.PI / 2; ctx.save(); ctx.translate(x + Math.cos(a) * 90, y + Math.sin(a) * 22); bigWord('★', 0, 0, 46, '#ffd23f'); ctx.restore(); }
  }
  if (t > C.cross - 0.6 && t < C.cross + 0.9) {
    const k = P(t, C.cross - 0.6, 1.5);
    const [x, y] = project(new THREE.Vector3((CABX + CWX) / 2, cabBottom(t) + 1, 0.5));
    ctx.save(); ctx.globalAlpha *= Math.sin(k * Math.PI);
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 7; ctx.setLineDash([16, 12]); ctx.lineDashOffset = -t * 60;
    ctx.beginPath(); ctx.ellipse(x, y, 150 + 10 * Math.sin(t * 8), 120, 0, 0, 7); ctx.stroke();
    ctx.restore();
  }
  if (t > C.acc[3]) {
    const [x, y] = project(new THREE.Vector3(CABX + 0.6, cabBottom(t) + 1.6, 0.8));
    for (let i = 0; i < 6; i++) {
      const a0 = t - C.acc[3] - i * 0.4; if (a0 < 0) continue;
      const k = (a0 % 2.4) / 2.4;
      ctx.save(); ctx.globalAlpha *= Math.sin(k * Math.PI);
      bigWord(i % 2 ? '♪' : '♫', x + 60 + Math.sin(k * 6 + i) * 40, y - k * 260, 56, ['#ff5ab4', '#7b4bd6', '#2a9d8f'][i % 3]);
      ctx.restore();
    }
  }
}
function overlays(t) {
  for (const [a, b] of [[C.rwS, C.rwE], [C.s1rwS, C.s1rwE]]) {
    if (t < a || t > b) continue;
    const k = Math.sin(P(t, a, b - a) * Math.PI);
    ctx.save(); ctx.globalAlpha = 0.35 * k; ctx.fillStyle = '#9ad0ff';
    for (let y = ((t * 900) % 24); y < H; y += 24) ctx.fillRect(0, y, W, 3);
    ctx.globalAlpha = k; ctx.fillStyle = '#fff';
    for (const dx of [0, 46]) { ctx.beginPath(); ctx.moveTo(110 + dx, 210); ctx.lineTo(70 + dx, 240); ctx.lineTo(110 + dx, 270); ctx.fill(); }
    ctx.font = '700 40px F'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('VOLTANDO...', 180, 242);
    ctx.restore();
  }
  if (t >= C.s1frz && t < C.s1rwS) {
    const s = EZ.back(P(t, C.s1frz, 0.25)) * (1 + 0.05 * Math.sin(t * 6));
    ctx.save(); ctx.translate(800, 620); ctx.scale(s, s); bigWord('?', 0, 0, 260, '#ffd23f'); ctx.restore();
  }
  if (t >= C.d2 && t < C.stop + 0.4) {
    const k = Math.min(P(t, C.d2, 0.3), 1 - P(t, C.stop + 0.1, 0.3));
    ctx.save(); ctx.globalAlpha = k;
    const v = ctx.createRadialGradient(540, 900, 300, 540, 900, 1100);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e63946'; rr(370, 160, 340, 58, 29); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '700 32px F'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('CÂMERA LENTA', 540, 190);
    ctx.restore();
  }
  if (t >= C.otis0 && t < C.otis1) otisCard(t);
  if (t >= C.stamp) {
    const k = P(t, C.stamp, 0.22);
    const sc = lerp(3, 1, EZ.o(k));
    ctx.save(); ctx.translate(540, 760); ctx.rotate(-0.12); ctx.scale(sc, sc); ctx.globalAlpha = cl(k * 2);
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
        const x = 540 + Math.cos(ang) * v * a, y = 760 + Math.sin(ang) * v * a + 900 * a * a;
        if (y > H + 40) continue;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a * 8 + i); ctx.scale(1, Math.cos(a * 10 + i)); ctx.fillStyle = cols[i % cols.length];
        ctx.fillRect(-10, -6, 20, 12); ctx.restore();
      }
    }
  }
  if (t >= C.cta) {
    const k = EZ.back(P(t, C.cta, 0.4));
    ctx.save(); ctx.translate(680, 1150); ctx.scale(k, k); ctx.rotate(0.03 * Math.sin(t * 3));
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#141824'; ctx.lineWidth = 7;
    rr(-330, -100, 660, 200, 40); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-200, 96); ctx.lineTo(-250, 160); ctx.lineTo(-140, 96); ctx.fill();
    ctx.fillStyle = '#141824'; ctx.font = '700 48px F'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('QUAL OBRA EU FAÇO', 0, -30);
    ctx.fillStyle = '#e63946'; ctx.fillText('NO PRÓXIMO VÍDEO?', 0, 34);
    ctx.restore();
  }
}
function otisCard(t) {
  const k = EZ.back(P(t, C.otis0, 0.45)), outp = P(t, C.otis1 - 0.3, 0.3);
  ctx.save(); ctx.translate(790, 560); ctx.rotate(0.07 - 0.3 * (1 - k)); ctx.scale(k, k); ctx.globalAlpha = 1 - outp;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; rr(-205, -215, 430, 470, 10); ctx.fill();
  ctx.fillStyle = '#fbf6ea'; rr(-215, -225, 430, 470, 10); ctx.fill();
  ctx.fillStyle = '#d9c39a'; ctx.fillRect(-190, -200, 380, 330);
  ctx.fillStyle = '#7a5a36'; ctx.fillRect(-130, -200, 14, 330); ctx.fillRect(116, -200, 14, 330);
  ctx.fillStyle = '#6a4a2a'; ctx.fillRect(-120, -20, 240, 16);
  ctx.strokeStyle = '#5a3d22'; ctx.lineWidth = 5; line(0, -200, 0, -130); line(0, -110, 0, -20);
  ctx.strokeStyle = '#b3261e'; ctx.lineWidth = 4; line(-14, -128, 14, -112); line(-14, -112, 14, -128);
  ctx.fillStyle = '#3d2b1c';
  rr(-28, -104, 56, 84, 12); ctx.fill(); circ(0, -122, 18); ctx.fill();
  ctx.fillRect(-14, -168, 28, 34); ctx.fillRect(-24, -138, 48, 7);
  ctx.strokeStyle = '#3d2b1c'; ctx.lineWidth = 9; ctx.lineCap = 'round'; line(24, -90, 60, -130);
  ctx.fillStyle = '#6b5236';
  for (let i = 0; i < 9; i++) { circ(-170 + i * 42, 104 + (i % 2) * 6, 17); ctx.fill(); }
  ctx.fillStyle = '#3d2b1c'; ctx.font = '700 40px F'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Elisha Otis · 1854', 0, 188);
  ctx.restore();
}

// ================================================================ quadro
function setup(tl) {
  TL = tl;
  for (const l of tl.lines) LN[l.id] = l;
  computeCues();
  buildCaptions();
  buildEnvironment();
  for (let i = 0; i < NF; i++) buildFloor(i);
  buildMachineRoom();
  buildCabin(); buildDrumPhase(); buildPulley(); buildBrake(); buildCounterweight(); buildRails();
  buildGovernor(); buildLatch(); buildCurtain(); buildRopes(); buildVisitor(); buildParticles();
  buildHost();
}
const PIX = new Uint8Array(GW * GH * 4), FLIP = new Uint8ClampedArray(GW * GH * 4), IMG = new ImageData(FLIP, GW, GH);
const TMP = document.createElement('canvas'); TMP.width = GW; TMP.height = GH;
const TCTX = TMP.getContext('2d', { willReadFrequently: true });
const PROF = {};
const tick = (k, t0) => { PROF[k] = (PROF[k] || 0) + performance.now() - t0; return performance.now(); };
function draw(t) {
  let t0 = performance.now();
  updateWorld(t);
  updateCamera(t);
  updateHost(t);
  t0 = tick('update', t0);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, GW, GH);
  renderer.autoClear = true;
  renderer.render(scene, camera);
  renderer.getContext().finish();
  t0 = tick('scene', t0);
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.setViewport(0, 0, HV.w * RS, HV.h * RS);
  renderer.setScissor(0, 0, HV.w * RS, HV.h * RS); renderer.setScissorTest(true);
  renderer.render(hostScene, hostCam);
  renderer.setScissorTest(false);
  renderer.getContext().finish();
  t0 = tick('host', t0);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  ctx.filter = (t >= C.s1frz && t < C.s1rwS) ? 'grayscale(0.85) contrast(1.05)' : 'none';
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
  const dk = dark(t);
  if (dk > 0) { ctx.fillStyle = `rgba(12,18,45,${0.35 * dk})`; ctx.fillRect(0, 0, W, H - HV.h); }
  drawArrows(t);
  drawLabels(t);
  comic(t);
  overlays(t);
  drawHeader();
  drawCaption(t);
  drawChips(t);
  drawBubble(t);
  ctx.getImageData(0, 0, 1, 1);
  tick('2d', t0);
}
window.setup = setup; window.draw = draw; window.sfxEvents = () => SFX;
window.prof = () => PROF;
window.sceneReady = true;
