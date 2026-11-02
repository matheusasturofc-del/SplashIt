'use strict';
/* Animação do vídeo "Elevador".
 * Tudo é função do tempo t (em segundos): draw(t) desenha um quadro.
 * Os tempos vêm de build/timeline.json (gerado pelo tts.py), então a
 * animação acompanha a narração sozinha.
 */
const W = 1080, H = 1920;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');

// ---------------------------------------------------------------- matemática
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
  el: p => (p <= 0 ? 0 : p >= 1 ? 1 : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * 2 * Math.PI / 3) + 1),
};
const rnd = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function kf(t, keys) { // keys: [tempo, valor, easing do trecho que termina nesta chave]
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
// progresso escalonado da peça i de n (efeito "montando")
function st(p, i, n, span = 0.45) {
  if (n <= 1) return p;
  return cl((p - i * (1 - span) / (n - 1)) / span);
}
// aplica a entrada de uma peça: vem de (dx,dy), girando e crescendo até o lugar
function enterAt(p, px, py, dx, dy, rot = 0, sc = 1) {
  if (p <= 0) return false;
  const e = EZ.back(p);
  ctx.translate(px + (1 - e) * dx, py + (1 - e) * dy);
  if (rot) ctx.rotate((1 - e) * rot);
  if (sc !== 1) { const s = lerp(sc, 1, e); ctx.scale(s, s); }
  ctx.translate(-px, -py);
  ctx.globalAlpha *= cl(p * 3);
  return true;
}
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function circ(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
function line(x0, y0, x1, y1) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }

// ---------------------------------------------------------------- mundo (corte do prédio)
const G = 1500, FH = 250, NF = 5, ROOF = G - NF * FH; // térreo em y=1500, laje do topo em y=250
const BX0 = 130, BX1 = 950, SX0 = 360, SX1 = 700;      // prédio e poço
const CABW = 200, CABH = 200, CABX = 500;
const CWX = 655, CWW = 54, CWH = 170;
const PUL = { x: 577.5, y: 170, r: 77.5 };
const MR = { x0: 300, x1: 880, y0: 70, y1: ROOF };
const MOT = { x0: 670, x1: 780, y0: 135, y1: 215 };
const BRK = { x: 815, y: 175, r: 24 };
const DRUM = { x: 500, y: 175, r: 36 };
const RL = 390, RR = 610, CRL = 621, CRR = 689;
const GOV = { x: 394, y: 205, r: 22 };
const PIT = 1585;
const FOCAL = [540, 830];
const OV = [540, 825, 0.86];

// ---------------------------------------------------------------- linha do tempo
let TL = null;
const LN = {};
const C = {};
const SFX = [], CAPS = [], LABELS = [], REACT = [], CHIPS = [];
const S = id => LN[id].start, E = id => LN[id].end;
function wT(id, w) {
  const l = LN[id]; const tx = l.text.toLowerCase(); const i = tx.indexOf(w.toLowerCase());
  if (i < 0) throw new Error(`palavra "${w}" não está na fala ${id}`);
  return l.start + (i / tx.length) * (l.end - l.start);
}
const sfx = (t, name, gain = 1, d = 0) => SFX.push({ t: +t.toFixed(3), name, gain, d: +d.toFixed(3) });
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

function setup(tl) {
  TL = tl;
  for (const l of tl.lines) LN[l.id] = l;
  computeCues();
  buildCaptions();
}

function computeCues() {
  // ---------- gancho: caixa + corda + motor no alto
  C.cab0 = wT('h1', 'caixa') - 0.15;
  C.rope0 = wT('h1', 'corda') - 0.05;
  C.mot0 = wT('h1', 'motor') - 0.1;
  C.lift0 = S('h2') - 0.2;
  C.burn = wT('h2', 'queimado') + 0.1;
  C.weight = S('h3') + 0.6;
  // ---------- contrapeso
  C.c1x = S('c1') + 0.1;
  C.pul0 = C.c1x + 0.25;
  C.rr0 = wT('c1', 'roda') + 0.1;
  C.cw0 = wT('c2', 'bloco') - 0.15;
  C.cwp0 = C.cw0 + 0.35;
  C.cross = 0; // calculado abaixo
  // ---------- guias
  C.sw0 = S('g1') + 0.15; C.sw1 = E('g1') + 0.3; C.swW = 2 * Math.PI / 1.1;
  C.rl0 = wT('g2', 'trilhos') - 0.2;
  // ---------- cabos
  C.snap = wT('k1', 'arrebenta') + 0.1;
  C.dropK = 1000; C.gK = 2 * C.dropK / (0.85 * 0.85); C.land = C.snap + 0.85;
  C.rwS = Math.max(C.land + 0.5, E('k1') + 0.1); C.rwE = C.rwS + 0.9;
  C.cb0 = wT('k2', 'cabos') - 0.1;
  // ---------- freio
  C.off1 = wT('f1', 'acaba') + 0.1; C.on1 = S('f2') - 0.05;
  C.drift0 = wT('f1', 'lado') - 0.2; C.drift1 = E('f1') + 0.45;
  C.up0 = S('f2') + 0.05;
  C.brk0 = wT('f2', 'freio') - 0.1;
  C.brkE = wT('f2', 'energia');
  C.off2 = wT('f3', 'sem luz') - 0.1; C.clac = C.off2 + 0.08; C.on2 = S('s1') - 0.15;
  // ---------- freio de segurança
  C.s1det = wT('s1', 'soltarem') + 0.05; C.s1frz = C.s1det + 0.5;
  C.s1rwS = S('s2') + 0.05; C.s1rwE = C.s1rwS + 0.6;
  C.gov0 = wT('s2', 'roda') - 0.1;
  C.g0 = wT('s2', 'gira') - 0.3;
  C.d2 = wT('s2', 'rápido') - 0.35;
  C.lock = wT('s2', 'trava') + 0.05;
  C.stop = wT('s3', 'agarram') + 0.25; C.jaw = C.stop - 0.2; C.gDrop = 230;
  C.otis0 = wT('s4', 'elisha') - 0.3; C.otis1 = E('s4') + 0.3;
  // ---------- vista de frente (portas)
  C.fvIn0 = S('p1') - 0.2; C.fvIn1 = S('p1') + 0.2;
  C.fvOut0 = S('e1') - 0.35; C.fvOut1 = S('e1') + 0.05;
  C.reset = S('p1') + 0.5;
  C.po0 = S('p1') + 0.35;
  C.pw0 = S('p1') + 0.6; C.pw1 = wT('p1', 'quase') - 0.1;
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
  // ---------- final
  C.acc = [wT('e1', 'botões'), wT('e1', 'painel'), wT('e1', 'espelho'), wT('e1', 'musiquinha')];
  C.press = S('e2') + 0.2; C.ride0 = S('e2') + 0.45; C.ride1 = C.ride0 + 2.2;
  C.stamp = S('e3') + 0.25;
  C.cta = S('e4') - 0.1;

  // ---------- andar da cabine (0 = térreo)
  const K = [[0, 0]];
  K.push([C.lift0, 0], [C.burn, 0.3, 'io'], [C.burn + 0.35, 0, 'i']);
  K.push([S('c3') + 0.4, 0], [E('c3') + 0.1, 1]);
  const c5a = S('c5') + 0.6, c5b = E('c5');
  K.push([c5a, 1], [c5b, 3]);
  C.cross = (c5a + c5b) / 2;
  C.g3up = wT('g3', 'sobe') - 0.4; K.push([C.g3up, 3], [C.g3up + 1.6, 4]);
  K.push([S('k3') - 0.1, 4], [E('k3') + 0.5, 2]);
  K.push([C.drift0, 2], [C.drift1, 0, 'i']);
  K.push([C.up0, 0], [C.up0 + 1.1, 2]);
  K.push([S('s1') - 0.1, 2], [S('s1') + 0.8, 3]);
  K.push([C.g0, 3], [C.g0 + 1.2, 3.5]);
  K.push([C.reset, 3.5], [C.reset + 0.01, 0, 'lin']);
  K.push([C.ride0, 0], [C.ride1, 4]);
  C.cabKeys = K;

  // ---------- luz do prédio (1 = apagada)
  C.lightKeys = [[0, 0], [C.off1, 0], [C.off1 + 0.12, 1, 'lin'], [C.on1, 1], [C.on1 + 0.3, 0, 'lin'],
    [C.off2, 0], [C.off2 + 0.12, 1, 'lin'], [C.on2, 1], [C.on2 + 0.3, 0, 'lin']];

  // ---------- batidas nas paredes
  C.bangs = [];
  for (let k = 0; k < 20; k++) {
    const tk = C.sw0 + (Math.PI / 2 + k * Math.PI) / C.swW;
    if (tk > C.sw1 + 0.3) break;
    const env = Math.min(P(tk, C.sw0, 0.6), 1 - P(tk, C.sw1, 0.6));
    if (env > 0.55) C.bangs.push({ t: tk, side: k % 2 === 0 ? 1 : -1 });
  }

  // ---------- câmera [x, y, zoom]
  const CK = [[0, OV]];
  CK.push([C.burn - 1.0, OV], [C.burn - 0.3, [590, 215, 1.6]], [S('h3') + 0.1, [590, 215, 1.6]], [S('h3') + 0.8, [520, 1330, 1.25]]);
  CK.push([S('c1') - 0.05, [520, 1330, 1.25]], [S('c1') + 0.5, [580, 270, 1.45]], [C.cw0 + 0.6, [580, 270, 1.45]], [C.cw0 + 1.4, OV]);
  CK.push([S('g1') + 0.05, OV], [S('g1') + 0.6, [530, 650, 1.3]], [E('g1') + 0.3, [530, 650, 1.3]], [S('g2') + 0.4, OV]);
  CK.push([S('k2') - 0.05, OV], [S('k2') + 0.5, [570, 420, 1.25]], [S('k3') + 0.1, [570, 420, 1.25]], [S('k3') + 0.8, OV]);
  CK.push([C.brk0 - 0.6, OV], [C.brk0, [760, 185, 2.0]], [C.off2 + 0.35, [760, 185, 2.0]], [C.off2 + 1.0, OV]);
  CK.push([S('s2') + 0.1, OV], [S('s2') + 0.7, [430, 250, 1.7]], [C.d2 - 0.5, [430, 250, 1.7]], [C.d2 + 0.2, [500, 640, 1.1]]);
  CK.push([C.stop - 0.8, [505, 860, 1.45]], [S('s4') + 0.6, [505, 860, 1.45]], [S('s4') + 1.4, OV]);
  CK.push([E('s4') + 0.05, OV], [C.fvIn1, [362, 905, 2.4]]);
  CK.push([C.fvOut0, [500, 1380, 1.5]], [C.ride0, [500, 1380, 1.5]], [C.ride1, [500, 400, 1.3]], [S('e3') + 0.2, [500, 400, 1.3]], [S('e3') + 0.9, OV]);
  C.camKeys = sortK(CK);

  // ---------- tremidas de câmera
  C.shakes = [[C.burn, 10], [C.burn + 0.35, 8], [C.land, 30], [C.drift1, 16], [C.stop, 12], [C.slam, 12], [C.stamp + 0.18, 20]];
  for (const b of C.bangs) C.shakes.push([b.t, 7]);

  // ---------- porta (vista de frente): 0 fechada, 1 aberta
  C.doorKeys = [[0, 0], [C.po0, 0], [C.po0 + 0.6, 1], [C.pt1 + 0.25, 1], [C.pt1 + 0.85, 0],
    [C.unlock + 0.2, 0], [C.unlock + 0.85, 1],
    [C.cl0, 1], [C.slam, 0.23, 'i2'],
    [C.ro0, 0.23], [C.ro0 + 0.5, 1],
    [C.cl2, 1], [C.h1, 0.58, 'lin'], [C.h1 + 0.05, 0.58], [C.h1 + 0.5, 1],
    [C.cl3, 1], [C.h2, 0.62, 'lin'], [C.h2 + 0.05, 0.62], [C.h2 + 0.5, 1]];
  C.fvFloorKeys = [[0, 4], [C.arr0, 4], [C.arr1, 2]];
  C.personKeys = [[C.pw0, [540, 1760, 1.15]], [C.pw1, [540, 1338, 0.82], 'o'], [C.pt1, [540, 1338, 0.82]],
    [C.pt1 + 0.45, [540, 1450, 0.95]], [C.pout0, [540, 1450, 0.95]], [C.pout0 + 0.9, [-260, 1450, 0.95], 'i2'],
    [C.rw0 - 0.01, [-260, 1450, 0.95]], [C.rw0, [1320, 1450, 0.95], 'lin'], [C.rw0 + 0.8, [560, 1450, 0.95], 'o'],
    [C.rw1, [540, 1338, 0.82]], [C.ro0, [540, 1338, 0.82]], [C.ro0 + 0.6, [540, 1430, 0.92]]];
  C.reachKeys = [[0, 0], [C.cl2, 0], [C.h1 - 0.1, 1], [C.h1 + 0.6, 1], [C.h1 + 1.0, 0],
    [C.cl3, 0], [C.h2 - 0.1, 1], [C.h2 + 0.6, 1], [C.h2 + 1.0, 0]];

  // ---------- reações do mestre de obras
  const R = (t, d, e, p, b) => REACT.push({ t, d, e, p, b });
  R(C.lift0 + 0.2, C.burn - C.lift0 - 0.2, 'worried', 'down', null);
  R(C.burn, 1.8, 'shock', 'cheeks', '!!');
  R(S('c3') + 0.8, 1.6, 'happy', 'thumbs', null);
  if (C.bangs.length) R(C.bangs[0].t, 1.8, 'wince', 'cheeks', 'Opa!');
  R(wT('g3', 'reto'), 1.5, 'happy', 'thumbs', null);
  R(C.snap, C.land - C.snap, 'shock', 'up', 'AAAH!');
  R(C.land, C.rwS - C.land, 'wince', 'cover', null);
  R(C.rwS, 1.0, 'worried', 'down', 'Peraí...');
  R(S('k3') + 0.2, 1.4, 'happy', 'thumbs', null);
  R(C.off1 + 0.1, C.drift1 - C.off1 - 0.2, 'worried', 'down', '?');
  R(C.drift1 - 0.1, 1.3, 'shock', 'cheeks', '!!');
  R(C.clac + 0.3, 1.8, 'relieved', 'wipe', 'Ufa!');
  R(C.s1det, C.s1rwS - C.s1det, 'shock', 'up', '!!!');
  R(C.lock, C.stop - C.lock, 'worried', 'cheeks', null);
  R(C.stop + 0.1, 1.8, 'relieved', 'wipe', 'Ufa!');
  R(C.otis0 + 0.5, 2.2, 'think', 'down', 'Uau!');
  R(C.pt0, C.pt1 - C.pt0 + 0.3, 'shock', 'cover', 'Cuidado!');
  R(wT('p3', 'trava') + 0.3, 1.4, 'happy', 'thumbs', null);
  R(C.slam, 1.4, 'wince', 'cheeks', 'Ai!');
  R(C.h1 + 0.1, 1.2, 'happy', 'thumbs', null);
  R(C.ride1, 0.9, 'happy', 'thumbs', null);
  R(C.stamp + 0.15, 2.4, 'happy', 'cheer', 'Uhuul!');
  R(C.cta, TL.duration - C.cta, 'happy', 'point', null);
  REACT.sort((a, b) => a.t - b.t);

  // ---------- etiquetas com o nome técnico
  const Lb = (txt, t0, t1, sp, at, off) => { LABELS.push({ txt, t0, t1, sp, at, off }); CHIPS.push({ txt, t: t0 }); };
  Lb('CONTRAPESO', wT('c4', 'contrapeso'), nextBeatStart('c4') - 0.3, 'w', t => [CWX + 30, cwTop(t) + CWH / 2], [190, -30]);
  Lb('GUIAS', wT('g3', 'guias'), nextBeatStart('g3') - 0.3, 'w', t => [RL, Math.min(cabTopAt(t) + CABH + 130, G - 20)], [-120, 60]);
  Lb('CABOS DE TRAÇÃO', wT('k3', 'cabos'), nextBeatStart('k3') - 0.2, 'w', t => [497, (PUL.y + cabTopAt(t)) / 2 + 20], [-150, 0]);
  Lb('FREIO', wT('f3', 'freio'), C.off2 + 0.6, 'w', () => [BRK.x, BRK.y + 26], [-20, 105]);
  Lb('FREIO DE SEGURANÇA', wT('s4', 'freio'), E('s4') + 0.2, 'w', t => [392, cabTopAt(t) + CABH - 4], [110, 150]);
  Lb('TRAVA DA PORTA', wT('p3', 'trava'), E('p3') + 0.3, 's', () => [305, 470], [0, 95]);
  Lb('CORTINA DE LUZ', S('r3') + 0.2, E('r3') + 0.4, 's', () => [540, 760], [0, -230]);

  // ---------- efeitos sonoros
  for (let i = 0; i <= NF; i++) sfx(0.02 + i * 0.12 + 0.22, 'pop', 0.45);
  sfx(C.cab0 + 0.25, 'clank', 0.7);
  sfx(C.rope0, 'whoosh', 0.5);
  sfx(C.mot0 + 0.25, 'clank', 0.75);
  sfx(C.lift0, 'strain', 0.6, C.burn - C.lift0);
  sfx(C.burn, 'blowout', 1.0);
  sfx(C.burn + 0.35, 'thud', 0.7);
  sfx(C.c1x, 'whoosh', 0.7);
  asmSfx(C.pul0, 0.7, 3, 'clank', 0.55);
  sfx(C.rr0, 'whoosh', 0.45);
  sfx(C.cw0 + 0.2, 'clank', 0.5);
  for (let i = 0; i < 6; i++) sfx(C.cwp0 + i * 0.22 + 0.2, 'clank', 0.5);
  sfx(S('c3') + 0.4, 'hum', 0.35, E('c3') + 0.1 - S('c3') - 0.4);
  sfx(c5a, 'hum', 0.35, c5b - c5a);
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
  sfx(C.fvIn0, 'whoosh', 0.6);
  sfx(C.po0, 'slide', 0.5, 0.6);
  sfx(C.pt0, 'alarm', 0.5);
  sfx(C.pt1 + 0.25, 'slide', 0.5, 0.6);
  asmSfx(C.lt0, 1.0, 3, 'clank', 0.5);
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
  sfx(C.fvOut0, 'whoosh', 0.6);
  for (const a of C.acc) sfx(a + 0.2, 'pop', 0.6);
  sfx(C.press, 'click', 0.8);
  sfx(C.ride0, 'hum', 0.35, C.ride1 - C.ride0);
  sfx(C.ride1, 'ding', 0.8);
  sfx(C.stamp + 0.18, 'stamp', 1.0);
  sfx(C.stamp + 0.22, 'tada', 0.8);
  sfx(C.cta, 'pop', 0.6);
  SFX.sort((a, b) => a.t - b.t);
}

function sfxEvents() { return SFX; }

// ---------------------------------------------------------------- estado da cena
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
    let d = 0.5 * 1500 * (Math.min(t, C.s1frz) - C.s1det) ** 2;
    if (t > C.s1rwS) d *= 1 - EZ.io(P(t, C.s1rwS, C.s1rwE - C.s1rwS));
    dy += d;
  }
  if (t >= C.d2 && t < C.reset) dy += kf(t, [[C.d2, 0], [C.stop, C.gDrop, 'i2'], [C.stop + 0.25, C.gDrop + 10, 'o']]);
  return dy;
}
const cabTopAt = t => G - cabF(t) * FH - CABH + cabDy(t);
function cwDy(t) {
  let dy = 0;
  if (t >= C.s1det && t < C.s1rwE) {
    let d = 0.5 * 1500 * (Math.min(t, C.s1frz) - C.s1det) ** 2;
    if (t > C.s1rwS) d *= 1 - EZ.io(P(t, C.s1rwS, C.s1rwE - C.s1rwS));
    dy += d;
  }
  if (t >= C.d2 && t < C.reset) dy += 0.5 * 900 * Math.min(t - C.d2, 1.2) ** 2;
  return dy;
}
const cwTop = t => Math.min(300 + 250 * cabF(t) + cwDy(t), G + 50 - CWH);
const detached = t => (t >= C.s1det && t < C.s1rwE - 0.05) || (t >= C.d2 && t < C.reset);
const ropeSnapped = t => t >= C.snap && t < C.rwE - 0.05;
function cabSwing(t) {
  if (t < C.sw0 || t > C.sw1 + 0.6) return { dx: 0, rot: 0, sx: 1 };
  const env = Math.min(P(t, C.sw0, 0.6), 1 - P(t, C.sw1, 0.6));
  const ph = (t - C.sw0) * C.swW;
  return {
    dx: 46 * Math.sin(ph) * env,
    rot: 0.07 * Math.sin(ph + 0.6) * env,
    sx: lerp(1, Math.abs(Math.cos((t - C.sw0) * 2.2)) * 0.7 + 0.3, env),
  };
}
// "susto" das pessoas na cabine (flutuam quando a cabine cai)
function scare(t) {
  let s = 0;
  if (t >= C.snap && t < C.land) s = 1;
  if (t >= C.s1det && t < C.s1rwS) s = 1;
  if (t >= C.d2 && t < C.stop) s = 0.6;
  if (t >= C.drift0 + 0.5 && t < C.drift1) s = 0.5;
  return s;
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
const camAt = t => kf(t, C.camKeys);
function w2s(t, x, y) {
  const c = camAt(t), sh = shakeAt(t);
  return [FOCAL[0] + sh[0] + (x - c[0]) * c[2], FOCAL[1] + sh[1] + (y - c[1]) * c[2]];
}
const fvAlpha = t => kf(t, [[C.fvIn0, 0], [C.fvIn1, 1, 'lin'], [C.fvOut0, 1], [C.fvOut1, 0, 'lin']]);

// ---------------------------------------------------------------- desenho: lado (corte)
function sky(t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#79bff7'); g.addColorStop(0.6, '#cbe8ff'); g.addColorStop(1, '#eef7ff');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  for (let i = 0; i < 6; i++) {
    const y = 200 + i * 210 + rnd(i) * 70, sp = 7 + rnd(i + 9) * 9, s = 0.6 + rnd(i + 5) * 0.6;
    const x = ((rnd(i + 3) * 1500 + t * sp) % 1500) - 220;
    ctx.beginPath();
    ctx.ellipse(x, y, 70 * s, 30 * s, 0, 0, 7);
    ctx.ellipse(x + 48 * s, y - 18 * s, 50 * s, 36 * s, 0, 0, 7);
    ctx.ellipse(x + 98 * s, y, 60 * s, 27 * s, 0, 0, 7);
    ctx.fill();
  }
}
function groundW() {
  ctx.fillStyle = '#8a5a36'; ctx.fillRect(-2000, G + 10, 5200, 1400);
  ctx.fillStyle = '#7a4c2c';
  for (let i = 0; i < 60; i++) { circ(-600 + rnd(i) * 2300, G + 60 + rnd(i + 40) * 500, 5 + rnd(i + 80) * 9); ctx.fill(); }
  ctx.fillStyle = '#76c05a'; ctx.fillRect(-2000, G - 4, 5200, 18);
  // poço continua abaixo do térreo
  ctx.fillStyle = '#3b404b'; ctx.fillRect(SX0, G, SX1 - SX0, PIT - G);
  ctx.fillStyle = '#a3a9b1'; ctx.fillRect(SX0 - 16, PIT, SX1 - SX0 + 32, 16);
  ctx.fillRect(SX0 - 16, G, 16, PIT - G); ctx.fillRect(SX1, G, 16, PIT - G);
}
function lamp(x, y, t) {
  const on = 1 - dark(t);
  if (on > 0.01) {
    const g = ctx.createRadialGradient(x, y + 10, 4, x, y + 10, 120);
    g.addColorStop(0, `rgba(255,236,170,${0.55 * on})`); g.addColorStop(1, 'rgba(255,236,170,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 120, y - 10, 240, 160);
  }
  ctx.strokeStyle = '#6b6b6b'; ctx.lineWidth = 3; line(x, y - 10, x, y + 4);
  ctx.fillStyle = on > 0.5 ? '#fff2b3' : '#8d8d8d';
  ctx.beginPath(); ctx.moveTo(x - 20, y + 16); ctx.lineTo(x + 20, y + 16); ctx.lineTo(x + 10, y + 2); ctx.lineTo(x - 10, y + 2); ctx.fill();
}
function plant(x, y) {
  ctx.fillStyle = '#c0703c'; ctx.beginPath(); ctx.moveTo(x - 16, y - 8); ctx.lineTo(x + 16, y - 8); ctx.lineTo(x + 11, y - 40); ctx.lineTo(x - 11, y - 40); ctx.fill();
  ctx.fillStyle = '#3f9a4a';
  for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.ellipse(x + (k - 2) * 9, y - 62 - (k % 2) * 10, 9, 24, (k - 2) * 0.35, 0, 7); ctx.fill(); }
}
function callLit(t, i) {
  if (t >= C.acc[0] && t < C.ride1 + 0.3 && i === 0) return true;
  return false;
}
function floorBlock(i, t) {
  const y1 = G - i * FH, y0 = y1 - FH;
  ctx.fillStyle = '#fbf3e6'; ctx.fillRect(BX0, y0, SX0 - BX0, FH); ctx.fillRect(SX1, y0, BX1 - SX1, FH);
  ctx.fillStyle = '#efe0c8'; ctx.fillRect(BX0, y1 - 46, SX0 - BX0, 46); ctx.fillRect(SX1, y1 - 46, BX1 - SX1, 46);
  const sg = ctx.createLinearGradient(SX0, 0, SX1, 0);
  sg.addColorStop(0, '#454b57'); sg.addColorStop(0.5, '#59606e'); sg.addColorStop(1, '#454b57');
  ctx.fillStyle = sg; ctx.fillRect(SX0, y0, SX1 - SX0, FH);
  // número do andar
  ctx.fillStyle = 'rgba(120,96,70,.28)'; ctx.font = '700 64px F'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(i === 0 ? 'T' : String(i), BX0 + 150, y0 + 105);
  lamp(BX0 + 110, y0 + 14, t); lamp(SX1 + 125, y0 + 14, t);
  // quadro
  ctx.fillStyle = '#c98b5a'; rr(SX1 + 140, y0 + 78, 74, 54, 6); ctx.fill();
  ctx.fillStyle = ['#9fd3f5', '#f5b59f', '#b5e3a1', '#f3dd8b', '#c7b5f0'][i]; ctx.fillRect(SX1 + 148, y0 + 86, 58, 38);
  plant(BX0 + 42, y1 - 8);
  // porta do andar + botão de chamada
  ctx.fillStyle = '#8c96a6'; ctx.fillRect(SX0 - 14, y1 - 192, 14, 184);
  ctx.fillStyle = '#5f6876'; ctx.fillRect(SX0 - 18, y1 - 198, 22, 8);
  ctx.fillStyle = '#3a3f4a'; rr(SX0 - 48, y1 - 124, 18, 34, 5); ctx.fill();
  ctx.fillStyle = callLit(t, i) ? '#ffd84a' : '#cfd6e0'; circ(SX0 - 39, y1 - 107, 5.5); ctx.fill();
  // laje e paredes externas
  ctx.fillStyle = '#a3a9b1'; ctx.fillRect(BX0 - 12, y1 - 8, SX0 - BX0 + 12, 16); ctx.fillRect(SX1, y1 - 8, BX1 - SX1 + 12, 16);
  ctx.fillStyle = '#c9b79f'; ctx.fillRect(BX0 - 12, y0, 12, FH); ctx.fillRect(BX1, y0, 12, FH);
}
function machineRoom() {
  ctx.fillStyle = '#ebe3d2'; ctx.fillRect(MR.x0, MR.y0, MR.x1 - MR.x0, MR.y1 - MR.y0);
  ctx.fillStyle = '#c9b79f'; ctx.fillRect(MR.x0 - 12, MR.y0, 12, MR.y1 - MR.y0); ctx.fillRect(MR.x1, MR.y0, 12, MR.y1 - MR.y0);
  ctx.fillStyle = '#a3a9b1'; ctx.fillRect(MR.x0 - 18, MR.y0 - 14, MR.x1 - MR.x0 + 36, 16);
  ctx.fillRect(BX0 - 16, ROOF - 8, BX1 - BX0 + 32, 16);
  ctx.fillStyle = 'rgba(90,75,60,.45)'; ctx.font = '600 20px F'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('CASA DE MÁQUINAS', MR.x0 + 14, MR.y0 + 32);
  // parapeito do terraço
  ctx.strokeStyle = '#8a8f96'; ctx.lineWidth = 4;
  for (const [a, b] of [[BX0 - 10, MR.x0 - 14], [MR.x1 + 14, BX1 + 10]]) {
    line(a, ROOF - 50, b, ROOF - 50);
    for (let x = a; x <= b; x += 28) line(x, ROOF - 50, x, ROOF - 8);
  }
}
function building(t) {
  for (let i = 0; i < NF; i++) {
    const p = P(t, 0.02 + i * 0.12, 0.45);
    ctx.save(); if (enterAt(p, 540, G - i * FH - FH / 2, 0, -150, 0, 0.9)) floorBlock(i, t); ctx.restore();
  }
  const pm = P(t, 0.02 + NF * 0.12, 0.5);
  ctx.save(); if (enterAt(pm, 590, 160, 0, -170, 0, 0.8)) machineRoom(); ctx.restore();
}
function railsW(t) {
  const p = P(t, C.rl0, 1.6); if (p <= 0) return;
  const xs = [RL, RR, CRL, CRR], n = 7, seg = (PIT - ROOF) / n;
  for (let k = 0; k < n; k++) {
    const q = st(p, k, n, 0.35);
    for (let j = 0; j < 4; j++) {
      const x = xs[j], y0 = PIT - (k + 1) * seg;
      ctx.save();
      if (enterAt(q, x, y0 + seg / 2, j % 2 ? 70 : -70, 30, 0, 1)) {
        ctx.fillStyle = '#c3cbd6'; ctx.fillRect(x - 4, y0, 8, seg + 1);
        ctx.fillStyle = '#8994a5'; ctx.fillRect(x + 1.5, y0, 2.5, seg + 1);
        ctx.fillStyle = '#6f7887';
        if (j === 0) ctx.fillRect(SX0, y0 + 30, x - SX0, 7);
        if (j === 3) ctx.fillRect(x, y0 + 30, SX1 - x, 7);
        if (j === 1 || j === 2) ctx.fillRect(Math.min(RR, CRL) - 2, y0 + 30, Math.abs(CRL - RR) + 4, 5);
        circ(x, y0 + 33, 3); ctx.fillStyle = '#e8edf3'; ctx.fill();
      }
      ctx.restore();
    }
  }
}
function governorW(t) {
  const p = P(t, C.gov0, 1.4); if (p <= 0) return;
  const top = cabTopAt(t);
  const disp = t < C.lock ? top : cabTopAtLock();
  // corda do limitador (laço)
  ctx.save(); if (enterAt(st(p, 2, 5), GOV.x, 900, -60, 0, 0, 1)) {
    ctx.strokeStyle = '#2a2d33'; ctx.lineWidth = 3;
    line(GOV.x - GOV.r, GOV.y, GOV.x - GOV.r, PIT - 30); line(GOV.x + GOV.r, GOV.y, GOV.x + GOV.r, PIT - 30);
    ctx.fillStyle = '#ffcf3a';
    for (let k = 0; k < 40; k++) {
      const y = ((k * 60 - disp) % 2400 + 2400) % 2400 + GOV.y - 600;
      if (y > GOV.y && y < PIT - 30) ctx.fillRect(GOV.x - GOV.r - 3, y, 6, 8);
    }
  } ctx.restore();
  // roda de baixo (tensora)
  ctx.save(); if (enterAt(st(p, 1, 5), GOV.x, PIT - 30, 0, 80, 1.5, 0.3)) wheel(GOV.x, PIT - 30, GOV.r, -top / GOV.r * (t < C.lock ? 1 : 0), '#59606e'); ctx.restore();
  // roda de cima (limitador)
  ctx.save(); if (enterAt(st(p, 0, 5), GOV.x, GOV.y, 0, -80, 1.5, 0.3)) {
    ctx.fillStyle = '#7d858f'; ctx.beginPath(); ctx.moveTo(GOV.x - 16, ROOF - 8); ctx.lineTo(GOV.x + 16, ROOF - 8); ctx.lineTo(GOV.x + 5, GOV.y); ctx.lineTo(GOV.x - 5, GOV.y); ctx.fill();
    const locked = t >= C.lock && t < C.reset;
    const ang = -disp / GOV.r;
    wheel(GOV.x, GOV.y, GOV.r, ang, locked ? '#d64545' : '#e0a019');
    // pesos centrífugos
    const vel = Math.abs(cabTopAt(t + 0.02) - top) / 0.02;
    const out = cl(vel / 600) * 8;
    ctx.fillStyle = '#333';
    for (const s of [1, -1]) { circ(GOV.x + Math.cos(ang) * (6 + out) * s, GOV.y + Math.sin(ang) * (6 + out) * s, 4.5); ctx.fill(); }
    if (locked) {
      const k = P(t, C.lock, 0.15);
      ctx.strokeStyle = `rgba(255,70,70,${0.8 * (1 - P(t, C.lock + 0.6, 0.5))})`; ctx.lineWidth = 5;
      circ(GOV.x, GOV.y, GOV.r + 8 + 14 * k); ctx.stroke();
    }
  } ctx.restore();
}
let _lockTop = null;
function cabTopAtLock() { if (_lockTop === null) _lockTop = cabTopAt(C.lock); return _lockTop; }
function wheel(x, y, r, ang, col) {
  ctx.fillStyle = '#2f343c'; circ(x, y, r); ctx.fill();
  ctx.fillStyle = col; circ(x, y, r - 5); ctx.fill();
  ctx.strokeStyle = '#2f343c'; ctx.lineWidth = Math.max(3, r * 0.12);
  for (let k = 0; k < 5; k++) { const a = ang + k * Math.PI * 2 / 5; line(x, y, x + Math.cos(a) * (r - 5), y + Math.sin(a) * (r - 5)); }
  ctx.fillStyle = '#dfe4ea'; circ(x, y, Math.max(4, r * 0.2)); ctx.fill();
}
function counterweightW(t) {
  const p = P(t, C.cw0, 0.45); if (p <= 0) return;
  const top = cwTop(t), x0 = CWX - CWW / 2;
  ctx.save(); if (enterAt(p, CWX, top + CWH / 2, 0, -120, 0, 0.6)) {
    ctx.fillStyle = '#2d333d'; rr(x0 - 5, top, CWW + 10, CWH, 6); ctx.fill();
    ctx.fillStyle = '#2d333d'; ctx.fillRect(CWX - 3, top - 18, 6, 18);
    for (let i = 0; i < 6; i++) {
      const q = P(t, C.cwp0 + i * 0.22, 0.35); if (q <= 0) continue;
      const py = top + CWH - 10 - (i + 1) * 25;
      const yy = lerp(py - 260, py, EZ.back(q));
      ctx.globalAlpha = cl(q * 3);
      const g = ctx.createLinearGradient(x0, 0, x0 + CWW, 0); g.addColorStop(0, '#6d7787'); g.addColorStop(0.5, '#9aa4b3'); g.addColorStop(1, '#6d7787');
      ctx.fillStyle = g; rr(x0, yy, CWW, 22, 4); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (t > C.rl0 + 1.4) { ctx.fillStyle = '#ffb02e'; for (const yy of [top + 8, top + CWH - 22]) { ctx.fillRect(CRL - 2, yy, 8, 14); ctx.fillRect(CRR - 6, yy, 8, 14); } }
  } ctx.restore();
}
function personSide(x, footY, col, hair, k, t) {
  const fl = k * (12 + 8 * Math.sin(t * 20 + x));
  ctx.fillStyle = col; rr(x - 15, footY - 62 - fl, 30, 58, 11); ctx.fill();
  ctx.fillStyle = '#2f3a52'; ctx.fillRect(x - 11, footY - 12 - fl, 9, 12); ctx.fillRect(x + 2, footY - 12 - fl, 9, 12);
  ctx.fillStyle = '#f2c29b'; circ(x, footY - 80 - fl, 17); ctx.fill();
  ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(x, footY - 84 - fl, 17, Math.PI, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = '#222'; circ(x - 6, footY - 80 - fl, 2.4); ctx.fill(); circ(x + 6, footY - 80 - fl, 2.4); ctx.fill();
  if (k > 0.3) { ctx.fillStyle = '#5a1e1e'; ctx.beginPath(); ctx.ellipse(x, footY - 71 - fl, 4, 5.5, 0, 0, 7); ctx.fill(); }
  else { ctx.strokeStyle = '#5a1e1e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, footY - 74 - fl, 5, 0.2, Math.PI - 0.2); ctx.stroke(); }
  ctx.strokeStyle = col; ctx.lineWidth = 8; ctx.lineCap = 'round';
  if (k > 0.3) { line(x - 13, footY - 56 - fl, x - 22, footY - 92 - fl); line(x + 13, footY - 56 - fl, x + 22, footY - 92 - fl); }
  else { line(x - 13, footY - 56 - fl, x - 16, footY - 26 - fl); line(x + 13, footY - 56 - fl, x + 16, footY - 26 - fl); }
}
function cabinW(t) {
  const p = P(t, C.cab0, 0.6); if (p <= 0) return;
  const top = cabTopAt(t), sw = cabSwing(t);
  const landK = (t >= C.land && t < C.land + 0.3) ? Math.sin(P(t, C.land, 0.3) * Math.PI) : 0;
  const dk = dark(t);
  ctx.save();
  enterAt(p, CABX, top + CABH / 2, 0, -260, 0, 0.5);
  ctx.translate(CABX + sw.dx, top);
  ctx.rotate(sw.rot);
  ctx.translate(0, CABH);
  ctx.scale(sw.sx * (1 + 0.08 * landK), 1 - 0.1 * landK);
  ctx.translate(0, -CABH);
  // trave superior + gancho
  ctx.fillStyle = '#2f343c'; ctx.fillRect(-100, -14, 200, 14); ctx.fillRect(-5, -26, 10, 14);
  // corpo
  ctx.fillStyle = '#3f6fae'; rr(-100, 0, 200, 200, 10); ctx.fill();
  const ig = ctx.createLinearGradient(0, 12, 0, 188);
  ig.addColorStop(0, dk > 0.5 ? '#3a3d48' : '#fff6dc'); ig.addColorStop(1, dk > 0.5 ? '#2b2d36' : '#f2deb0');
  ctx.fillStyle = ig; rr(-88, 12, 176, 176, 6); ctx.fill();
  if (dk > 0.5) { ctx.fillStyle = 'rgba(255,90,60,.8)'; circ(0, 22, 5); ctx.fill(); }
  else { ctx.fillStyle = '#fffbe8'; rr(-40, 13, 80, 6, 3); ctx.fill(); }
  // espelho (final)
  const pm = P(t, C.acc[2], 0.45);
  ctx.save(); if (enterAt(pm, -30, 90, 0, -40, 0, 0.3)) {
    ctx.fillStyle = '#bfe3f7'; rr(-62, 40, 64, 96, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 4; line(-50, 70, -30, 50); line(-48, 92, -18, 62);
  } ctx.restore();
  // painel de botões (final)
  const pp = P(t, C.acc[1], 0.45);
  ctx.save(); if (enterAt(pp, 70, 100, 40, 0, 0, 0.3)) {
    ctx.fillStyle = '#c8ced8'; rr(60, 60, 20, 84, 5); ctx.fill();
    for (let k = 0; k < 5; k++) {
      const lit = t >= C.press && t < C.ride1 + 0.2 && k === 0;
      ctx.fillStyle = lit ? '#ffd84a' : '#5d6675'; circ(70, 132 - k * 15, 4.5); ctx.fill();
    }
  } ctx.restore();
  // corrimão
  ctx.strokeStyle = '#b08b5a'; ctx.lineWidth = 5; line(-86, 120, 86, 120);
  // pessoas
  const k = scare(t);
  personSide(-45, 188, '#e76f51', '#3b2a20', k, t);
  personSide(5, 188, '#2a9d8f', '#d9a441', k, t + 1);
  personSide(45, 188, '#8e5bd1', '#1f1f1f', k, t + 2);
  // piso
  ctx.fillStyle = '#2f343c'; ctx.fillRect(-100, 188, 200, 14);
  // sapatas de guia
  if (t > C.rl0 + 1.4) {
    const q = P(t, C.rl0 + 1.4, 0.3);
    ctx.save(); ctx.globalAlpha *= q; ctx.fillStyle = '#ffb02e';
    for (const y of [6, 172]) { ctx.fillRect(-114, y, 14, 18); ctx.fillRect(100, y, 14, 18); }
    ctx.restore();
  }
  // garras do freio de segurança + alavanca
  const pg = P(t, C.gov0 + 0.9, 0.5);
  if (pg > 0) {
    const eng = (t >= C.jaw && t < C.reset) ? EZ.o(P(t, C.jaw, 0.2)) : 0;
    ctx.save(); ctx.globalAlpha *= cl(pg * 3);
    for (const s of [-1, 1]) {
      const x = s * 110;
      ctx.fillStyle = eng > 0.5 ? '#ff5a3c' : '#d6402b';
      ctx.beginPath(); ctx.moveTo(x - 12 * s, 182 - 14 * eng); ctx.lineTo(x - 2 * s, 182 - 14 * eng); ctx.lineTo(x - 2 * s, 212 - 14 * eng); ctx.lineTo(x - 18 * s, 212 - 14 * eng); ctx.fill();
    }
    // alavanca ligada à corda do limitador
    const lev = (t >= C.lock && t < C.reset) ? cl((cabTopAt(t) - cabTopAtLock()) / 60) : 0;
    ctx.strokeStyle = '#d6402b'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    const lx = -100, ly = 30;
    const ex = GOV.x - GOV.r - CABX, ey = 30 - 26 * lev;
    line(lx, ly, ex, ey);
    ctx.lineWidth = 3; line(-104, 34, -104, 186);
    ctx.restore();
  }
  ctx.restore();
}
function ropePath(t, off) {
  // da cabine sobe até a polia, passa por cima e desce até o contrapeso
  const top = cabTopAt(t), sw = cabSwing(t);
  const cx = CABX + sw.dx, cy = top - 26;
  const r = PUL.r + off;
  const lx = PUL.x - r, rx = PUL.x + r;
  const cwy = cwTop(t) - 18;
  const L = (cy - PUL.y) + Math.PI * r + (cwy - PUL.y);
  ctx.beginPath(); ctx.moveTo(cx + off * 0, cy); ctx.lineTo(lx, PUL.y);
  ctx.arc(PUL.x, PUL.y, r, Math.PI, 2 * Math.PI); ctx.lineTo(rx, cwy);
  return L;
}
function ropesW(t) {
  const top = cabTopAt(t), sw = cabSwing(t);
  const cx = CABX + sw.dx, cy = top - 26;
  ctx.lineCap = 'round';
  // fase 1: tambor
  if (t < C.c1x + 0.6) {
    const gp = P(t, C.rope0, 0.5);
    if (gp > 0) {
      ctx.strokeStyle = '#9b6a3c'; ctx.lineWidth = 7;
      line(DRUM.x, DRUM.y + DRUM.r, DRUM.x, lerp(DRUM.y + DRUM.r, cy, EZ.o(gp)));
    }
    return;
  }
  // fase 2: corda única sobre a polia
  const cableP = P(t, C.cb0, 1.8);
  const ropeA = 1 - P(t, C.cb0 + 0.2, 0.6);
  if (ropeA > 0 && !detached(t)) {
    ctx.save(); ctx.globalAlpha *= ropeA; ctx.strokeStyle = '#9b6a3c'; ctx.lineWidth = 7;
    if (ropeSnapped(t)) {
      const rec = t - C.snap;
      const endY = (cabTopAtSnap() - 60) - 90 * EZ.o(cl(rec / 0.3)) + 12 * Math.sin(rec * 18) * Math.exp(-rec * 4);
      ctx.beginPath(); ctx.moveTo(PUL.x - PUL.r, endY); ctx.lineTo(PUL.x - PUL.r, PUL.y);
      ctx.arc(PUL.x, PUL.y, PUL.r, Math.PI, 2 * Math.PI); ctx.lineTo(PUL.x + PUL.r, cwTop(t) - 18); ctx.stroke();
      line(cx, cy, cx, cy - 34);
    } else {
      const grow = P(t, C.rr0, 0.7);
      const L = ropePath(t, 0);
      const lenA = (cy - PUL.y) + Math.PI * PUL.r * EZ.o(grow) + (cwTop(t) - 18 - PUL.y) * EZ.o(P(t, C.rr0 + 0.4, 0.5));
      ctx.setLineDash([lenA, L * 2]); ctx.stroke(); ctx.setLineDash([]);
      // fio esgarçando antes de arrebentar
      if (t > C.snap - 0.8 && t < C.snap) {
        const k = P(t, C.snap - 0.8, 0.8);
        ctx.strokeStyle = `rgba(255,60,40,${0.4 + 0.6 * Math.abs(Math.sin(t * 30))})`; ctx.lineWidth = 7 - 4 * k;
        line(cx, cy - 40, cx, cy - 80);
      }
    }
    ctx.restore();
  }
  // cabos de aço
  if (cableP > 0) {
    if (detached(t)) {
      ctx.strokeStyle = '#7b8594'; ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        const o = (i - 2) * 5;
        ctx.beginPath(); ctx.moveTo(cx + o, cy);
        for (let s = 1; s <= 8; s++) ctx.lineTo(cx + o + Math.sin(s * 1.3 + t * 9 + i) * 8, cy - s * 18);
        ctx.stroke();
        const wy = cwTop(t) - 18;
        ctx.beginPath(); ctx.moveTo(PUL.x + PUL.r + o, wy);
        for (let s = 1; s <= 6; s++) ctx.lineTo(PUL.x + PUL.r + o + Math.sin(s * 1.5 + t * 8 + i) * 7, wy - s * 18);
        ctx.stroke();
      }
    } else {
      for (let i = 0; i < 5; i++) {
        const q = st(cableP, i, 5, 0.4); if (q <= 0) continue;
        const o = (i - 2) * 4;
        ctx.strokeStyle = i % 2 ? '#8792a2' : '#a9b3c1'; ctx.lineWidth = 3;
        const L = ropePath(t, o);
        ctx.setLineDash([L * EZ.o(q), L * 2]); ctx.stroke(); ctx.setLineDash([]);
      }
    }
  }
}
let _snapTop = null;
function cabTopAtSnap() { if (_snapTop === null) _snapTop = cabTopAt(C.snap - 0.001); return _snapTop; }
function topMachinesW(t) {
  // fase 1: tambor + motor pequeno
  if (t < C.c1x + 0.7) {
    const p = P(t, C.mot0, 0.6);
    const out = P(t, C.c1x, 0.6);
    if (p > 0) {
      ctx.save();
      if (out > 0) { ctx.translate(-300 * EZ.i2(out), -260 * EZ.i2(out)); ctx.rotate(-1.2 * out); ctx.globalAlpha *= 1 - out; }
      const strain = t > C.lift0 && t < C.burn ? P(t, C.lift0, C.burn - C.lift0) : 0;
      const burned = t >= C.burn;
      const sh = strain * 3 * Math.sin(t * 70);
      enterAt(p, 560, 175, 120, -120, 0.8, 0.3);
      // tambor
      wheel(DRUM.x, DRUM.y, DRUM.r, -cabTopAt(t) / DRUM.r, '#9b6a3c');
      ctx.fillStyle = '#5f6672'; ctx.fillRect(DRUM.x, DRUM.y - 6, 70, 12);
      // motor
      ctx.translate(sh, 0);
      ctx.fillStyle = burned ? '#3a2e2e' : `rgb(${lerp(70, 220, strain)},${lerp(130, 70, strain)},${lerp(95, 60, strain)})`;
      rr(565, 138, 105, 74, 12); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 3;
      for (let x = 580; x < 660; x += 14) line(x, 146, x, 204);
      ctx.restore();
      // fumaça
      if (burned) smoke(t, C.burn, 615, 140, 18);
    }
    return;
  }
  // fase 2: polia + motor + freio
  const pp = P(t, C.pul0, 0.7);
  if (pp > 0) {
    const ang = -(G - cabF(t) * FH - CABH) / PUL.r;
    // suporte
    ctx.save(); if (enterAt(st(pp, 0, 3), PUL.x, 220, 0, 60, 0, 1)) {
      ctx.fillStyle = '#7d858f'; ctx.beginPath(); ctx.moveTo(PUL.x - 40, ROOF - 8); ctx.lineTo(PUL.x + 40, ROOF - 8); ctx.lineTo(PUL.x + 10, PUL.y); ctx.lineTo(PUL.x - 10, PUL.y); ctx.fill();
    } ctx.restore();
    // motor
    ctx.save(); if (enterAt(st(pp, 2, 3), 725, 175, 140, 0, 0, 0.4)) {
      ctx.fillStyle = '#5f6672'; ctx.fillRect(PUL.x, PUL.y - 6, MOT.x0 - PUL.x, 12);
      const on = 1 - dark(t);
      ctx.fillStyle = '#3f8a62'; rr(MOT.x0, MOT.y0, MOT.x1 - MOT.x0, MOT.y1 - MOT.y0, 12); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 3;
      for (let x = MOT.x0 + 14; x < MOT.x1 - 8; x += 14) line(x, MOT.y0 + 8, x, MOT.y1 - 8);
      ctx.fillStyle = on > 0.5 ? '#7dff9a' : '#ff5a4a'; circ(MOT.x1 - 16, MOT.y0 + 14, 6); ctx.fill();
    } ctx.restore();
    // polia
    ctx.save(); if (enterAt(st(pp, 1, 3), PUL.x, PUL.y, 0, -120, 2.5, 0.2)) {
      wheel(PUL.x, PUL.y, PUL.r, ang, '#e0a019');
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2; circ(PUL.x, PUL.y, PUL.r - 10); ctx.stroke();
    } ctx.restore();
  }
  brakeW(t);
}
function brakeW(t) {
  const p = P(t, C.brk0, 1.2); if (p <= 0) return;
  const closed = t < C.brkE ? 1 : Math.max(1 - EZ.o(P(t, C.brkE, 0.3)), (t >= C.off2 && t < C.on2 + 0.2) ? EZ.o(P(t, C.off2 + 0.02, 0.08)) : 0, t >= C.off1 && t < C.on1 ? 1 : 0);
  const gap = 12 * (1 - closed);
  // tambor do freio
  ctx.save(); if (enterAt(st(p, 0, 5), BRK.x, BRK.y, 60, 0, 0, 0.4)) {
    ctx.fillStyle = '#5f6672'; ctx.fillRect(MOT.x1, BRK.y - 6, BRK.x - MOT.x1, 12);
    wheel(BRK.x, BRK.y, BRK.r, -(G - cabF(t) * FH) / BRK.r, '#c4ccd6');
  } ctx.restore();
  // sapatas
  for (const [i, s] of [[1, -1], [2, 1]]) {
    ctx.save(); if (enterAt(st(p, i, 5), BRK.x + s * 40, BRK.y, s * 90, 0, 0, 1)) {
      ctx.fillStyle = '#d6402b';
      const x = BRK.x + s * (BRK.r + 4 + gap);
      rr(s < 0 ? x - 12 : x, BRK.y - 26, 12, 52, 4); ctx.fill();
      ctx.fillStyle = '#5a4a3a'; ctx.fillRect(s < 0 ? x - 2 : x, BRK.y - 22, 3, 44);
      ctx.strokeStyle = '#8a929c'; ctx.lineWidth = 4; line(x + (s < 0 ? -6 : 6), BRK.y - 26, x + (s < 0 ? -6 : 6), BRK.y - 52);
    } ctx.restore();
  }
  // molas + eletroímã
  ctx.save(); if (enterAt(st(p, 3, 5), BRK.x, BRK.y - 60, 0, -70, 0, 1)) {
    ctx.strokeStyle = '#2f343c'; ctx.lineWidth = 3;
    for (const s of [-1, 1]) {
      const x = BRK.x + s * (BRK.r + 10 + gap);
      ctx.beginPath(); ctx.moveTo(x, BRK.y - 52);
      for (let k = 1; k <= 6; k++) ctx.lineTo(x + (k % 2 ? 7 : -7) * -s, BRK.y - 52 - k * 4);
      ctx.stroke();
    }
    ctx.fillStyle = '#5f6672'; ctx.fillRect(BRK.x - 54, BRK.y - 82, 108, 8);
  } ctx.restore();
  ctx.save(); if (enterAt(st(p, 4, 5), BRK.x, BRK.y - 100, 0, -60, 0, 0.3)) {
    const ener = 1 - closed;
    ctx.fillStyle = '#394150'; rr(BRK.x - 26, BRK.y - 112, 52, 30, 6); ctx.fill();
    ctx.strokeStyle = '#d98b2b'; ctx.lineWidth = 3;
    for (let k = 0; k < 4; k++) line(BRK.x - 18 + k * 12, BRK.y - 108, BRK.x - 18 + k * 12, BRK.y - 86);
    if (ener > 0.3) {
      ctx.fillStyle = `rgba(255,220,60,${ener})`;
      ctx.beginPath(); ctx.moveTo(BRK.x + 30, BRK.y - 128); ctx.lineTo(BRK.x + 22, BRK.y - 104); ctx.lineTo(BRK.x + 32, BRK.y - 104);
      ctx.lineTo(BRK.x + 24, BRK.y - 80); ctx.lineTo(BRK.x + 44, BRK.y - 110); ctx.lineTo(BRK.x + 34, BRK.y - 110); ctx.lineTo(BRK.x + 42, BRK.y - 128); ctx.fill();
    }
  } ctx.restore();
  // "CLAC!"
  if (t >= C.clac && t < C.clac + 1.0) {
    const k = P(t, C.clac, 0.25);
    ctx.save(); ctx.translate(BRK.x + 4, BRK.y + 62); ctx.scale(EZ.back(k), EZ.back(k)); ctx.rotate(-0.12);
    ctx.globalAlpha *= 1 - P(t, C.clac + 0.7, 0.3);
    bigWord('CLAC!', 0, 0, 34, '#ffd23f');
    ctx.restore();
  }
}
function smoke(t, t0, x, y, n) {
  for (let i = 0; i < n; i++) {
    const life = 1.6 + rnd(i) * 0.8;
    const age = ((t - t0 - i * 0.07) % life + life) % life;
    if (t - t0 - i * 0.07 < 0) continue;
    const k = age / life;
    ctx.fillStyle = `rgba(70,70,75,${0.55 * (1 - k)})`;
    circ(x + (rnd(i + 3) - 0.5) * 50 + k * 30, y - k * 150, 10 + k * 28); ctx.fill();
  }
}
function burst(t, t0, x, y, n, col, spd = 260, life = 0.6, seed = 0) {
  const a = t - t0; if (a < 0 || a > life) return;
  const k = a / life;
  ctx.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const ang = rnd(i + seed) * Math.PI * 2, v = spd * (0.4 + rnd(i + seed + 50) * 0.8);
    const px = x + Math.cos(ang) * v * a, py = y + Math.sin(ang) * v * a + 300 * a * a;
    ctx.globalAlpha = 1 - k; circ(px, py, 3 + 3 * (1 - k)); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function effectsW(t) {
  // batidas na parede
  for (const b of C.bangs) {
    const top = cabTopAt(b.t);
    const x = b.side < 0 ? SX0 + 4 : CRL - 6;
    burst(t, b.t, x, top + 100, 12, '#ffe066', 320, 0.4, b.t * 10);
    if (t > b.t && t < b.t + 0.45) {
      const k = P(t, b.t, 0.45);
      ctx.save(); ctx.translate(x + b.side * 40, top + 60); ctx.scale(EZ.back(cl(k * 2)), EZ.back(cl(k * 2))); ctx.globalAlpha *= 1 - k;
      bigWord('PÁ!', 0, 0, 30, '#ffffff'); ctx.restore();
    }
  }
  // queda: poeira
  burst(t, C.land, CABX - 90, G - 5, 22, 'rgba(160,130,100,1)', 360, 0.9, 7);
  burst(t, C.land, CABX + 90, G - 5, 22, 'rgba(160,130,100,1)', 360, 0.9, 33);
  burst(t, C.drift1, CABX, G - 5, 16, 'rgba(160,130,100,1)', 260, 0.7, 77);
  // garras agarrando os trilhos: faíscas
  if (t >= C.jaw && t < C.stop + 0.3) {
    const y = cabTopAt(t) + CABH;
    for (let j = 0; j < 3; j++) {
      burst(t, C.jaw + j * 0.12, RL, y, 10, '#ffcf3a', 300, 0.35, 100 + j * 20);
      burst(t, C.jaw + j * 0.12, RR, y, 10, '#ffcf3a', 300, 0.35, 160 + j * 20);
    }
  }
  // cruzando com o contrapeso
  if (t > C.cross - 0.6 && t < C.cross + 0.8) {
    const k = P(t, C.cross - 0.6, 1.4);
    ctx.save(); ctx.globalAlpha *= Math.sin(k * Math.PI);
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 6; ctx.setLineDash([14, 10]);
    const y = (cabTopAt(t) + CABH / 2 + cwTop(t) + CWH / 2) / 2;
    ctx.beginPath(); ctx.ellipse(575, y, 150 + 10 * Math.sin(t * 8), 140, 0, 0, 7); ctx.stroke();
    ctx.restore();
  }
  // setas de peso (gancho)
  if (t > C.weight && t < S('c1')) {
    const k = P(t, C.weight, 0.4) * (1 - P(t, S('c1') - 0.3, 0.3));
    const top = cabTopAt(t);
    ctx.save(); ctx.globalAlpha *= k;
    const bob = 8 * Math.sin(t * 6);
    ctx.fillStyle = '#e63946';
    ctx.beginPath(); ctx.moveTo(CABX - 26, top + 215 + bob); ctx.lineTo(CABX + 26, top + 215 + bob); ctx.lineTo(CABX + 26, top + 255 + bob);
    ctx.lineTo(CABX + 50, top + 255 + bob); ctx.lineTo(CABX, top + 300 + bob); ctx.lineTo(CABX - 50, top + 255 + bob); ctx.lineTo(CABX - 26, top + 255 + bob); ctx.fill();
    ctx.restore();
  }
  // notas musicais (final)
  if (t > C.acc[3]) {
    const top = cabTopAt(t);
    for (let i = 0; i < 6; i++) {
      const a = ((t - C.acc[3] - i * 0.4) % 2.4 + 2.4) % 2.4;
      if (t - C.acc[3] - i * 0.4 < 0) continue;
      const k = a / 2.4;
      ctx.save(); ctx.globalAlpha *= Math.sin(k * Math.PI);
      ctx.fillStyle = '#7b4bd6'; ctx.font = '700 34px F'; ctx.textAlign = 'center';
      ctx.fillText(i % 2 ? '♪' : '♫', CABX + 130 + Math.sin(k * 6 + i) * 20, top + 60 - k * 140);
      ctx.restore();
    }
  }
}
function bigWord(txt, x, y, size, col) {
  ctx.font = `700 ${size}px F`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.strokeStyle = '#141824'; ctx.lineWidth = size * 0.22;
  ctx.strokeText(txt, x, y); ctx.fillStyle = col; ctx.fillText(txt, x, y);
}
function drawSide(t) {
  const frozen = t >= C.s1frz && t < C.s1rwS;
  if (frozen) ctx.filter = 'grayscale(0.85) contrast(1.05)';
  sky(frozen ? C.s1frz : t);
  const c = camAt(t), sh = shakeAt(t);
  ctx.save();
  ctx.translate(FOCAL[0] + sh[0], FOCAL[1] + sh[1]); ctx.scale(c[2], c[2]); ctx.translate(-c[0], -c[1]);
  groundW();
  building(t);
  railsW(t);
  governorW(t);
  counterweightW(t);
  cabinW(t);
  ropesW(t);
  topMachinesW(t);
  effectsW(t);
  ctx.restore();
  const dk = dark(t);
  if (dk > 0) { ctx.fillStyle = `rgba(12,18,45,${0.55 * dk})`; ctx.fillRect(0, 0, W, H); }
  ctx.filter = 'none';
  drawLabels(t, 'w');
}

// ---------------------------------------------------------------- desenho: frente (porta do andar)
const DX0 = 330, DX1 = 750, DY0 = 500, DY1 = 1300, DW = DX1 - DX0;
function frontBg() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#f3e6cc'); g.addColorStop(1, '#e4d0ad');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#d8c39f'; ctx.fillRect(0, DY1 - 40, W, 40);
  // piso em perspectiva
  ctx.fillStyle = '#c9b18a'; ctx.fillRect(0, DY1, W, H - DY1);
  ctx.strokeStyle = 'rgba(120,95,60,.35)'; ctx.lineWidth = 3;
  for (let k = -8; k <= 8; k++) line(540 + k * 60, DY1, 540 + k * 260, H);
  for (let k = 0; k < 6; k++) { const y = DY1 + Math.pow(k / 6, 1.6) * (H - DY1); line(0, y, W, y); }
  // rodapé e quadrinho
  ctx.fillStyle = '#a07a50'; ctx.fillRect(0, DY1 - 12, W, 12);
  ctx.fillStyle = '#c98b5a'; rr(870, 640, 150, 110, 8); ctx.fill(); ctx.fillStyle = '#b5e3a1'; ctx.fillRect(884, 654, 122, 82);
  plant(70, DY1 - 12);
}
function cabinFront(off, t) {
  const y0 = DY0 + off, y1 = DY1 + off;
  // interior em perspectiva
  const ix0 = DX0 + 60, ix1 = DX1 - 60, iy0 = y0 + 70, iy1 = y1 - 90;
  ctx.fillStyle = '#d6a36b'; ctx.fillRect(DX0, y0, DW, y1 - y0);
  ctx.fillStyle = '#e8bf87'; ctx.fillRect(ix0, iy0, ix1 - ix0, iy1 - iy0);
  ctx.strokeStyle = 'rgba(140,90,40,.35)'; ctx.lineWidth = 3;
  for (let x = ix0 + 50; x < ix1; x += 50) line(x, iy0, x, iy1);
  ctx.fillStyle = '#c48e55';
  ctx.beginPath(); ctx.moveTo(DX0, y0); ctx.lineTo(ix0, iy0); ctx.lineTo(ix0, iy1); ctx.lineTo(DX0, y1); ctx.fill();
  ctx.beginPath(); ctx.moveTo(DX1, y0); ctx.lineTo(ix1, iy0); ctx.lineTo(ix1, iy1); ctx.lineTo(DX1, y1); ctx.fill();
  ctx.fillStyle = '#fff8e2'; ctx.beginPath(); ctx.moveTo(DX0, y0); ctx.lineTo(DX1, y0); ctx.lineTo(ix1, iy0); ctx.lineTo(ix0, iy0); ctx.fill();
  ctx.fillStyle = '#8b8f99'; ctx.beginPath(); ctx.moveTo(DX0, y1); ctx.lineTo(DX1, y1); ctx.lineTo(ix1, iy1); ctx.lineTo(ix0, iy1); ctx.fill();
  ctx.strokeStyle = '#a77a45'; ctx.lineWidth = 8; line(ix0 + 10, iy0 + 380, ix1 - 10, iy0 + 380);
  // painel
  ctx.fillStyle = '#c8ced8'; ctx.beginPath(); ctx.moveTo(DX1 - 20, y0 + 300); ctx.lineTo(ix1 + 8, iy0 + 290); ctx.lineTo(ix1 + 8, iy0 + 420); ctx.lineTo(DX1 - 20, y0 + 460); ctx.fill();
  for (let k = 0; k < 5; k++) { ctx.fillStyle = '#5d6675'; circ(DX1 - 38, y0 + 330 + k * 26, 6); ctx.fill(); }
  // luz
  const g = ctx.createRadialGradient(540, y0 + 30, 10, 540, y0 + 30, 300);
  g.addColorStop(0, 'rgba(255,250,220,.6)'); g.addColorStop(1, 'rgba(255,250,220,0)');
  ctx.fillStyle = g; ctx.fillRect(DX0, y0, DW, 400);
  // piso da cabine e topo
  ctx.fillStyle = '#2f343c'; ctx.fillRect(DX0 - 10, y1, DW + 20, 40); ctx.fillRect(DX0 - 10, y0 - 40, DW + 20, 40);
  ctx.strokeStyle = '#7b8594'; ctx.lineWidth = 4;
  for (let k = 0; k < 5; k++) line(520 + k * 10, y0 - 40, 520 + k * 10, y0 - 2000);
}
function shaftFront(t) {
  const g = ctx.createLinearGradient(0, DY0, 0, DY1);
  g.addColorStop(0, '#30343e'); g.addColorStop(1, '#14161b');
  ctx.fillStyle = g; ctx.fillRect(DX0, DY0, DW, DY1 - DY0);
  ctx.fillStyle = '#7d8592'; ctx.fillRect(DX0 + 40, DY0, 12, DY1 - DY0); ctx.fillRect(DX1 - 52, DY0, 12, DY1 - DY0);
  ctx.strokeStyle = '#5c6470'; ctx.lineWidth = 4;
  for (let k = 0; k < 5; k++) line(520 + k * 10, DY0, 520 + k * 10, DY1);
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(DX0, DY1 - 60, DW, 60);
}
function doorPanel(x, w, y0, y1, side) {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, '#aeb6c2'); g.addColorStop(0.5, '#e7ecf2'); g.addColorStop(1, '#b4bcc8');
  ctx.fillStyle = g; ctx.fillRect(x, y0, w, y1 - y0);
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
  for (let k = 1; k < 6; k++) line(x + (w * k) / 6, y0, x + (w * k) / 6, y1);
  ctx.fillStyle = '#2c313a'; ctx.fillRect(side < 0 ? x + w - 8 : x, y0, 8, y1 - y0);
}
function personFront(t) {
  const vis = (t >= C.pw0 && t < C.pout0 + 0.95) || t >= C.rw0;
  if (!vis) return;
  const ps = kf(t, C.personKeys);
  const prev = kf(t - 0.05, C.personKeys);
  const moving = Math.hypot(ps[0] - prev[0], ps[1] - prev[1]) > 0.8;
  const [x, y, s] = ps;
  const teeter = t >= C.pt0 && t < C.pt1;
  const squish = t >= C.slam && t < C.ro0;
  const reach = kf(t, C.reachKeys);
  const bob = moving ? Math.abs(Math.sin(t * 13)) * 10 : 0;
  ctx.save();
  ctx.translate(x, y - bob * s);
  ctx.scale(s * (squish ? 0.84 : 1), s * (squish ? 1.04 : 1));
  if (teeter) ctx.rotate(0.13 * Math.sin((t - C.pt0) * 9));
  // pernas
  const step = moving ? Math.sin(t * 13) * 10 : 0;
  ctx.fillStyle = '#33415c'; rr(-30, -112 + step, 24, 112 - step, 10); ctx.fill(); rr(6, -112 - step, 24, 112 + step, 10); ctx.fill();
  ctx.fillStyle = '#1d2230'; rr(-34, -18 + step * 0.3, 32, 18, 8); ctx.fill(); rr(2, -18 - step * 0.3, 32, 18, 8); ctx.fill();
  // braços
  ctx.strokeStyle = '#e76f51'; ctx.lineWidth = 26; ctx.lineCap = 'round';
  const shL = [-56, -262], shR = [56, -262];
  let hL = [-70, -140], hR = [70, -140];
  if (teeter) { const a = (t - C.pt0) * 11; hL = [-56 + Math.cos(a) * 85, -262 + Math.sin(a) * 85]; hR = [56 + Math.cos(-a + 1) * 85, -262 + Math.sin(-a + 1) * 85]; }
  if (reach > 0) { const tx = (560 - x) / s, ty = (1010 - y) / s; hR = [lerp(hR[0], tx, EZ.io(reach)), lerp(hR[1], ty, EZ.io(reach))]; }
  line(shL[0], shL[1], hL[0], hL[1]); line(shR[0], shR[1], hR[0], hR[1]);
  ctx.fillStyle = '#f2c29b'; circ(hL[0], hL[1], 15); ctx.fill(); circ(hR[0], hR[1], 15); ctx.fill();
  // tronco
  ctx.fillStyle = '#e76f51'; rr(-62, -290, 124, 186, 42); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.08)'; rr(-6, -280, 12, 160, 6); ctx.fill();
  // cabeça (de costas)
  ctx.fillStyle = '#f2c29b'; circ(-50, -338, 12); ctx.fill(); circ(50, -338, 12); ctx.fill();
  ctx.fillStyle = '#3b2a20'; circ(0, -345, 52); ctx.fill();
  ctx.restore();
  // "!" e estrelinhas
  if (teeter) {
    ctx.save(); ctx.translate(x + 70 * s, y - 470 * s); ctx.rotate(0.2 * Math.sin(t * 20));
    bigWord('!', 0, 0, 90 * s, '#ff4d3d'); ctx.restore();
  }
  if (squish) {
    for (let k = 0; k < 4; k++) {
      const a = t * 5 + k * Math.PI / 2;
      ctx.save(); ctx.translate(x + Math.cos(a) * 80 * s, y - 440 * s + Math.sin(a) * 20 * s);
      bigWord('★', 0, 0, 40, '#ffd23f'); ctx.restore();
    }
  }
}
function beams(t, xL, xR) {
  const p = P(t, C.bm0, 1.2); if (p <= 0) return;
  const n = 11;
  // emissores nas bordas
  ctx.save(); ctx.globalAlpha *= cl(p * 3);
  ctx.fillStyle = '#1b1f27'; ctx.fillRect(xL - 10, DY0 + 40, 10, DY1 - DY0 - 60); ctx.fillRect(xR, DY0 + 40, 10, DY1 - DY0 - 60);
  ctx.restore();
  const reach = kf(t, C.reachKeys);
  for (let i = 0; i < n; i++) {
    const q = st(p, i, n, 0.3); if (q <= 0) continue;
    const y = DY1 - 60 - i * 66;
    const broken = reach > 0.85 && Math.abs(y - 1010) < 50 && xR - xL > 40;
    ctx.fillStyle = '#ff3b3b'; circ(xL - 5, y, 5); ctx.fill(); circ(xR + 5, y, 5); ctx.fill();
    ctx.strokeStyle = broken ? `rgba(255,240,80,${0.6 + 0.4 * Math.sin(t * 40)})` : `rgba(255,60,60,${0.55 * q})`;
    ctx.lineWidth = broken ? 6 : 3;
    if (broken) { line(xL, y, 545, y); }
    else { const xe = lerp(xL, xR, EZ.o(q)); line(xL, y, xe, y); }
  }
}
function latchPanel(t) {
  const p = P(t, C.lt0, 1.0);
  const out = P(t, E('p3') + 0.3, 0.4);
  if (p <= 0 || out >= 1) return;
  const X = 110, Y = 220, Wd = 330, Hd = 250;
  ctx.save(); ctx.globalAlpha *= 1 - out;
  enterAt(st(p, 0, 4), X + Wd / 2, Y + Hd / 2, 0, -60, 0, 0.6);
  ctx.fillStyle = '#16213a'; rr(X, Y, Wd, Hd, 22); ctx.fill();
  ctx.strokeStyle = '#7fd1ff'; ctx.lineWidth = 4; ctx.setLineDash([12, 8]); rr(X, Y, Wd, Hd, 22); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#7fd1ff'; ctx.font = '600 24px F'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('POR DENTRO DA PORTA', X + 20, Y + 38);
  ctx.save(); rr(X + 6, Y + 50, Wd - 12, Hd - 56, 16); ctx.clip();
  // trilho da porta
  ctx.fillStyle = '#5d6878'; ctx.fillRect(X + 20, Y + 200, Wd - 40, 12);
  const fl = kf(t, C.fvFloorKeys);
  const rampY = Y + 150 - cl(fl - 2, 0, 2) * 80;
  const open = cl((rampY - (Y + 85)) / 55);
  const ang = -0.65 * open;
  // gancho (pivô em X+190)
  ctx.save(); if (enterAt(st(p, 1, 4), X + 190, Y + 150, 0, 50, 0, 0.4)) {
    ctx.translate(X + 190, Y + 150); ctx.rotate(ang);
    ctx.fillStyle = open > 0.6 ? '#3ad16b' : '#ff5a4a';
    rr(-70, -9, 160, 18, 9); ctx.fill();
    ctx.fillRect(74, -9, 16, 42);
    ctx.fillStyle = '#e8edf3'; circ(0, 0, 8); ctx.fill();
    ctx.fillStyle = '#ffd23f'; circ(-70, 0, 14); ctx.fill();
    ctx.restore();
  } else ctx.restore();
  // pino da porta
  ctx.save(); if (enterAt(st(p, 2, 4), X + 276, Y + 182, 40, 0, 0, 0.4)) {
    ctx.fillStyle = '#c3cbd6'; ctx.fillRect(X + 250, Y + 172, 60, 28); ctx.fillStyle = '#2c313a'; circ(X + 274, Y + 180, 8); ctx.fill();
  } ctx.restore();
  // rampa da cabine
  ctx.save(); if (enterAt(st(p, 3, 4), X + 110, rampY, 0, -40, 0, 1)) {
    ctx.fillStyle = '#3f6fae'; ctx.beginPath(); ctx.moveTo(X + 96, rampY - 140); ctx.lineTo(X + 112, rampY - 140); ctx.lineTo(X + 112, rampY); ctx.lineTo(X + 96, rampY + 14); ctx.fill();
  } ctx.restore();
  ctx.restore();
  // cadeado
  const ok = open > 0.6;
  ctx.fillStyle = ok ? '#3ad16b' : '#ff5a4a'; circ(X + Wd - 40, Y + 32, 18); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = '700 22px F'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(ok ? '✓' : '×', X + Wd - 40, Y + 33);
  ctx.restore();
}
function drawFront(t) {
  frontBg();
  const o = kf(t, C.doorKeys);
  const jig = (t >= C.slam && t < C.slam + 0.4) ? 6 * Math.sin((t - C.slam) * 50) * (1 - P(t, C.slam, 0.4)) : 0;
  const half = DW / 2;
  const xL = DX0 + half - o * half + jig, xR = DX0 + half + o * half - jig;
  const fl = kf(t, C.fvFloorKeys);
  const off = -(fl - 2) * 900;
  ctx.save(); ctx.beginPath(); ctx.rect(DX0, DY0, DW, DY1 - DY0); ctx.clip();
  shaftFront(t);
  if (off > -1300) cabinFront(off, t);
  doorPanel(xL - half, half, DY0, DY1, -1);
  doorPanel(xR, half, DY0, DY1, 1);
  beams(t, xL, xR);
  ctx.restore();
  // batente
  ctx.strokeStyle = '#8c95a3'; ctx.lineWidth = 26; ctx.strokeRect(DX0 - 13, DY0 - 13, DW + 26, DY1 - DY0 + 13);
  ctx.strokeStyle = '#c3cad4'; ctx.lineWidth = 6; ctx.strokeRect(DX0 - 24, DY0 - 24, DW + 48, DY1 - DY0 + 24);
  // indicador de andar
  ctx.fillStyle = '#151820'; rr(470, 392, 140, 76, 12); ctx.fill();
  const dir = Math.sign(kf(t + 0.05, C.fvFloorKeys) - fl);
  ctx.fillStyle = '#ff4d3d'; ctx.font = '700 54px F'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(Math.round(fl)), 556, 432);
  ctx.beginPath();
  if (dir < 0) { ctx.moveTo(496, 418); ctx.lineTo(522, 418); ctx.lineTo(509, 446); }
  else if (fl > 2.5) { ctx.moveTo(496, 446); ctx.lineTo(522, 446); ctx.lineTo(509, 418); }
  ctx.fill();
  // botão de chamada
  ctx.fillStyle = '#c3cad4'; rr(800, 840, 64, 130, 14); ctx.fill();
  const called = t >= C.po0 - 0.5 && t < C.unlock;
  ctx.fillStyle = called ? '#ffd84a' : '#5d6675'; circ(832, 880, 14); ctx.fill();
  ctx.fillStyle = '#5d6675'; circ(832, 930, 14); ctx.fill();
  latchPanel(t);
  personFront(t);
  drawLabels(t, 's');
}

// ---------------------------------------------------------------- etiquetas
function drawLabels(t, sp) {
  for (const L of LABELS) {
    if (L.sp !== sp || t < L.t0 || t > L.t1 + 0.3) continue;
    const pIn = P(t, L.t0, 0.45), pOut = P(t, L.t1, 0.3);
    let [ax, ay] = L.at(t);
    if (sp === 'w') [ax, ay] = w2s(t, ax, ay);
    const fs = 44;
    ctx.font = `700 ${fs}px F`;
    const tw = ctx.measureText(L.txt).width;
    let bx = ax + L.off[0], by = ay + L.off[1];
    bx = cl(bx, tw / 2 + 50, W - tw / 2 - 50); by = cl(by, 230, 1440);
    ctx.save(); ctx.globalAlpha *= 1 - pOut;
    // linha até a peça
    const lp = EZ.o(pIn);
    ctx.strokeStyle = '#141824'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    line(ax, ay, lerp(ax, bx, lp), lerp(ay, by, lp));
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3.5; line(ax, ay, lerp(ax, bx, lp), lerp(ay, by, lp));
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#141824'; ctx.lineWidth = 4;
    circ(ax, ay, 10 + 3 * Math.sin(t * 8)); ctx.fill(); ctx.stroke();
    const s = EZ.back(P(t, L.t0 + 0.12, 0.4));
    ctx.translate(bx, by); ctx.scale(s, s); ctx.rotate(-0.03);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; rr(-tw / 2 - 24, -fs * 0.72 + 8, tw + 48, fs * 1.44, 20); ctx.fill();
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#141824'; ctx.lineWidth = 6;
    rr(-tw / 2 - 24, -fs * 0.72, tw + 48, fs * 1.44, 20); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#141824'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(L.txt, 0, 3);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- legenda
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
    const hl = (l.hl || '').toLowerCase().split(/\s+/).filter(Boolean);
    chunks.forEach((c, i) => {
      const t0 = l.start + (acc / total) * (l.end - l.start);
      acc += c.join(' ').length + 1;
      const t1 = i === chunks.length - 1 ? l.end + 0.25 : l.start + (acc / total) * (l.end - l.start);
      CAPS.push({ t0, t1, words: c.map(w => ({ w, hl: hl.includes(w.toLowerCase().replace(/[^a-zà-ú]/g, '')) })) });
    });
  }
}
function drawCaption(t) {
  const c = CAPS.find(c => t >= c.t0 && t < c.t1);
  if (!c) return;
  const fs = 62;
  ctx.font = `700 ${fs}px F`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const sp = ctx.measureText(' ').width;
  const ws = c.words.map(o => ({ ...o, wd: ctx.measureText(o.w.toUpperCase()).width }));
  const tw = ws.reduce((a, o) => a + o.wd, 0) + sp * (ws.length - 1);
  const s = 0.88 + 0.12 * EZ.back(P(t, c.t0, 0.18));
  ctx.save(); ctx.translate(540, 1532); ctx.scale(s, s);
  let x = -tw / 2;
  ctx.lineJoin = 'round';
  for (const o of ws) {
    ctx.strokeStyle = '#121620'; ctx.lineWidth = 14; ctx.strokeText(o.w.toUpperCase(), x, 0);
    ctx.fillStyle = o.hl ? '#ffd23f' : '#ffffff'; ctx.fillText(o.w.toUpperCase(), x, 0);
    x += o.wd + sp;
  }
  ctx.restore();
}

// ---------------------------------------------------------------- mestre de obras (personagem)
function hostState(t) {
  let cur = null, prevEnd = 0;
  for (const r of REACT) {
    if (r.t > t) break;
    if (t < r.t + r.d) cur = r; else prevEnd = Math.max(prevEnd, r.t + r.d);
  }
  if (cur) return { e: cur.e, p: cur.p, b: cur.b, start: cur.t };
  return { e: 'idle', p: 'down', b: null, start: prevEnd };
}
const POSES = {
  down: [-96, -96, 96, -96], thumbs: [-96, -96, 112, -262], cheeks: [-56, -292, 56, -292],
  up: [-126, -392, 126, -392], cover: [-34, -312, 34, -312], wipe: [-96, -96, 44, -360],
  point: [-96, -96, 200, -250], cheer: [-118, -404, 118, -404],
};
function drawHost(t) {
  const cur = hostState(t), prev = hostState(cur.start - 0.001);
  const k = EZ.o(P(t, cur.start, 0.22));
  const pa = POSES[prev.p], pb = POSES[cur.p];
  const hands = pa.map((v, i) => lerp(v, pb[i], k));
  let jy = 0, jx = 0;
  if (cur.e === 'shock') jy = -40 * Math.sin(Math.PI * P(t, cur.start, 0.35));
  if (cur.p === 'up') jx = Math.sin(t * 45) * 4;
  if (cur.p === 'cheer') jy = -32 * Math.abs(Math.sin((t - cur.start) * 7));
  const breathe = 1 + 0.012 * Math.sin(t * 2.4);
  ctx.save();
  ctx.translate(178 + jx, 1938 + jy); ctx.scale(0.85, 0.85 * breathe);
  // braços (atrás do corpo quando abaixados)
  const arm = (sx, sy, hx, hy, thumb) => {
    ctx.strokeStyle = '#2f6db5'; ctx.lineWidth = 30; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo((sx + hx) / 2 + (sx < 0 ? -26 : 26), (sy + hy) / 2 + 20, hx, hy); ctx.stroke();
    ctx.fillStyle = '#f2c29b'; circ(hx, hy, 19); ctx.fill();
    if (thumb) { rr(hx - 6, hy - 40, 13, 28, 6); ctx.fill(); }
  };
  // corpo
  ctx.fillStyle = '#2f6db5'; rr(-84, -236, 168, 260, 56); ctx.fill();
  ctx.fillStyle = '#ff8a2a'; rr(-80, -226, 160, 250, 50); ctx.fill();
  ctx.fillStyle = '#2f6db5'; ctx.beginPath(); ctx.moveTo(-30, -232); ctx.lineTo(30, -232); ctx.lineTo(0, -170); ctx.fill();
  ctx.fillStyle = '#d9dde3'; ctx.fillRect(-80, -150, 160, 14); ctx.fillRect(-80, -100, 160, 14);
  arm(-70, -200, hands[0], hands[1], false);
  arm(70, -200, hands[2], hands[3], cur.p === 'thumbs' && k > 0.5);
  // cabeça
  const hpop = 1 + 0.07 * (1 - k);
  ctx.save(); ctx.translate(0, -300); ctx.scale(hpop, hpop);
  ctx.rotate(cur.e === 'think' ? -0.08 : cur.e === 'worried' ? 0.05 * Math.sin(t * 3) : 0.03 * Math.sin(t * 1.3));
  ctx.fillStyle = '#f2c29b'; circ(0, 0, 70); ctx.fill();
  ctx.fillStyle = 'rgba(255,120,120,.35)'; circ(-42, 22, 13); ctx.fill(); circ(42, 22, 13); ctx.fill();
  face(cur.e, t);
  // capacete
  const hy = cur.e === 'shock' ? -24 * Math.sin(Math.PI * P(t, cur.start, 0.35)) : 0;
  ctx.fillStyle = '#ffc83d'; ctx.beginPath(); ctx.arc(0, -22 + hy, 74, Math.PI, 2 * Math.PI); ctx.fill();
  rr(-90, -30 + hy, 180, 18, 9); ctx.fill();
  ctx.fillStyle = '#f0a91e'; ctx.fillRect(-10, -94 + hy, 20, 66);
  ctx.restore();
  // balão de fala
  if (cur.b) {
    const s = EZ.back(P(t, cur.start, 0.3));
    ctx.save(); ctx.translate(175, -318); ctx.scale(s, s); ctx.rotate(0.05 * Math.sin(t * 5));
    ctx.font = '700 46px F';
    const tw = Math.max(70, ctx.measureText(cur.b).width);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#141824'; ctx.lineWidth = 6;
    rr(-20, -46, tw + 40, 80, 30); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, 30); ctx.lineTo(-28, 64); ctx.lineTo(34, 30); ctx.fill();
    ctx.fillStyle = '#141824'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(cur.b, 0, -4);
    ctx.restore();
  }
  ctx.restore();
}
function face(e, t) {
  const blink = (t % 3.7) < 0.12 && e === 'idle';
  ctx.strokeStyle = '#2b1d14'; ctx.fillStyle = '#2b1d14'; ctx.lineCap = 'round'; ctx.lineWidth = 6;
  const eye = (x, big) => {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x, -6, big ? 19 : 14, blink ? 2 : big ? 22 : 17, 0, 0, 7); ctx.fill();
    if (!blink) { ctx.fillStyle = '#2b1d14'; circ(x + (big ? 0 : 4), -6 + (big ? 0 : -3), big ? 6 : 7.5); ctx.fill(); }
  };
  switch (e) {
    case 'happy':
      ctx.beginPath(); ctx.arc(-26, 0, 13, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(26, 0, 13, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.fillStyle = '#7a2a2a'; ctx.beginPath(); ctx.arc(0, 22, 26, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#ff8c8c'; ctx.beginPath(); ctx.ellipse(0, 38, 12, 6, 0, 0, 7); ctx.fill();
      break;
    case 'shock':
      eye(-26, true); eye(26, true);
      line(-42, -40, -14, -46); line(14, -46, 42, -40);
      ctx.fillStyle = '#5a1e1e'; ctx.beginPath(); ctx.ellipse(0, 36, 15, 20, 0, 0, 7); ctx.fill();
      break;
    case 'worried':
      eye(-26, false); eye(26, false);
      line(-40, -30, -14, -38); line(14, -38, 40, -30);
      ctx.beginPath(); ctx.moveTo(-18, 36); ctx.quadraticCurveTo(-9, 28, 0, 36); ctx.quadraticCurveTo(9, 44, 18, 36); ctx.stroke();
      sweat(56, -26, t);
      break;
    case 'wince':
      line(-38, -14, -16, -4); line(-38, 6, -16, -4); line(38, -14, 16, -4); line(38, 6, 16, -4);
      ctx.fillStyle = '#fff'; rr(-24, 24, 48, 22, 6); ctx.fill(); ctx.strokeStyle = '#2b1d14'; ctx.lineWidth = 4; rr(-24, 24, 48, 22, 6); ctx.stroke();
      line(-8, 24, -8, 46); line(8, 24, 8, 46);
      break;
    case 'relieved':
      ctx.beginPath(); ctx.arc(-26, -10, 12, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(26, -10, 12, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 22, 16, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      sweat(56, -30, t);
      break;
    case 'think':
      eye(-26, false); eye(26, false);
      line(-40, -36, -14, -34); line(14, -46, 40, -40);
      ctx.fillStyle = '#5a1e1e'; ctx.beginPath(); ctx.ellipse(8, 34, 9, 11, 0, 0, 7); ctx.fill();
      break;
    default:
      eye(-26, false); eye(26, false);
      line(-38, -32, -14, -34); line(14, -34, 38, -32);
      ctx.beginPath(); ctx.arc(0, 18, 20, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  }
}
function sweat(x, y, t) {
  ctx.fillStyle = '#6cc4ff';
  const dy = (t * 40) % 30;
  ctx.beginPath(); ctx.moveTo(x, y + dy - 14); ctx.quadraticCurveTo(x + 11, y + dy + 4, x, y + dy + 8); ctx.quadraticCurveTo(x - 11, y + dy + 4, x, y + dy - 14); ctx.fill();
}

// ---------------------------------------------------------------- interface
function drawHeader() {
  ctx.font = '700 40px F';
  const a = 'COMO CONSTRUIR UM ', b = 'ELEVADOR';
  const wa = ctx.measureText(a).width, wb = ctx.measureText(b).width, tw = wa + wb;
  ctx.fillStyle = 'rgba(20,24,36,.82)'; rr(540 - tw / 2 - 30, 52, tw + 60, 72, 36); ctx.fill();
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff'; ctx.fillText(a, 540 - tw / 2, 90);
  ctx.fillStyle = '#ffd23f'; ctx.fillText(b, 540 - tw / 2 + wa, 90);
}
function drawChips(t) {
  const vis = CHIPS.filter(c => t >= c.t);
  if (!vis.length) return;
  const pIn = P(t, CHIPS[0].t, 0.4);
  ctx.save(); ctx.globalAlpha *= pIn;
  ctx.fillStyle = 'rgba(255,255,255,.82)'; rr(345, 1636, 705, 262, 30); ctx.fill();
  ctx.fillStyle = '#5b6372'; ctx.font = '600 26px F'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('PEÇAS INSTALADAS', 375, 1672);
  let x = 372, y = 1712;
  ctx.font = '600 24px F';
  for (const c of vis) {
    const w = ctx.measureText(c.txt).width + 60;
    if (x + w > 1036) { x = 372; y += 46; }
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
function overlays(t) {
  // rebobinar
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
  // congelado
  if (t >= C.s1frz && t < C.s1rwS) {
    const k = P(t, C.s1frz, 0.25);
    ctx.save(); ctx.translate(800, 620); ctx.scale(EZ.back(k) * (1 + 0.05 * Math.sin(t * 6)), EZ.back(k) * (1 + 0.05 * Math.sin(t * 6)));
    bigWord('?', 0, 0, 260, '#ffd23f'); ctx.restore();
  }
  // câmera lenta
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
  // cartão do Otis
  if (t >= C.otis0 && t < C.otis1) otisCard(t);
  // carimbo final + confete
  if (t >= C.stamp) {
    const k = P(t, C.stamp, 0.22);
    const sc = lerp(3, 1, EZ.o(k));
    ctx.save(); ctx.translate(540, 760); ctx.rotate(-0.12); ctx.scale(sc, sc); ctx.globalAlpha = cl(k * 2);
    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.strokeStyle = '#1f8f55'; ctx.lineWidth = 12;
    rr(-330, -110, 660, 220, 30); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 4; rr(-310, -90, 620, 180, 22); ctx.stroke();
    ctx.fillStyle = '#1f8f55'; ctx.font = '700 92px F'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('OBRA', 0, -36); ctx.font = '700 64px F'; ctx.fillText('ENTREGUE ✓', 0, 50);
    ctx.restore();
    const a = t - C.stamp - 0.18;
    if (a > 0) {
      const cols = ['#ffd23f', '#e63946', '#2a9d8f', '#4d7cfe', '#ff8a2a', '#8e5bd1'];
      for (let i = 0; i < 90; i++) {
        const ang = -Math.PI / 2 + (rnd(i) - 0.5) * 2.6, v = 600 + rnd(i + 7) * 900;
        const x = 540 + Math.cos(ang) * v * a, y = 760 + Math.sin(ang) * v * a + 900 * a * a;
        if (y > H + 40) continue;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a * 8 + i); ctx.fillStyle = cols[i % cols.length];
        ctx.fillRect(-9, -5, 18, 10); ctx.restore();
      }
    }
  }
  // chamada para comentar
  if (t >= C.cta) {
    const k = EZ.back(P(t, C.cta, 0.4));
    ctx.save(); ctx.translate(700, 1100); ctx.scale(k, k); ctx.rotate(0.03 * Math.sin(t * 3));
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#141824'; ctx.lineWidth = 7;
    rr(-320, -100, 640, 200, 40); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-200, 96); ctx.lineTo(-250, 160); ctx.lineTo(-140, 96); ctx.fill();
    ctx.fillStyle = '#141824'; ctx.font = '700 48px F'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('QUAL OBRA EU FAÇO', 0, -30);
    ctx.fillStyle = '#e63946'; ctx.fillText('NO PRÓXIMO VÍDEO?', 0, 34);
    ctx.restore();
  }
}
function otisCard(t) {
  const k = EZ.back(P(t, C.otis0, 0.45)), out = P(t, C.otis1 - 0.3, 0.3);
  ctx.save(); ctx.translate(790, 560); ctx.rotate(0.07 - 0.04 * (1 - k)); ctx.scale(k, k); ctx.globalAlpha = 1 - out;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; rr(-205, -215, 430, 470, 10); ctx.fill();
  ctx.fillStyle = '#fbf6ea'; rr(-215, -225, 430, 470, 10); ctx.fill();
  ctx.fillStyle = '#d9c39a'; ctx.fillRect(-190, -200, 380, 330);
  // torre e plataforma
  ctx.fillStyle = '#7a5a36'; ctx.fillRect(-130, -200, 14, 330); ctx.fillRect(116, -200, 14, 330);
  ctx.fillStyle = '#6a4a2a'; ctx.fillRect(-120, -20, 240, 16);
  // corda cortada
  ctx.strokeStyle = '#5a3d22'; ctx.lineWidth = 5; line(0, -200, 0, -130); line(0, -110, 0, -20);
  ctx.strokeStyle = '#b3261e'; ctx.lineWidth = 4; line(-14, -128, 14, -112); line(-14, -112, 14, -128);
  // Otis de cartola
  ctx.fillStyle = '#3d2b1c';
  rr(-28, -104, 56, 84, 12); ctx.fill(); circ(0, -122, 18); ctx.fill();
  ctx.fillRect(-14, -168, 28, 34); ctx.fillRect(-24, -138, 48, 7);
  ctx.strokeStyle = '#3d2b1c'; ctx.lineWidth = 9; ctx.lineCap = 'round'; line(24, -90, 60, -130);
  // plateia
  ctx.fillStyle = '#6b5236';
  for (let i = 0; i < 9; i++) { circ(-170 + i * 42, 104 + (i % 2) * 6, 17); ctx.fill(); }
  ctx.fillStyle = '#3d2b1c'; ctx.font = '700 40px F'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Elisha Otis · 1854', 0, 188);
  ctx.restore();
}

// ---------------------------------------------------------------- quadro
function draw(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.filter = 'none';
  const fa = fvAlpha(t);
  if (fa < 1) drawSide(t);
  if (fa > 0) { ctx.save(); ctx.globalAlpha = fa; drawFront(t); ctx.restore(); }
  overlays(t);
  drawHeader();
  drawCaption(t);
  drawChips(t);
  drawHost(t);
}
window.setup = setup; window.draw = draw; window.sfxEvents = sfxEvents;
