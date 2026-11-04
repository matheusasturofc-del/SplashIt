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
const GAP = 15;              // meia largura do rio junto da ponte
const BED = -3;              // fundo do rio (areia)
const ROCK = -7.5;           // topo da rocha
const ERAS = [];
// rio sinuoso: reto perto da ponte, curvas longe dela
const smooth01 = (x, a, b) => { const k = cl((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const riverC = z => smooth01(Math.abs(z), 12, 40) * (4.5 * Math.sin(z * 0.045 + 0.4) + 2 * Math.sin(z * 0.11));
const riverW = z => GAP + smooth01(Math.abs(z), 12, 40) * 2.2 * Math.sin(z * 0.13 + 1.3);
function groundY(x, z) {
  const d = Math.abs(x - riverC(z)) - riverW(z);   // < 0 dentro do rio
  if (d < -2.4) return BED;
  if (d < -1.4) return lerp(BED, 0.25, (d + 2.4));          // fundo subindo até a prainha
  if (d < -0.9) return 0.25;                                 // faixa de areia
  if (d < 0) return lerp(0.25, BANK_Y, (d + 0.9) / 0.9);     // barranco de terra
  const hill = smooth01(d, 14, 34) * smooth01(Math.abs(z), 6, 16) * (3 + 3 * Math.sin(x * 0.06 + z * 0.04) * Math.cos(z * 0.07 + 0.5));
  const bump = smooth01(d, 2, 6) * smooth01(Math.abs(z), 5, 9) * 0.18 * Math.sin(x * 0.9 + z * 1.3) * Math.cos(x * 0.7 - z * 0.5);
  return BANK_Y + hill + bump;
}

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
  // viga de concreto
  C.beam0 = S('v1') + 0.15; C.truck0 = S('v2') + 0.1; C.crack = wT('v2', 'racha');
  C.rwV = RW(E('v2') + 0.15, S('v2') - 0.05);
  // pilares e erosão
  C.piers = wT('p1', 'colunas') - 0.3; C.scour0 = S('p2') + 0.2; C.sink = wT('p2', 'afundar') - 0.2;
  C.rwP = RW(E('p2') + 0.15, S('p2') - 0.05);
  // fundação (raio-x) e navio
  C.xray0 = S('d1') + 0.1; C.piles = wT('d1', 'crava') - 0.1; C.rock = wT('d1', 'rocha'); C.xray1 = E('d1') + 0.2;
  C.ship0 = S('d2') + 0.05; C.bonk = Math.min(E('d2') - 0.3, wT('d2', 'bate') + 0.2);
  C.rwD = RW(E('d2') + 0.15, S('d2') - 0.05);
  // pênsil sem ancoragem
  C.beamOut = S('s1') + 0.05; C.towers = wT('s1', 'torre') - 0.3; C.cables = wT('s1', 'pendura') - 0.4; C.deckS = wT('s1', 'cabos') - 0.2;
  C.tip0 = wT('s2', 'puxam') - 0.2; C.fall0 = wT('s2', 'caírem') - 0.3;
  C.rwS = RW(E('s2') + 0.15, S('s2') - 0.05);
  // ancoragem e Tacoma
  C.cable2 = wT('n1', 'passa') - 0.2; C.anch = wT('n1', 'blocos') - 0.3;
  C.wind = S('n2') + 0.2; C.fall = wT('n2', 'partir') - 0.2;
  C.rwN = RW(E('n2') + 0.15, S('n2') - 0.05);
  // treliça
  C.truss0 = wT('t1', 'grade') - 0.3; C.windOK = wT('t1', 'vento') - 0.4;
  // junta de dilatação
  C.heat = S('j1') + 0.1; C.buckle = wT('j1', 'empurra');
  C.rwJ = RW(E('j1') + 0.15, S('j1') - 0.05);
  C.joint0 = wT('j2', 'folga') - 0.3; C.teeth = wT('j2', 'dentes') - 0.2;
  C.tuque = wT('j3', 'tuque'); C.car0 = C.tuque - (25 - 15.55) / 6;
  // final
  C.cars = S('o1') - 0.6; C.hostWorld = S('o1') - 0.3; C.stamp = S('o1') + 0.25; C.cta = S('o2') - 0.1;
  C.eraKeys = [[0, 0]];

  // ---------- câmera [alvo x, y, z, distância, azimute, elevação, fov]
  const CK = [];
  CK.push([0, [0, 6.0, 0, 44, 1.35, 0.55, 40]], [0.55, [-3, 2.6, 0, 19, 1.2, 0.3, 40], 'o'], [C.brk - 0.4, [-1, 2.4, 0, 17, 1.05, 0.26, 40]], [C.rwH.b, [-1, 2.2, 0, 18, 1.0, 0.24, 40]]);
  CK.push([C.beam0 + 0.6, [0, 1.5, 0, 36, 0.85, 0.22, 40]], [E('v1'), [0, 1.5, 0, 34, 0.95, 0.2, 40]]);
  CK.push([C.truck0 + 0.4, [-4, 2.5, 0, 24, 0.75, 0.2, 40]], [C.crack, [0, 2, 0, 22, 0.6, 0.18, 40]], [C.rwV.b, [0, 2, 0, 22, 0.6, 0.18, 40]]);
  CK.push([C.piers + 0.6, [0, 0.5, 0, 38, 0.5, 0.16, 40]], [E('p1'), [0, 0.5, 0, 36, 0.6, 0.16, 40]]);
  CK.push([C.scour0 + 0.4, [0, 0, 0, 30, 0.35, 0.28, 40]], [C.rwP.b, [0, 0, 0, 30, 0.4, 0.28, 40]]);
  CK.push([C.xray0 + 0.5, [0, -3.5, 0, 40, 0.2, 0.13, 40]], [C.xray1, [0, -3.5, 0, 38, 0.35, 0.13, 40]]);
  CK.push([C.ship0 + 0.5, [0, 2, -4, 32, 0.45, 0.2, 40]], [C.bonk, [0, 2, -2, 24, 0.5, 0.2, 40]], [C.rwD.b, [0, 2, -2, 24, 0.55, 0.2, 40]]);
  CK.push([C.towers + 0.7, [0, 9, 0, 64, 0.75, 0.18, 40]], [E('s1'), [0, 9, 0, 62, 0.9, 0.17, 40]]);
  CK.push([C.tip0, [0, 8, 0, 60, 0.7, 0.2, 40]], [C.rwS.b, [0, 8, 0, 60, 0.7, 0.2, 40]]);
  CK.push([C.cable2 + 0.5, [0, 8, 0, 82, 1.0, 0.2, 40]], [C.anch + 0.6, [24, 5, 0, 30, 0.75, 0.22, 40]], [E('n1'), [24, 5, 0, 30, 0.85, 0.22, 40]]);
  CK.push([C.wind + 0.4, [0, 5, 0, 56, 0.85, 0.15, 40]], [C.rwN.b, [0, 5, 0, 56, 0.9, 0.15, 40]]);
  CK.push([C.truss0 + 0.5, [0, 3, 0, 26, 0.5, 0.14, 40]], [E('t1'), [0, 3, 0, 32, 0.7, 0.16, 40]]);
  CK.push([C.heat + 0.5, [0, 3, 0, 36, 0.22, 0.1, 40]], [C.rwJ.b, [0, 3, 0, 36, 0.25, 0.1, 40]]);
  CK.push([C.joint0 + 0.5, [15.1, 2.1, 0.3, 8, -0.45, 0.55, 40]], [C.car0, [15.3, 2.2, 0.5, 9, -0.6, 0.42, 40]], [E('j3'), [15.3, 2.2, 0.5, 9.5, -0.7, 0.4, 40]]);
  CK.push([C.cars + 0.4, [0, 4, 0, 40, 0.95, 0.14, 40]], [C.hostWorld, [0, 4, 0, 40, 1.0, 0.14, 40]]);
  CK.push([C.hostWorld + 0.9, [14, 9, 0, 50, 1.15, 0.12, 42]], [TL.duration, [14, 9, 0, 51, 1.22, 0.14, 42]]);
  C.camKeys = sortK(CK);

  C.shakes = [[C.slam, 0.35], [C.brk, 0.15], [C.crack, 0.2], [C.sink + 0.5, 0.2], [C.bonk, 0.3], [C.fall0 + 0.9, 0.35], [C.fall + 0.8, 0.4], [C.buckle + 0.6, 0.2], [C.stamp + 0.18, 0.25]];

  // ---------- reações do mestre de obras
  const Rx = (t, d, e, p, b) => REACT.push({ t, d, e, p, b });
  Rx(C.brk - 0.2, C.rwH.a - C.brk + 0.2, 'shock', 'up', 'Splash!');
  Rx(E('v1') - 1.0, 1.0, 'happy', 'thumbs', null);
  Rx(C.crack, C.rwV.a - C.crack, 'shock', 'cheeks', 'Crack!');
  Rx(E('p1') - 1.0, 1.0, 'happy', 'thumbs', null);
  Rx(C.sink, C.rwP.a - C.sink, 'shock', 'up', 'Afundou!');
  Rx(E('d1') - 1.0, 1.0, 'happy', 'thumbs', null);
  Rx(C.bonk, C.rwD.a - C.bonk, 'wince', 'cheeks', 'Ai!');
  Rx(E('s1') - 1.0, 1.0, 'happy', 'thumbs', null);
  Rx(C.fall0, C.rwS.a - C.fall0, 'shock', 'up', 'Não!');
  Rx(E('n1') - 1.0, 1.0, 'happy', 'thumbs', null);
  Rx(C.wind + 0.6, C.rwN.a - C.wind - 0.6, 'shock', 'cheeks', 'Tá dançando!');
  Rx(E('t1') - 1.0, 1.0, 'relieved', 'wipe', 'Ufa!');
  Rx(C.buckle, C.rwJ.a - C.buckle, 'worried', 'wipe', 'Que calor!');
  Rx(C.tuque - 0.1, 1.2, 'happy', 'point', 'Tuque tuque!');
  Rx(C.stamp + 0.15, 2.4, 'happy', 'cheer', 'Uhuul!');
  Rx(C.cta, TL.duration - C.cta, 'happy', 'point', null);
  for (const r of C.REW) Rx(r.a, r.b - r.a, 'worried', 'point', 'Volta!');
  REACT.sort((a, b) => a.t - b.t);

  // ---------- etiquetas
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const Lb = (txt, t0, t1, at, off) => { LABELS.push({ txt, t0, t1, at, off }); CHIPS.push({ txt, t: t0 }); };
  Lb('VIGA', wT('v1', 'viga'), E('v1') + 0.3, () => V(-5, 1.6, 1.1), [-40, -280]);
  Lb('PILARES', wT('p1', 'pilares'), E('p1') + 0.3, () => V(-7.5, -0.5, 1.2), [-20, -330]);
  Lb('FUNDAÇÃO', wT('d1', 'fundação'), E('d1') + 0.3, () => V(-0.45, ROCK + 0.3, 0.6), [80, -380]);
  Lb('PÊNSIL', wT('s1', 'pênsil'), E('s1') + 0.3, () => V(-8, 9.5, 2.6), [-40, -260]);
  Lb('ANCORAGEM', wT('n1', 'ancoragem'), E('n1') + 0.3, () => V(28, BANK_Y + 2.2, 3.4), [-60, -300]);
  Lb('TRELIÇA', wT('t1', 'treliça'), E('t1') + 0.3, () => V(-3, 2.7, 2.3), [-40, -300]);
  Lb('JUNTA DE DILATAÇÃO', wT('j2', 'junta'), E('j2') + 0.4, () => V(15, BANK_Y + 0.05, 1.0), [-60, -330]);

  // ---------- setas
  const Ar = (t0, t1, at, dir, len, col, kind = 'line') => ARROWS.push({ t0, t1, at, dir: new THREE.Vector3(...dir), len, col, kind });
  const RED = '#ff4d3d', BLUE = '#4d9bff', YEL = '#ffd23f', GREEN = '#2ecc71';
  Ar(C.walk0 + 0.8, C.brk, () => V(0, 4.2, 0), [0, -1, 0], 1.5, RED);
  Ar(C.truck0 + 0.6, C.crack, () => V(0, 5, 0), [0, -1, 0], 1.6, RED);
  Ar(C.scour0 + 0.2, C.sink, () => V(0, BED + 0.6, 1.4), [0, 0, 0], 1, YEL, 'spin');
  for (const x of [-7.5, 0, 7.5]) Ar(C.piles, C.rock + 0.6, () => V(x, -1.2, 1.4), [0, -1, 0], 2.0, GREEN);
  Ar(C.ship0 + 0.6, C.bonk, () => V(0, 3.5, -9), [0, 0, 1], 3, RED);
  for (const s of [-1, 1]) Ar(C.tip0, C.fall0 + 0.4, () => V(s * 16, 19, 2.6), [-s, 0, 0], 3, RED);
  for (const s of [-1, 1]) Ar(C.anch + 0.6, E('n1') + 0.2, () => V(s * 20, 17, 2.6), [s, -0.6, 0], 3, GREEN);
  for (const z of [-6, 0, 6]) Ar(C.wind, C.fall, () => V(-26, 3, z), [1, 0, 0], 4, BLUE);
  for (const z of [-4, 4]) Ar(C.windOK, E('t1') + 0.2, () => V(-6, 2.7, z), [0, 0, -Math.sign(z)], 3, BLUE);
  for (const s of [-1, 1]) Ar(C.heat + 0.6, C.rwJ.a, () => V(s * 12, 3.2, 0), [s, 0, 0], 2.5, RED);

  // ---------- efeitos sonoros
  sfx(0.0, 'whoosh', 0.8); sfx(C.slam, 'crash', 0.8); sfx(C.slam + 0.05, 'thud', 0.9);
  for (let k = 0; k < 6; k++) { const tb = C.walk0 + 0.15 + k * Math.max(0.3, (C.brk - C.walk0 - 0.4) / 6); if (tb < C.brk - 0.3) sfx(tb, 'bonk', 0.45 + k * 0.06); }
  sfx(C.brk - 0.5, 'creak', 0.7); sfx(C.brk, 'snap', 1.0); sfx(C.brk + 0.55, 'crash', 0.6);
  sfx(C.beam0, 'whoosh', 0.6); asmSfx(C.beam0 + 0.2, 1.0, 6, 'thud', 0.5);
  sfx(C.truck0, 'hum', 0.4, C.crack - C.truck0); sfx(C.crack - 0.5, 'creak', 0.7); sfx(C.crack, 'snap', 1.0); sfx(C.crack + 0.55, 'crash', 0.7);
  asmSfx(C.piers, 1.0, 3, 'thud', 0.6);
  sfx(C.scour0, 'slide', 0.4, C.sink - C.scour0); sfx(C.sink, 'creak', 0.8); sfx(C.sink + 0.6, 'crash', 0.8);
  sfx(C.xray0, 'powerup', 0.4); asmSfx(C.piles, 1.2, 6, 'clank', 0.5); sfx(C.rock + 0.1, 'clac', 0.8);
  sfx(C.ship0, 'hum', 0.35, C.bonk - C.ship0); sfx(C.ship0 + 0.4, 'alarm', 0.3); sfx(C.bonk, 'bonk', 1.0); sfx(C.bonk + 0.6, 'crash', 0.8);
  sfx(C.beamOut, 'whoosh', 0.7); sfx(C.towers, 'powerup', 0.4); asmSfx(C.towers, 1.0, 4, 'clank', 0.5);
  sfx(C.cables, 'zip', 0.6); asmSfx(C.deckS, 1.4, 8, 'clank', 0.35);
  sfx(C.tip0, 'strain', 0.5, C.fall0 - C.tip0); sfx(C.fall0, 'creak', 0.8); sfx(C.fall0 + 0.9, 'crash', 1.0);
  sfx(C.cable2, 'zip', 0.6); sfx(C.anch + 0.3, 'thud', 0.9); sfx(C.anch + 0.55, 'thud', 0.7);
  sfx(C.wind, 'whoosh', 0.7); sfx(C.wind + 0.2, 'strain', 0.4, C.fall - C.wind); sfx(C.fall, 'snap', 1.0); sfx(C.fall + 0.9, 'crash', 1.0);
  asmSfx(C.truss0, 1.4, 10, 'clank', 0.35); sfx(C.windOK, 'whoosh', 0.5);
  sfx(C.heat, 'alarm', 0.3); sfx(C.buckle, 'creak', 0.8); sfx(C.buckle + 0.6, 'snap', 0.8);
  sfx(C.joint0, 'pop', 0.5); asmSfx(C.teeth - 0.2, 0.6, 4, 'clac', 0.4);
  sfx(C.car0, 'hum', 0.3, 2.6); sfx(C.tuque, 'thud', 1.0); sfx(C.tuque + 0.01, 'clac', 0.6); sfx(C.tuque + 1.1 / 6, 'thud', 1.0); sfx(C.tuque + 1.1 / 6 + 0.01, 'clac', 0.6);
  sfx(C.cars, 'hum', 0.3, 3);
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
const camera = new THREE.PerspectiveCamera(38, W / H, 0.3, 500);

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
// ---------- paisagem low-poly: terreno com rio sinuoso, barrancos, árvores, grama, pedras e nuvens
const LP = (col, o = {}) => M(col, { flatShading: true, roughness: 0.95, ...o });
function buildWorld() {
  // terreno
  const xs = [];
  for (let x = -130; x < -32; x += 2) xs.push(x);
  for (let x = -32; x < 32; x += 0.5) xs.push(x);
  for (let x = 32; x <= 130; x += 2) xs.push(x);
  const zs = []; for (let z = -170; z <= 130; z += 1) zs.push(z);
  const nx = xs.length, nz = zs.length;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3);
  const cG1 = new THREE.Color('#86c95a'), cG2 = new THREE.Color('#62ad48'), cDirt = new THREE.Color('#a8784a'), cDirt2 = new THREE.Color('#8e6239'), cSand = new THREE.Color('#dcc08a'), cBed = new THREE.Color('#8a7350');
  const c = new THREE.Color();
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = xs[i], z = zs[j], k = j * nx + i;
    // pequeno deslocamento aleatório fora da área da ponte deixa as facetas irregulares
    const far = smooth01(Math.abs(z), 6, 12);
    const jx = far * (rnd(k) - 0.5) * 0.35, jz = far * (rnd(k + 7) - 0.5) * 0.35;
    const y = groundY(x + jx, z + jz);
    pos.set([x + jx, y, z + jz], k * 3);
    const d = Math.abs(x + jx - riverC(z + jz)) - riverW(z + jz);
    if (d < -1.4) c.copy(cBed);
    else if (d < -0.9) c.copy(cSand);
    else if (d < -0.02) c.copy(cDirt).lerp(cDirt2, rnd(k + 3));
    else c.copy(cG1).lerp(cG2, 0.25 + 0.75 * rnd(k + 11) * (0.6 + 0.4 * Math.sin(x * 0.2 + z * 0.15)));
    col.set([c.r, c.g, c.b], k * 3);
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  R.terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
  R.terrain = new THREE.Mesh(g, R.terrainMat); R.terrain.receiveShadow = true; scene.add(R.terrain);
  // estrada de terra batida que chega na ponte
  for (const s of [-1, 1]) boxC(s > 0 ? 15 : -90, BANK_Y, -1.6, s > 0 ? 90 : -15, BANK_Y + 0.03, 1.6, M('#8d8f94', { roughness: 0.95 }));
  // água
  const wt = canvasTex(256, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#2c6fbf'); gr.addColorStop(0.5, '#3b86d4'); gr.addColorStop(1, '#2c6fbf');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 2;
    for (let i = 0; i < 26; i++) { const y = rnd(i) * h, x = rnd(i + 5) * w; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 2, y + 30 + rnd(i + 2) * 30); g.stroke(); }
  });
  wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(3, 10);
  R.waterMat = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.18, metalness: 0.05, transparent: true, opacity: 0.9, depthWrite: false });
  R.water = new THREE.Mesh(new THREE.PlaneGeometry(90, 300), R.waterMat);
  R.water.rotation.x = -Math.PI / 2; R.water.position.set(0, 0, -20); scene.add(R.water);
  // areia e rocha sob o rio (só aparecem no raio-x)
  R.sandMat = new THREE.MeshStandardMaterial({ color: '#d9b97c', transparent: true, opacity: 0, depthWrite: false });
  R.sand = boxC(-14, ROCK, -5, 14, BED - 0.05, 5, R.sandMat); R.sand.castShadow = false;
  R.rock = boxC(-14, ROCK - 3, -5, 14, ROCK, 5, LP('#7b746c')); R.rock.visible = false;
  // árvores, tufos de grama e pedras
  const okSpot = (x, z) => { const d = Math.abs(x - riverC(z)) - riverW(z); return d > 2.5 && Math.abs(z) > 4.5 && !(Math.abs(Math.abs(x) - 30) < 6 && Math.abs(z) < 8) && !(x > 17 && x < 30 && z > 2 && z < 11); };
  const pineM = LP('#2f7a3a'), pineM2 = LP('#3d8f45'), roundM = LP('#4caf50'), roundM2 = LP('#5bbd55'), trunkM = LP('#6e4a2c');
  const coneG = new THREE.ConeGeometry(1, 1.6, 6), icoG = new THREE.IcosahedronGeometry(1, 0), trunkG = new THREE.CylinderGeometry(0.12, 0.16, 1, 6);
  const tree = (x, z, s, kind) => {
    const y = groundY(x, z), t = grp(null, x, y, z);
    const tr = mesh(trunkG, trunkM); tr.scale.set(s, 1.6 * s, s); tr.position.y = 0.8 * s; t.add(tr);
    if (kind) { for (let k = 0; k < 3; k++) { const c = mesh(coneG, k % 2 ? pineM2 : pineM); c.scale.setScalar(s * (1.0 - k * 0.25)); c.position.y = s * (1.9 + k * 0.8); t.add(c); } }
    else { const a = mesh(icoG, roundM); a.scale.setScalar(1.15 * s); a.position.y = 2.4 * s; t.add(a); const b = mesh(icoG, roundM2); b.scale.setScalar(0.8 * s); b.position.set(0.5 * s, 3.0 * s, 0.3 * s); t.add(b); }
    t.rotation.y = rnd(x * 3 + z) * 6;
  };
  let n = 0;
  for (let i = 0; n < 150 && i < 2000; i++) {
    const x = (rnd(i * 3 + 1) - 0.5) * 150, z = -110 + rnd(i * 3 + 2) * 150;
    if (!okSpot(x, z) || Math.abs(x) < 17 && z > -10) continue;
    tree(x, z, 0.8 + rnd(i + 9) * 0.7, rnd(i + 4) < 0.45); n++;
  }
  // grama: muitos tufos instanciados
  const tuftG = new THREE.ConeGeometry(0.12, 0.45, 4), tufts = new THREE.InstancedMesh(tuftG, LP('#4f9a3c'), 900);
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.35, 0), LP('#8b8e93'), 60);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  let nt = 0, nr = 0;
  for (let i = 0; i < 6000 && (nt < 900 || nr < 60); i++) {
    const x = (rnd(i * 5 + 0.3) - 0.5) * 120, z = -70 + rnd(i * 5 + 1.7) * 110;
    const d = Math.abs(x - riverC(z)) - riverW(z);
    if (d < 0.6 || Math.abs(z) < 2.2) continue;
    if (nt < 900) { p.set(x, groundY(x, z) + 0.18, z); q.setFromAxisAngle(_up, rnd(i) * 6); sc.setScalar(0.7 + rnd(i + 2) * 0.8); tufts.setMatrixAt(nt++, mtx.compose(p, q, sc)); }
    else if (nr < 60 && rnd(i + 8) < 0.3) { p.set(x, groundY(x, z) + 0.05, z); q.setFromAxisAngle(_up, rnd(i) * 6); sc.set(1 + rnd(i) * 1.5, 0.6, 1 + rnd(i + 1)); rocks.setMatrixAt(nr++, mtx.compose(p, q, sc)); }
  }
  tufts.count = nt; rocks.count = nr; tufts.receiveShadow = rocks.receiveShadow = true;
  scene.add(tufts, rocks);
  // nuvens fofas low-poly
  const cloudM = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1, emissive: '#dfe8f5', emissiveIntensity: 0.35 });
  const cloudG = new THREE.IcosahedronGeometry(1, 1);
  R.clouds = [];
  for (let i = 0; i < 9; i++) {
    const cg = grp(null, -120 + i * 30 + rnd(i) * 12, 26 + rnd(i + 2) * 16, -95 - rnd(i + 5) * 30);
    for (let k = 0; k < 4; k++) { const m = mesh(cloudG, cloudM, false); m.scale.setScalar(4 + rnd(i * 4 + k) * 3); m.position.set((k - 1.5) * 4.5, (k % 2) * 2, rnd(k + i) * 2); cg.add(m); }
    R.clouds.push(cg);
  }
}
// ---------- 1. tábua e pessoa
function buildPlank() {
  R.plankSegs = [];
  const N = 12, L = 33 / N;
  const g = grp(null); R.plank = g;
  for (let i = 0; i < N; i++) R.plankSegs.push(box(L, 0.35, 1.6, M('#b07a46', { roughness: 0.7 }), -16.5 + L * (i + 0.5), BANK_Y + 0.205, 0, g));
  R.walker = person('#e76f51'); scene.add(R.walker);
}
// ---------- 2. viga de concreto, caminhão, pilares, estacas e navio
const BSEG = 12, BL = 30 / BSEG;
function buildBeam() {
  const conc = M('#c3c0ba', { roughness: 0.85 });
  R.beam = grp(null);
  R.beamSegs = [];
  for (let i = 0; i < BSEG; i++) {
    const m = box(BL, 1.0, 2.2, conc, -15 + BL * (i + 0.5), 1.5, 0, R.beam);
    asm(m, () => C.beam0 + Math.abs(i - 5.5) * 0.07, 0.45, { dy: 7, rz: 0.4, s: 0.7 });
    R.beamSegs.push(m);
  }
  // caminhão
  R.truck = grp(null);
  boxC(-1.5, 0.45, -0.75, 0.9, 2.0, 0.75, M('#e9a23b'), R.truck);
  boxC(1.0, 0.45, -0.72, 2.0, 1.5, 0.72, M('#d1495b'), R.truck);
  boxC(1.25, 1.1, -0.76, 1.9, 1.42, 0.76, M('#bfe3f7', { roughness: 0.2 }), R.truck);
  for (const x of [-1.0, 0.3, 1.5]) for (const z of [-0.78, 0.78]) cylZ(0.3, 0.16, M('#1b1b1b'), x, 0.3, z, R.truck);
  // pilares (grupo com origem na base, para poder afundar e tombar)
  const stone = M('#a9a39a', { roughness: 0.85 });
  R.piers = [];
  for (const x of [-7.5, 0, 7.5]) {
    const p = grp(null, x, BED, 0);
    boxC(-0.8, 0, -1.2, 0.8, 1.0 - BED, 1.2, stone, p);
    asm(p, () => C.piers + (x + 7.5) * 0.04, 0.6, { dy: -7, s: 0.8 });
    R.piers.push(p);
  }
  // estacas da fundação (cilindros que descem de dentro do pilar até a rocha)
  R.piles = [];
  const pm = M('#8f969e', { roughness: 0.6 });
  for (const x of [-7.5, 0, 7.5]) for (const [dx, dz] of [[-0.45, -0.6], [0.45, -0.6], [-0.45, 0.6], [0.45, 0.6]]) {
    const m = mesh(GEO.cyl, pm); const len = BED - ROCK + 0.8; m.scale.set(0.2, len, 0.2);
    m.userData = { x: x + dx, z: dz, len, k: R.piles.length }; scene.add(m); R.piles.push(m);
  }
  // navio de carga
  R.ship = grp(null);
  boxC(-1.7, -0.6, -11, 1.7, 1.3, -1.6, M('#c0392b'), R.ship);
  const bow = box(2.4, 1.9, 2.4, M('#c0392b'), 0, 0.35, -1.6, R.ship); bow.rotation.y = Math.PI / 4; bow.scale.set(2.4, 1.9, 2.4);
  boxC(-1.55, 1.3, -10.6, 1.55, 1.5, -2.0, M('#e8e1d4'), R.ship);
  boxC(-1.2, 1.5, -10.2, 1.2, 4.2, -8.0, M('#f4f1ea'), R.ship);
  boxC(-1.0, 3.4, -8.06, 1.0, 3.9, -7.94, M('#7fb3d5', { roughness: 0.2 }), R.ship);
  const cols = ['#2a9d8f', '#e9a23b', '#4d7cfe', '#e76f51'];
  for (let k = 0; k < 4; k++) boxC(-1.3, 1.5, -7.4 + k * 1.3, 1.3, 2.6 + (k % 2) * 0.4, -6.3 + k * 1.3, M(cols[k]), R.ship);
}
// ---------- 3. ponte pênsil
const SEG = 15, SEGL = 2, TX = 17, TOPY = 21;
function buildSuspension() {
  R.susp = grp(null);
  const tw = M('#c0392b', { roughness: 0.5, metalness: 0.3 }), conc = M('#9aa0a8', { roughness: 0.8 }), st = M('#5d6675', { metalness: 0.4, roughness: 0.5 });
  R.towers = [];
  for (const s of [-1, 1]) {
    const t = grp(R.susp, s * TX, BANK_Y - 1, 0);
    for (const zs of [-1, 1]) boxC(-1.3, 0, zs > 0 ? 1.8 : -3.4, 1.3, 1.5, zs > 0 ? 3.4 : -1.8, conc, t);
    for (const z of [-2.6, 2.6]) boxC(-0.35, 1.5, z - 0.3, 0.35, TOPY - (BANK_Y - 1), z + 0.3, tw, t);
    for (const y of [10.5, 18.8]) boxC(-0.3, y, -2.3, 0.3, y + 0.8, 2.3, tw, t);
    asm(t, () => C.towers + (s > 0 ? 0.3 : 0), 0.9, { dy: -24, s: 1 });
    t.userData.s = s; R.towers.push(t);
  }
  R.anchors = [];
  for (const s of [-1, 1]) for (const zs of [-1, 1]) {
    const a = boxC(s > 0 ? 26.5 : -32.5, BANK_Y - 2.2, zs > 0 ? 1.9 : -4.9, s > 0 ? 32.5 : -26.5, BANK_Y + 2.3, zs > 0 ? 4.9 : -1.9, conc, R.susp);
    asm(a, () => C.anch + (s > 0 ? 0.25 : 0), 0.6, { dy: 9, s: 0.4 });
    R.anchors.push(a);
  }
  R.deck = [];
  for (let i = 0; i < SEG; i++) {
    const xc = -15 + i * SEGL + SEGL / 2;
    const g = grp(R.susp, xc, 0, 0);
    boxC(-SEGL / 2, 1.5, -2.2, SEGL / 2, BANK_Y, 2.2, M('#d8d4cc', { roughness: 0.7 }), g);
    const order = Math.abs(i - (SEG - 1) / 2);
    asm(g, () => C.deckS + order * 0.12, 0.45, { dy: -6, s: 0.6 });
    // treliça lateral do segmento (aparece no fim)
    const tr = grp(g);
    for (const z of [-2.32, 2.32]) {
      member(tr, V3(-1, 2.0, z), V3(1, 2.0, z), 0.06, st);
      member(tr, V3(-1, 3.4, z), V3(1, 3.4, z), 0.07, st);
      member(tr, V3(-1, 2.0, z), V3(-1, 3.4, z), 0.06, st);
      if (i === SEG - 1) member(tr, V3(1, 2.0, z), V3(1, 3.4, z), 0.06, st);
      member(tr, i % 2 ? V3(-1, 2.0, z) : V3(-1, 3.4, z), i % 2 ? V3(1, 3.4, z) : V3(1, 2.0, z), 0.06, st);
    }
    asm(tr, () => C.truss0 + order * 0.1, 0.45, { dy: 4, s: 0.3 });
    g.userData = { xc, tr };
    R.deck.push(g);
  }
  R.cablesS = [-2.6, 2.6].map(() => cylPool(60, 0.16, M('#e0e3e8', { metalness: 0.6, roughness: 0.3 })));
  R.hangers = cylPool(SEG * 2, 0.05, M('#cfd4dc', { metalness: 0.5 }));
  // juntas de dilatação: dentes de aço intercalados nas duas pontas
  R.jointDeck = []; R.jointBank = [];
  const steel = M('#b9c0c8', { metalness: 0.6, roughness: 0.35 });
  for (const s of [-1, 1]) {
    const gd = grp(R.susp), gb = grp(R.susp);
    for (let k = 0; k <= 10; k++) {
      const z = -2.0 + k * 0.4, x0 = s * 14.45, x1 = s * 15.3, y0 = BANK_Y + 0.01, y1 = BANK_Y + 0.07;
      if (k % 2 === 0) boxC(Math.min(x0, x1), y0, z - 0.09, Math.max(x0, x1), y1, z + 0.09, steel, gd);
      else { const a = s * 14.7, b = s * 15.55; boxC(Math.min(a, b), y0, z - 0.09, Math.max(a, b), y1, z + 0.09, steel, gb); }
    }
    asm(gd, () => C.teeth, 0.4, { dy: 2, s: 0.5 }); asm(gb, () => C.teeth + 0.15, 0.4, { dy: 2, s: 0.5 });
    gd.userData.s = s; R.jointDeck.push(gd); R.jointBank.push(gb);
  }
  // carro que passa na junta e carros do final
  const car = (colr) => {
    const c = grp(null);
    boxC(-0.9, 0.12, -0.45, 0.9, 0.6, 0.45, M(colr), c);
    boxC(-0.5, 0.6, -0.4, 0.4, 0.95, 0.4, M('#bfe3f7', { metalness: 0.3, roughness: 0.2 }), c);
    for (const [x, z] of [[-0.55, -0.47], [0.55, -0.47], [-0.55, 0.47], [0.55, 0.47]]) cylZ(0.2, 0.06, M('#111'), x, 0.2, z, c);
    return c;
  };
  R.jcar = car('#4d7cfe');
  R.carList = [];
  const cols = ['#e63946', '#4d7cfe', '#ffd23f', '#2a9d8f', '#ff8a2a', '#8e5bd1'];
  for (let k = 0; k < 6; k++) { const c = car(cols[k]); c.userData = { lane: k % 2 ? 0.8 : -0.8, off: k * 13 }; R.carList.push(c); }
}
function buildParticles() {
  R.splash = []; for (let i = 0; i < 70; i++) { const m = mesh(GEO.sph, new THREE.MeshStandardMaterial({ color: '#d6ecff', transparent: true, opacity: 0.8, depthWrite: false }), false); m.visible = false; scene.add(m); R.splash.push(m); }
  R.dust = []; for (let i = 0; i < 36; i++) { const m = mesh(GEO.sph, new THREE.MeshStandardMaterial({ color: '#d9b97c', transparent: true, opacity: 0.8, depthWrite: false }), false); m.visible = false; scene.add(m); R.dust.push(m); }
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
    g.position.copy(b.p); g.rotation.copy(b.r); g.scale.setScalar(1);
  }
  const k = P(t, t0, 0.6);
  if (k <= 0) return true;
  g.position.y += 25 * EZ.i2(k); g.rotation.z += dir * 0.8 * k; g.scale.setScalar(Math.max(0.001, 1 - k));
  return k < 1;
}
// gira um bloco em torno de um pivô no eixo z (para quebras em V)
function rotAbout(m, xc, yc, px, a) { const rel = xc - px; m.position.set(px + rel * Math.cos(a), yc + rel * Math.sin(a), 0); m.rotation.set(0, 0, a); }
let _xrayOn = false;
function updateWorld(t) {
  applyAsm(t);
  R.waterMat.map.offset.y = -t * 0.04;
  R.clouds.forEach((c, i) => { c.userData.x0 ??= c.position.x; c.position.x = c.userData.x0 + t * (0.25 + 0.05 * i); });
  // raio-x da fundação: terreno, água e areia ficam transparentes
  const xk = between(t, C.xray0, C.xray1 + 0.4) ? Math.min(P(t, C.xray0, 0.4), 1 - P(t, C.xray1, 0.4)) : 0;
  const on = xk > 0;
  if (on !== _xrayOn) { _xrayOn = on; R.terrainMat.transparent = on; R.terrainMat.depthWrite = !on; R.terrainMat.needsUpdate = true; }
  R.terrainMat.opacity = 1 - 0.7 * xk;
  R.sand.visible = R.rock.visible = on; R.sandMat.opacity = 0.5 * xk;
  const sk = between(t, C.scour0, C.rwP.a) ? P(t, C.scour0, 0.4) : 0;
  R.waterMat.opacity = 0.9 - 0.35 * sk - 0.6 * xk;
  updatePlank(t);
  updateBeam(t);
  updateSuspension(t);
  updateCars(t);
  updateParticles(t);
}
function updatePlank(t) {
  const segs = R.plankSegs, N = segs.length, L = 33 / N, Y0 = BANK_Y + 0.205;
  const drop = 1 - EZ.i2(P(t, C.plank0, C.slam - C.plank0));
  R.plank.scale.setScalar(1);
  R.plank.position.set(0, 14 * drop, 0); R.plank.rotation.set(0, 1.2 * drop, 0);
  R.plank.visible = flyOut(R.plank, t, C.beam0 - 0.35, 1, false);
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
    if (broken) { const px = xc < 0 ? -15 : 15; rotAbout(m, xc, Y0, px, xc > px ? -th : th); }
    else { m.position.set(xc, Y0 + sag(xc), 0); m.rotation.set(0, 0, Math.atan(2 * A * xc / 16.5 ** 2)); }
  });
  const w = R.walker;
  w.visible = between(t, C.walk0, C.rwH.a);
  if (w.visible) {
    let y = BANK_Y + 0.38 + sag(wx) + bounce * 1.6 * grow, x = wx;
    if (broken) { const k = P(t, C.brk, 0.7); y = lerp(BANK_Y + 0.38, -2.5, EZ.i2(k)); w.rotation.z = 2 * k; }
    else w.rotation.z = 0;
    w.position.set(x, y, 0); w.rotation.y = Math.PI / 2;
  }
}
function updateBeam(t) {
  R.beam.visible = t >= C.beam0 && flyOut(R.beam, t, C.beamOut);
  // 1) caminhão: a viga enverga e racha no meio (apoiada só nas margens)
  const trk = between(t, C.truck0, C.rwV.a);
  const crackV = between(t, C.crack, C.rwV.a);
  const A = trk && !crackV ? 0.55 * EZ.i2(P(t, C.truck0 + 0.6, C.crack - C.truck0 - 0.6)) : 0;
  const sagB = x => -A * (1 - (x / 15) ** 2);
  // 2) erosão: o pilar do meio afunda e tomba; 3) navio: o pilar do meio é empurrado
  const scour = between(t, C.scour0, C.rwP.a), ship = between(t, C.bonk, C.rwD.a);
  const [pL, pM, pR] = R.piers;
  let thMid = 0;
  if (scour) {
    const d = 2.4 * EZ.i2(P(t, C.sink - 0.6, 1.0)), tilt = 0.45 * EZ.i2(P(t, C.sink, 0.8));
    pM.position.y = BED - d; pM.rotation.z = -tilt;
    thMid = 0.85 * EZ.i2(P(t, C.sink + 0.1, 0.6));
  }
  if (ship) {
    pM.rotation.x = 0.75 * EZ.i2(P(t, C.bonk, 0.6));
    thMid = 0.9 * EZ.i2(P(t, C.bonk + 0.25, 0.6));
  }
  R.beamSegs.forEach((m, i) => {
    const xc = -15 + BL * (i + 0.5);
    if (crackV) { const th = 1.0 * EZ.i2(P(t, C.crack, 0.5)), px = xc < 0 ? -15 : 15; rotAbout(m, xc, 1.5, px, xc > px ? -th : th); }
    else if (thMid > 0 && Math.abs(xc) < 7.5) { const px = xc < 0 ? -7.5 : 7.5; rotAbout(m, xc, 1.5, px, xc > px ? -thMid : thMid); }
    else if (A > 0) { m.position.y = 1.5 + sagB(xc); m.rotation.z = Math.atan(2 * A * xc / 225); }
  });
  for (const p of R.piers) if (p.visible) p.visible = flyOut(p, t, C.beamOut + 0.15, -1, false);
  // caminhão
  const c = R.truck;
  c.visible = trk;
  if (trk) {
    const x = lerp(-34, -1.2, EZ.o(P(t, C.truck0, C.crack - C.truck0)));
    let y = BANK_Y + (Math.abs(x) > 15 ? 0.03 : 0) + (Math.abs(x) <= 15 ? sagB(x) : 0), rz = 0;
    if (crackV) { const k = EZ.i2(P(t, C.crack, 0.7)); y -= k * 5; rz = -k * 0.9; }
    c.position.set(x, y, 0); c.rotation.set(0, 0, rz);
  }
  // estacas
  R.piles.forEach(m => {
    const u = m.userData;
    m.visible = t >= C.piles && t < C.beamOut;
    if (!m.visible) return;
    const k = EZ.io(P(t, C.piles + (u.k % 4) * 0.06 + Math.floor(u.k / 4) * 0.12, 1.1));
    m.position.set(u.x, BED - u.len / 2 + 3.9 * (1 - k), u.z);
  });
  // navio
  const s = R.ship;
  s.visible = between(t, C.ship0, C.rwD.a);
  if (s.visible) {
    const z = lerp(-42, -1.35, P(t, C.ship0, C.bonk - C.ship0));
    const hit = t > C.bonk ? Math.exp(-(t - C.bonk) * 3) : 0;
    s.position.set(0, 0.06 * Math.sin(t * 2.2), z - (t > C.bonk ? 0.9 * (1 - Math.exp(-(t - C.bonk) * 4)) : 0));
    s.rotation.set(0.04 * Math.sin(t * 1.7) + hit * 0.12 * Math.sin((t - C.bonk) * 14), 0, 0.03 * Math.sin(t * 1.3));
  }
}
// pontos do topo das torres (seguem a inclinação)
const H_T = TOPY - (BANK_Y - 1);
function towerTop(s, ang) { return { x: s * TX - H_T * Math.sin(s * ang), y: BANK_Y - 1 + H_T * Math.cos(ang) }; }
function updateSuspension(t) {
  // torres puxadas para dentro (sem ancoragem)
  const tip = between(t, C.tip0, C.rwS.a);
  const ang = tip ? 0.1 * EZ.io(P(t, C.tip0, C.fall0 - C.tip0)) + 1.15 * EZ.i2(P(t, C.fall0, 1.0)) : 0;
  R.towers.forEach(tw => { if (ang) tw.rotation.z = tw.userData.s * ang; });
  const fallS = between(t, C.fall0, C.rwS.a);
  // Tacoma
  const osc = between(t, C.wind, C.rwN.a);
  const A = osc ? 0.55 * EZ.i2(P(t, C.wind, C.fall - C.wind)) : 0;
  const fallN = between(t, C.fall, C.rwN.a);
  // dilatação: a pista estica e embarriga para cima
  const heat = between(t, C.heat, C.rwJ.a);
  const B = heat ? 1.4 * EZ.i2(P(t, C.buckle - 0.4, 1.0)) : 0;
  const calm = between(t, C.windOK, E('t1') + 0.3);
  const deckPos = [];
  R.deck.forEach((g, i) => {
    const xc = g.userData.xc;
    let y = 0, tw = 0, rz = 0, down = false;
    if (fallS) { const k = EZ.i2(P(t, C.fall0 + Math.abs(xc) * 0.02, 0.9)); y = -10 * k; tw = 0.8 * k * (i % 2 ? 1 : -1); down = k > 0; }
    if (osc) {
      const env = Math.sin(Math.PI * (xc + 15) / 30);
      tw = A * env * Math.sin((t - C.wind) * 6.5 + xc * 0.25);
      y = A * 1.5 * env * Math.sin((t - C.wind) * 4 + xc * 0.3);
      if (fallN && Math.abs(xc) < 9) { const k = P(t, C.fall + Math.abs(xc) * 0.03, 0.9); y -= 9 * EZ.i2(k); tw += 1.2 * k; down = k > 0; }
    }
    if (calm) y = 0.03 * Math.sin(t * 9 + xc);
    if (B > 0) { y = B * (1 + Math.cos(Math.PI * xc / 15)) / 2; rz = Math.atan(-B * Math.PI / 30 * Math.sin(Math.PI * xc / 15)); }
    if (fallS || osc || calm || B > 0) { g.position.y = y; g.rotation.x = tw; g.rotation.z = rz; }
    deckPos.push({ xc, y, tw, down, ok: t >= C.deckS + Math.abs(i - (SEG - 1) / 2) * 0.12 + 0.35 });
  });
  // cabos principais (e cabos de ancoragem depois de n1)
  const L = towerTop(-1, ang), Rt = towerTop(1, ang);
  const low = 4.5 - 6 * (fallS ? EZ.i2(P(t, C.fall0, 1.0)) : 0) - (B > 0 ? 0 : 0);
  const mid = (L.y + Rt.y) / 2 - low;
  const cy = x => { const u = (x - L.x) / (Rt.x - L.x); return lerp(L.y, Rt.y, u) - mid * 4 * u * (1 - u); };
  const anchored = t >= C.cable2;
  const ka = anchored ? EZ.o(P(t, C.cable2, 1.0)) : 0;
  const grow = EZ.o(P(t, C.cables, 1.2));
  R.cablesS.forEach((pool, ci) => {
    const z = ci ? 2.6 : -2.6;
    if (t < C.cables) { drawPoly(pool, [], 0); return; }
    const pts = [];
    if (ka > 0.01) pts.push(V3(lerp(L.x, -29.5, ka), lerp(L.y, BANK_Y + 2.1, ka), z));
    for (let k = 0; k <= 30; k++) { const x = lerp(L.x, Rt.x, k / 30); pts.push(V3(x, cy(x), z)); }
    if (ka > 0.01) pts.push(V3(lerp(Rt.x, 29.5, ka), lerp(Rt.y, BANK_Y + 2.1, ka), z));
    drawPoly(pool, pts, grow);
  });
  // pendurais
  let hk = 0;
  if (t >= C.deckS && ang < 0.25) {
    deckPos.forEach(d => {
      if (!d.ok || d.down) return;
      for (const z of [-2.6, 2.6]) {
        const m = R.hangers.pool[hk++]; if (!m) return;
        const topY = cy(d.xc), botY = BANK_Y + d.y + Math.sin(d.tw) * z * 0.85;
        if (topY - botY < 0.3) { m.visible = false; continue; }
        const a = V3(d.xc, topY, z), b = V3(d.xc, botY, z * 0.85);
        const l = a.distanceTo(b); m.visible = true; m.scale.set(0.05, l, 0.05);
        m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(_up, b.clone().sub(a).normalize());
      }
    });
  }
  for (; hk < R.hangers.pool.length; hk++) R.hangers.pool[hk].visible = false;
  // dentes da junta abrem e fecham
  R.jointDeck.forEach(gd => { if (t > C.teeth + 0.4) gd.position.x += gd.userData.s * 0.22 * Math.sin((t - C.teeth - 0.4) * 2.6); });
}
function updateCars(t) {
  const bump = d => Math.max(0, 1 - Math.abs(d) / 0.18);
  const c = R.jcar;
  c.visible = between(t, C.car0, S('o1') - 0.8);
  if (c.visible) {
    const x = 25 - 6 * (t - C.car0);
    const y = BANK_Y + (x > 15 ? 0.03 : 0) + 0.14 * (bump(x - 0.55 - 15) + bump(x + 0.55 - 15));
    c.position.set(x, y, 0.8); c.rotation.set(0, Math.PI, 0.1 * (bump(x - 0.55 - 15) - bump(x + 0.55 - 15)));
  }
  R.carList.forEach((c, k) => {
    c.visible = t >= C.cars;
    if (!c.visible) return;
    const u = c.userData, dir = u.lane > 0 ? 1 : -1;
    const x0 = ((((t - C.cars) * 7 + u.off) % 80) + 80) % 80 - 40, x = dir > 0 ? x0 : -x0;
    c.position.set(x, BANK_Y + (Math.abs(x) > 15 ? 0.03 : 0), u.lane); c.rotation.y = dir > 0 ? 0 : Math.PI;
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
  sp(C.brk + 0.45, 0, 0, 12, 1);
  sp(C.crack + 0.5, 0, 0, 12, 31);
  sp(C.sink + 0.7, 0, 0, 8, 41);
  sp(C.bonk, 0, -1.6, 8, 51); sp(C.bonk + 0.75, 0, 0, 8, 57);
  sp(C.fall0 + 0.9, -9, 0, 8, 61); sp(C.fall0 + 0.9, 9, 0, 8, 67);
  sp(C.fall + 0.75, 0, 0, 14, 91);
  // erosão: areia girando em volta do pilar do meio
  R.dust.forEach(m => (m.visible = false));
  if (between(t, C.scour0, Math.min(C.rwP.a, C.sink + 1.2))) {
    const k = P(t, C.scour0, 0.5);
    R.dust.forEach((m, i) => {
      const a = (t - C.scour0) * 4 + i * 0.7, r = 1.5 + 0.7 * rnd(i);
      m.visible = true; m.scale.setScalar(0.16 * k);
      m.position.set(Math.cos(a) * r, BED + 0.15 + rnd(i + 3) * 1.3 + 0.2 * Math.sin(t * 3 + i), Math.sin(a) * r);
    });
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
  ctx.fillText('PEÇAS DA PONTE', 418, 1676);
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
  if (!between(wt, S('n2') - 0.2, C.rwN.a)) return;
  const k = EZ.back(P(wt, S('n2') - 0.2, 0.45)), txt = '1940 · TACOMA, EUA';
  ctx.save(); ctx.translate(540, 172); ctx.scale(k, k);
  ctx.font = '700 34px F'; const tw = ctx.measureText(txt).width;
  ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#141824'; ctx.lineWidth = 5;
  rr(-tw / 2 - 26, -26, tw + 52, 52, 26); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#141824'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, 0, 2);
  ctx.restore();
}
function thermometer(x, y, s, hot) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#141824'; ctx.lineWidth = 8;
  rr(-32, -170, 64, 260, 32); ctx.fill(); ctx.stroke(); circ(0, 110, 56); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e63946'; circ(0, 110, 40); ctx.fill();
  const h = 40 + 200 * hot; rr(-16, 100 - h, 32, h, 16); ctx.fill();
  ctx.strokeStyle = '#141824'; ctx.lineWidth = 5; for (let k = 0; k < 6; k++) line(18, -130 + k * 38, 32, -130 + k * 38);
  ctx.restore();
}
function failOverlays(t, wt) {
  // raio-x da fundação
  const xk = between(wt, C.xray0, C.xray1 + 0.4) ? Math.min(P(wt, C.xray0, 0.3), 1 - P(wt, C.xray1, 0.4)) : 0;
  if (xk > 0) {
    ctx.save(); ctx.globalAlpha = xk;
    ctx.fillStyle = 'rgba(40,140,255,.10)'; ctx.fillRect(0, 0, W, H);
    ctx.translate(540, 290); ctx.scale(EZ.back(P(wt, C.xray0, 0.4)), EZ.back(P(wt, C.xray0, 0.4)));
    ctx.fillStyle = '#141824'; rr(-150, -40, 300, 80, 40); ctx.fill();
    ctx.fillStyle = '#7fd3ff'; ctx.font = '700 46px F'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('RAIO-X', 0, 3);
    ctx.restore();
    // camadas
    if (wt > C.rock - 0.6) {
      const k = EZ.back(P(wt, C.rock - 0.6, 0.4));
      ctx.save(); ctx.globalAlpha = xk;
      for (const [txt, v, col] of [['AREIA', V3(-11, BED - 2, 5), '#d9b97c'], ['ROCHA', V3(-11, ROCK - 1.2, 5), '#b8b2aa']]) {
        const [x, y, z] = project(v); if (z > 1) continue;
        ctx.save(); ctx.translate(cl(x, 140, 940), y); ctx.scale(k, k);
        ctx.font = '700 40px F'; const tw = ctx.measureText(txt).width;
        ctx.fillStyle = col; ctx.strokeStyle = '#141824'; ctx.lineWidth = 5; rr(-tw / 2 - 20, -30, tw + 40, 60, 30); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#141824'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, 0, 3); ctx.restore();
      }
      ctx.restore();
    }
  }
  // calor: o aço estica
  if (between(wt, C.heat, C.rwJ.a)) {
    const k = P(wt, C.heat, 0.5);
    ctx.save(); ctx.globalAlpha = 0.22 * k; ctx.fillStyle = '#ff7a1a'; ctx.fillRect(0, 0, W, H); ctx.restore();
    // sol
    const s = EZ.back(P(wt, C.heat, 0.5));
    ctx.save(); ctx.translate(860, 420); ctx.scale(s, s); ctx.rotate(t * 0.8);
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#141824'; ctx.lineWidth = 7;
    for (let i = 0; i < 10; i++) { ctx.save(); ctx.rotate(i * Math.PI / 5); rr(-12, -150, 24, 50, 12); ctx.fill(); ctx.stroke(); ctx.restore(); }
    circ(0, 0, 85); ctx.fill(); ctx.stroke(); ctx.restore();
    thermometer(170, 560, s, P(wt, C.heat + 0.3, 1.2));
    ctx.save(); ctx.globalAlpha = P(wt, C.heat + 0.6, 0.3); bigWord('45°C', 170, 760, 72, '#ff5a3c'); ctx.restore();
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
    word(C.slam, 0.7, V3(0, BANK_Y + 1, 0), 'TUM!', 120, '#ffd23f');
    word(C.brk + 0.4, 1.1, V3(0, 1.5, 0), 'SPLASH!', 130, '#4d9bff');
    word(C.crack, 1.0, V3(0, 3, 0), 'CRACK!', 120, '#ff5a3c');
    word(C.sink + 0.5, 1.0, V3(0, 2, 0), 'CRASH!', 120, '#ff5a3c');
    word(C.bonk, 1.0, V3(0, 5, -2), 'BONK!', 130, '#ffd23f');
    word(C.fall0 + 0.9, 1.0, V3(0, 6, 0), 'CRASH!', 130, '#ff5a3c');
    word(C.fall + 0.8, 1.2, V3(0, 3, 0), 'CRASH!', 140, '#ff5a3c');
    word(C.buckle + 0.5, 1.0, V3(0, 4, 0), 'CREC!', 120, '#ff5a3c');
    word(C.tuque - 0.05, 1.3, V3(15, BANK_Y + 1.2, 0.8), 'TUQUE TUQUE!', 96, '#ffd23f');
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
  scene.background = gradientTex([[0, '#3d7ad6'], [0.6, '#8dbff0'], [1, '#d4ebfb']]);
  sun.position.set(30, 55, 35); sun.target.position.set(0, 0, 0);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -30, near: 1, far: 160 }); sun.shadow.camera.updateProjectionMatrix();
  buildWorld(); buildPlank(); buildBeam(); buildSuspension(); buildParticles();
  R.sand.renderOrder = 1; R.terrain.renderOrder = 2; R.water.renderOrder = 3;
  HOST = makeHost(hostScene);
  const HS = 2.4;
  HOSTW_PLACE = grp(null, 23, groundY(23, 6) + 1.68 * HS, 6); HOSTW_PLACE.scale.setScalar(HS);
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

