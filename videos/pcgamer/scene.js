/* Animação 3D do vídeo "PC Gamer" (Three.js).
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

// ================================================================ medidas do mundo (1 unidade = 10 cm)
// gabinete: x 0 (frente) → 4.5 (traseira), y 0 → 4.5, z 0 (fundo, placa-mãe) → 2.1 (lado aberto)
const CASE = { x: 1.0, y: 0.15, z: -3.0, L: 4.5, H: 4.5, D: 2.1, t: 0.06 };
const MB = { x0: 1.95, x1: 4.39, y0: 1.35, y1: 4.40, z0: 0.06, z1: 0.10 };
const CPU = { x: 3.05, y: 3.55, s: 0.4 };
const SOCK = { x0: 2.8, x1: 3.3, y0: 3.3, y1: 3.8, z1: 0.14 };
const PCIE = { x0: 2.1, x1: 3.9, y0: 2.55, y1: 2.61, z1: 0.15 };
const GPU = { x0: 1.2, x1: 4.3, y0: 2.05, y1: 2.6, z0: 0.15, z1: 1.33 };
const PSU = { x0: 2.8, x1: 4.4, y0: 0.06, y1: 0.92, z0: 0.15, z1: 1.55 };
const SSD = { x0: 2.4, x1: 3.2, y0: 1.6, y1: 1.82, z0: 0.10, z1: 0.125 };
const RAMX = [3.70, 3.88];
const FIN = { x0: 2.45, x1: 3.62, y0: 2.95, y1: 4.15, z0: 0.47, n: 20, gap: 0.055 };
const OUTLET = new THREE.Vector3(7.0, 2.5, -6.08);
const DESKCPU = new THREE.Vector3(3.0, 0.03, 1.3);
const SCREEN = { x: -4.6, y: 3.1, z: -1.83, w: 6.0, h: 3.4 };
const FLOOR = -7.6;
const CW = (x, y, z) => new THREE.Vector3(CASE.x + x, CASE.y + y, CASE.z + z);

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
  // gancho: processador ligado direto na tomada
  C.case0 = 0.05;
  C.cpu0 = Math.max(0.6, wT('h1', 'processador') - 0.3);
  C.plug0 = wT('h1', 'tomada') - 0.25;
  C.zap1 = wT('h2', 'torrado');
  C.rwH = RW(E('h2') + 0.15, C.plug0 - 0.2);
  // placa-mãe
  C.mb0 = wT('m1', 'placa') - 0.25;
  C.cpuIn = wT('m1', 'conectam') - 0.2;
  // fonte
  C.plug2 = S('f1') + 0.1;
  C.zap2 = wT('f1', 'aguenta');
  C.rwF = RW(E('f1') + 0.15, C.plug2 - 0.15);
  C.psu0 = wT('f2', 'caixa') - 0.25;
  C.psuCab = wT('f2', 'volts') - 0.2;
  // cooler
  C.on1 = S('c1') + 0.1;
  C.hot1 = wT('c1', 'desliga');
  C.rwC = RW(E('c1') + 0.15, C.on1 - 0.1);
  C.cool0 = wT('c2', 'bloco') - 0.25;
  C.fan0 = wT('c2', 'ventoinha') - 0.15;
  // pasta térmica
  C.zoom1 = S('t1') + 0.2;
  C.rwT = RW(E('t1') + 0.15, S('t1') - 0.05);
  C.lift = S('t2') + 0.05;
  C.paste = wT('t2', 'pasta') - 0.1;
  C.press = wT('t2', 'buraquinhos');
  // SSD
  C.ssd0 = wT('s1', 'guardado') - 0.3;
  // memória RAM
  C.load1 = S('r1') + 0.15;
  C.rwR = RW(E('r1') + 0.15, S('r1') - 0.05);
  C.ram0 = wT('r2', 'memória') - 0.3;
  C.load2 = wT('r2', 'rápida') + 0.1;
  C.blackout = wT('r3', 'acaba') - 0.05;
  // placa de vídeo
  C.game1 = S('g1');
  C.rwG = RW(E('g1') + 0.15, S('g1') - 0.05);
  C.gpu0 = wT('g2', 'placa') - 0.25;
  C.gpuOn = C.gpu0 + 1.4;
  // energia
  C.off = wT('p1', 'desliga');
  C.rwP = RW(E('p1') + 0.15, S('p1') - 0.05);
  C.psuOut = wT('p2', 'troca') - 0.2;
  C.psu2 = C.psuOut + 0.5;
  C.pcieCab = C.psu2 + 0.9;
  // fluxo de ar
  C.glass = S('a1') + 0.05;
  C.rwA = RW(E('a1') + 0.15, S('a1') - 0.05);
  C.fansF = wT('a2', 'ventoinhas') - 0.25;
  C.fanR = wT('a2', 'trás') - 0.2;
  C.glass2 = wT('a3', 'gabinete') - 0.2;
  // final
  C.acc = [wT('e1', 'teclado'), wT('e1', 'mouse'), wT('e1', 'fone'), wT('e1', 'luzinhas')];
  C.joke = wT('e1', 'brincadeira');
  C.hostWorld = S('e2') - 0.25;
  C.play = wT('e2', 'play');
  C.stamp = S('e3') + 0.25;
  C.cta = S('e4') - 0.1;

  // ---------- câmera: [alvoX, alvoY, alvoZ, distância, azimute, elevação, fov]
  const OV = [1.0, 2.4, -1.5, 26, 0.18, 0.13, 38];
  const WIDE = [0.0, 2.6, -2.0, 20, 0.1, 0.07, 38];
  const CS = [3.25, 2.5, -2.0, 11, 0.25, 0.1, 40];
  const cpuW = CW(CPU.x, CPU.y, 0.2), gpuW = CW((GPU.x0 + GPU.x1) / 2, (GPU.y0 + GPU.y1) / 2, 0.8), psuW = CW(3.6, 0.5, 0.85);
  const ramW = CW(3.8, 3.55, 0.3), ssdW = CW(2.8, 1.71, 0.11);
  const CK = [];
  CK.push([0, [1.0, 2.6, -1.5, 34, -0.65, 0.38, 38]], [2.4, OV]);
  CK.push([C.plug0 - 0.6, OV], [C.plug0 + 0.2, [DESKCPU.x, 0.3, DESKCPU.z, 3.4, 0.55, 0.4, 42]], [C.rwH.b, [DESKCPU.x, 0.3, DESKCPU.z, 3.1, 0.1, 0.36, 42]]);
  CK.push([C.mb0 + 0.2, [3.25, 2.7, -2.0, 11, 0.5, 0.12, 40]], [E('m2'), [3.25, 2.7, -2.0, 10, -0.15, 0.1, 40]]);
  CK.push([C.plug2 + 0.3, [5.2, 2.4, -3.0, 14, 0.35, 0.1, 40]], [C.rwF.b, [5.2, 2.4, -3.0, 13.5, 0.2, 0.1, 40]]);
  CK.push([C.psu0 + 0.2, [psuW.x, 0.9, psuW.z, 7, 0.5, 0.25, 42]], [E('f3'), [psuW.x, 0.9, psuW.z, 6.5, -0.2, 0.2, 42]]);
  CK.push([C.on1 + 0.2, WIDE], [C.rwC.b, [0.0, 2.6, -2.0, 19, -0.05, 0.07, 38]]);
  CK.push([C.cool0 + 0.15, [cpuW.x, cpuW.y, cpuW.z + 0.4, 6, 0.6, 0.22, 42]], [E('c3'), [cpuW.x, cpuW.y, cpuW.z + 0.4, 5.6, -0.25, 0.15, 42]]);
  CK.push([S('t1') + 0.3, [cpuW.x, cpuW.y, cpuW.z + 0.3, 5.0, 0.3, 0.15, 42]], [E('t3'), [cpuW.x, cpuW.y, cpuW.z + 0.3, 4.6, -0.3, 0.1, 42]]);
  CK.push([C.ssd0 + 0.1, [ssdW.x, ssdW.y, ssdW.z + 0.5, 4.6, 0.35, -0.15, 42]], [E('s2'), [ssdW.x, ssdW.y, ssdW.z + 0.5, 4.4, 0.05, -0.12, 42]]);
  CK.push([S('r1') + 0.3, WIDE], [C.rwR.b, [0.0, 2.6, -2.0, 19, -0.05, 0.07, 38]]);
  CK.push([C.ram0 + 0.15, [ramW.x, ramW.y, ramW.z + 0.3, 5, 0.65, 0.18, 42]], [C.load2 + 0.8, [ramW.x, ramW.y, ramW.z + 0.3, 5, 0.2, 0.15, 42]], [S('r3') + 0.4, WIDE], [E('r3'), WIDE]);
  CK.push([S('g1') + 0.3, [SCREEN.x, SCREEN.y, SCREEN.z, 8.5, -0.08, 0.03, 40]], [C.rwG.b, [SCREEN.x, SCREEN.y, SCREEN.z, 8.2, 0.05, 0.03, 40]]);
  CK.push([C.gpu0 + 0.2, [gpuW.x, gpuW.y, gpuW.z, 7.5, 0.45, -0.12, 42]], [C.gpuOn + 0.2, [gpuW.x, gpuW.y, gpuW.z, 7.2, -0.1, -0.05, 42]], [E('g3'), [gpuW.x, gpuW.y, gpuW.z, 7.4, 0.15, 0.05, 42]]);
  CK.push([S('p1') + 0.3, WIDE], [C.rwP.b, [0.0, 2.6, -2.0, 19, -0.05, 0.07, 38]]);
  CK.push([C.psuOut + 0.1, [psuW.x, 1.1, psuW.z, 8, 0.45, 0.25, 42]], [E('p3'), [psuW.x, 1.1, psuW.z, 7.5, -0.15, 0.2, 42]]);
  CK.push([S('a1') + 0.3, CS], [C.rwA.b, [3.25, 2.5, -2.0, 11, 0.1, 0.1, 40]]);
  CK.push([C.fansF + 0.2, [2.4, 2.4, -2.0, 10.5, -0.35, 0.1, 40]], [E('a3'), [2.6, 2.4, -2.0, 10.5, 0.35, 0.1, 40]]);
  CK.push([S('e1') + 0.4, [-1.0, 1.8, -0.5, 23, 0.12, 0.16, 40]], [C.hostWorld, [-1.0, 1.8, -0.5, 22, -0.05, 0.14, 40]]);
  CK.push([C.hostWorld + 0.9, [-0.3, 2.0, 2.0, 30, 0.05, 0.12, 42]], [TL.duration, [-0.3, 2.2, 2.0, 31, 0.2, 0.14, 42]]);
  C.camKeys = sortK(CK);

  C.shakes = [[C.zap1, 0.06], [C.zap2, 0.08], [C.hot1, 0.05], [C.off, 0.05], [C.stamp + 0.18, 0.12]];

  // ---------- reações do mestre de obras
  const Rx = (t, d, e, p, b) => REACT.push({ t, d, e, p, b });
  Rx(C.plug0 + 0.1, C.zap1 - C.plug0 - 0.1, 'worried', 'down', null);
  Rx(C.zap1, C.rwH.a - C.zap1, 'shock', 'cheeks', '!!');
  Rx(E('m2') - 1.2, 1.2, 'happy', 'thumbs', null);
  Rx(C.zap2, C.rwF.a - C.zap2, 'shock', 'up', 'De novo?!');
  Rx(E('f3') - 1.2, 1.2, 'happy', 'thumbs', null);
  Rx(C.hot1 - 0.8, C.rwC.a - C.hot1 + 0.8, 'shock', 'cheeks', 'Desligou!');
  Rx(E('c3') - 0.6, 1.0, 'happy', 'thumbs', null);
  Rx(C.zoom1, C.rwT.a - C.zoom1, 'worried', 'wipe', 'Que calor...');
  Rx(E('t3') - 1.2, 1.2, 'happy', 'thumbs', null);
  Rx(C.load1 + 0.4, C.rwR.a - C.load1 - 0.4, 'think', 'down', 'Anda logo...');
  Rx(C.load2 + 0.6, 1.2, 'happy', 'thumbs', null);
  Rx(C.blackout, 1.0, 'shock', 'cheeks', 'Perdi tudo!');
  Rx(C.game1 + 0.3, C.rwG.a - C.game1 - 0.3, 'wince', 'cheeks', 'Travando!');
  Rx(C.gpuOn, 1.5, 'happy', 'thumbs', 'Liso!');
  Rx(C.off, C.rwP.a - C.off, 'shock', 'up', 'Ué?!');
  Rx(E('p3') - 1.0, 1.0, 'happy', 'thumbs', null);
  Rx(C.glass + 0.6, C.rwA.a - C.glass - 0.6, 'worried', 'wipe', 'Forno!');
  Rx(E('a3') - 1.2, 1.2, 'relieved', 'wipe', 'Fresquinho!');
  Rx(C.joke, 1.6, 'think', 'down', 'Brincadeira!');
  Rx(C.play, 1.3, 'happy', 'point', 'Play!');
  Rx(C.stamp + 0.15, 2.4, 'happy', 'cheer', 'Uhuul!');
  Rx(C.cta, TL.duration - C.cta, 'happy', 'point', null);
  for (const r of C.REW) Rx(r.a, r.b - r.a, 'worried', 'point', 'Volta!');
  REACT.sort((a, b) => a.t - b.t);

  // ---------- etiquetas
  const Lb = (txt, t0, t1, at, off) => { LABELS.push({ txt, t0, t1, at, off }); CHIPS.push({ txt, t: t0 }); };
  Lb('PLACA-MÃE', wT('m2', 'placa'), E('m2') + 0.3, () => CW(MB.x0 + 0.35, MB.y0 + 0.3, MB.z1), [-90, 230]);
  Lb('FONTE', wT('f3', 'fonte'), E('f3') + 0.3, () => CW(3.0, PSU.y1, 1.0), [-160, -230]);
  Lb('COOLER', wT('c3', 'cooler'), nextBeatStart('c3') - 0.2, () => CW(FIN.x0 + 0.2, FIN.y1, 1.0), [-170, -200]);
  Lb('PASTA TÉRMICA', wT('t3', 'pasta'), E('t3') + 0.3, () => CW(CPU.x - 0.2, CPU.y - 0.2, 0.18), [-60, 300]);
  Lb('SSD', wT('s2', 'ssd'), nextBeatStart('s2') - 0.2, () => CW(SSD.x0 + 0.4, SSD.y0, SSD.z1), [120, 230]);
  Lb('MEMÓRIA RAM', wT('r3', 'memória'), E('r3') + 0.3, () => CW(RAMX[1], 4.15, 0.5), [60, -230]);
  Lb('PLACA DE VÍDEO', wT('g3', 'placa'), E('g3') + 0.3, () => CW(1.6, GPU.y0, 1.0), [80, 260]);
  Lb('WATTS', wT('p3', 'watts'), E('p3') + 0.3, () => CW(3.6, 0.5, PSU.z1), [140, -220]);
  Lb('FLUXO DE AR', wT('a3', 'fluxo'), E('a3') + 0.3, () => CW(0.2, 2.4, 1.3), [180, -320]);

  // ---------- setas
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const Ar = (t0, t1, at, dir, len, col, kind = 'line') => ARROWS.push({ t0, t1, at, dir: new THREE.Vector3(...dir), len, col, kind });
  const GREEN = '#2ecc71', RED = '#ff4d3d', BLUE = '#4d9bff', YEL = '#ffd23f';
  Ar(C.mb0 + 0.9, C.cpuIn + 0.8, () => CW(CPU.x, CPU.y + 0.9, 0.6), [0, -1, 0], 0.6, GREEN);
  Ar(C.psuCab, C.psuCab + 1.6, () => CW(3.0, PSU.y1 + 0.25, 1.4), [0, 1, 0], 0.7, YEL);
  Ar(C.on1 + 0.3, C.hot1, () => CW(CPU.x + 0.3, CPU.y + 0.35, 0.5), [0, 1, 0], 0.5, RED);
  Ar(C.fan0 + 0.6, E('c3'), () => CW(FIN.x0 - 0.15, (FIN.y0 + FIN.y1) / 2, 1.0), [1, 0, 0], 0.6, BLUE);
  Ar(C.fan0 + 0.6, E('c3'), () => CW(CPU.x, CPU.y + 0.1, 0.3), [0, 0, 1], 0.5, RED);
  Ar(C.ssd0 + 0.1, C.ssd0 + 1.2, () => CW(SSD.x1 + 0.5, (SSD.y0 + SSD.y1) / 2, 0.15), [-1, 0, 0], 0.4, GREEN);
  Ar(C.ram0 + 0.1, C.ram0 + 1.0, () => CW(RAMX[0], 4.6, 0.3), [0, -1, 0], 0.5, GREEN);
  Ar(C.gpu0 + 0.5, C.gpuOn, () => CW(2.75, GPU.y0 - 0.5, 0.75), [0, 1, 0], 0.4, GREEN);
  Ar(C.psuOut, C.psuOut + 0.6, () => CW(3.6, 1.4, 0.8), [0, 1, 0], 0.6, RED);
  Ar(C.pcieCab, C.pcieCab + 1.3, () => CW(2.3, 1.3, 1.2), [0, 1, 0], 0.5, YEL);
  for (const y of [1.1, 2.35, 3.6]) Ar(C.fansF + 0.8, E('a3'), () => CW(-0.7, y, 1.05), [1, 0, 0], 0.6, BLUE);
  Ar(C.fanR + 0.6, E('a3'), () => CW(4.6, 3.75, 1.05), [1, 0, 0], 0.6, RED);

  // ---------- efeitos sonoros
  for (let i = 0; i < 6; i++) sfx(C.case0 + 0.25 + i * 0.12, 'clank', 0.4);
  sfx(C.cpu0 + 0.3, 'pop', 0.6);
  sfx(C.plug0, 'whoosh', 0.5); sfx(C.plug0 + 0.45, 'click', 0.7);
  sfx(C.zap1, 'zap', 1.0); sfx(C.zap1 + 0.05, 'blowout', 0.7);
  sfx(C.mb0 + 0.1, 'whoosh', 0.7); sfx(C.mb0 + 0.6, 'clank', 0.8);
  sfx(C.cpuIn + 0.55, 'click', 0.9);
  sfx(C.plug2 + 0.45, 'click', 0.7); sfx(C.zap2, 'zap', 1.0); sfx(C.zap2 + 0.05, 'blowout', 0.6);
  sfx(C.psu0 + 0.1, 'whoosh', 0.6); sfx(C.psu0 + 0.6, 'thud', 0.7); sfx(C.psuCab + 0.5, 'click', 0.7);
  sfx(C.on1, 'click', 0.8); sfx(C.on1 + 0.1, 'powerup', 0.5); sfx(C.on1 + 0.5, 'beep', 0.6);
  sfx(C.on1 + 0.8, 'alarm', 0.4); sfx(C.hot1, 'powerdown', 0.8);
  asmSfx(C.cool0, 1.4, 6, 'clank', 0.4);
  sfx(C.fan0 + 0.4, 'hum', 0.4, E('c3') - C.fan0);
  sfx(C.zoom1, 'whoosh', 0.5); sfx(C.lift, 'slide', 0.4, 0.4); sfx(C.paste + 0.2, 'pop', 0.6); sfx(C.press + 0.3, 'clank', 0.6);
  sfx(C.ssd0 + 0.1, 'whoosh', 0.5); sfx(C.ssd0 + 0.6, 'click', 0.8);
  sfx(C.load1 + 0.2, 'hum', 0.25, C.rwR.a - C.load1 - 0.2);
  sfx(C.ram0 + 0.5, 'click', 0.8); sfx(C.ram0 + 0.8, 'click', 0.8); sfx(C.load2 + 0.8, 'ding', 0.6);
  sfx(C.blackout, 'powerdown', 0.6); sfx(C.blackout + 0.55, 'powerup', 0.4);
  sfx(C.game1 + 0.2, 'creak', 0.4);
  sfx(C.gpu0 + 0.1, 'whoosh', 0.6); asmSfx(C.gpu0, 1.2, 4, 'clank', 0.45); sfx(C.gpuOn, 'ding', 0.7);
  sfx(C.off, 'powerdown', 0.9); sfx(C.off + 0.05, 'snap', 0.4);
  sfx(C.psuOut, 'whoosh', 0.6); sfx(C.psu2 + 0.5, 'thud', 0.7); sfx(C.pcieCab + 0.5, 'click', 0.8);
  sfx(C.glass, 'slide', 0.5, 0.5); sfx(C.glass + 0.8, 'strain', 0.3, Math.max(0.3, C.rwA.a - C.glass - 0.8));
  asmSfx(C.fansF, 1.0, 3, 'clank', 0.5); sfx(C.fanR + 0.4, 'clank', 0.5);
  sfx(C.fansF + 0.9, 'hum', 0.35, E('a3') - C.fansF - 0.9);
  sfx(C.glass2, 'slide', 0.5, 0.5);
  for (const a of C.acc) sfx(a + 0.2, 'pop', 0.6);
  sfx(C.play, 'click', 0.8); sfx(C.play + 0.1, 'ding', 0.6);
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
const cpuBurnt = t => between(t, C.zap1, C.rwH.a) || between(t, C.zap2, C.rwF.a);
const pcShut = t => between(t, C.hot1, C.rwC.a) || between(t, C.off, C.rwP.a) || between(t, C.blackout, C.blackout + 0.55);
const pcOn = t => t >= C.on1 && !pcShut(t);
const gpuIn = t => t >= C.gpuOn;
const glassOn = t => between(t, C.glass, C.rwA.a) || t >= C.glass2;
const dark = t => (between(t, C.blackout, C.blackout + 0.55) ? 0.8 : 0);
function cpuTemp(t) {
  if (t < C.on1) return 24;
  if (t <= C.rwC.a) return t >= C.hot1 ? 101 : lerp(35, 101, EZ.i2(P(t, C.on1, C.hot1 - C.on1)));
  if (t < S('t1')) return lerp(55, 72, P(t, C.rwC.b, 3));
  if (t <= C.rwT.a) return lerp(72, 96, P(t, S('t1'), E('t1') - S('t1')));
  if (t < C.press) return 88;
  let v = lerp(88, 41, EZ.o(P(t, C.press, 1.4)));
  if (between(t, C.glass, C.rwA.a)) v = lerp(41, 97, P(t, C.glass + 0.4, E('a1') - C.glass));
  return v;
}
function gpuTemp(t) {
  let v = 48;
  if (between(t, C.glass, C.rwA.a)) v = lerp(48, 99, P(t, C.glass + 0.4, E('a1') - C.glass));
  return v;
}
// tela do monitor: modo e progresso
function screenMode(t) {
  if (!pcOn(t)) return 'off';
  if (t < C.on1 + 1.4) return 'boot';
  if (t < C.ssd0 + 0.5) return 'desk';
  if (t < S('r1')) return 'copy';
  if (t <= C.rwR.a && t >= C.load1) return 'slow';
  if (t < C.load2) return 'desk';
  if (t < C.load2 + 0.9) return 'fast';
  if (t < S('g1')) return 'title';
  if (t <= C.rwG.a) return 'choppy';
  if (t < C.gpuOn) return 'title';
  return 'game';
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
const COL = {
  wall: '#5b62a8', floor: '#9a7458', desk: '#a8744c', deskDark: '#6e4a2f', case: '#e8ebf0', case2: '#cfd4dc',
  board: '#2f5d50', steel: '#c4ccd8', dsteel: '#2f343c', copper: '#d0814a', fin: '#c9d1dc', ram: '#2a2d35',
  pcb: '#1c5c3a', ssd: '#1f3b6e', gpu: '#2a2e36', psu: '#15171c', screen: '#0b0d12', white: '#eef0f3',
};
const R = {};
const RGB = []; // peças que acendem com as luzinhas coloridas
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function cablePool(n, r, col) {
  const pool = [];
  for (let i = 0; i < n; i++) { const m = mesh(GEO.cyl, M(col, { roughness: 0.5 })); m.visible = false; scene.add(m); pool.push(m); }
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
    m.visible = true; m.scale.set(rope.r, l + rope.r * 0.9, rope.r);
    m.position.copy(a).add(_v).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(_up, _d);
  }
  for (; k < rope.pool.length; k++) rope.pool[k].visible = false;
}
// curva suave por pontos de controle (para cabos)
function smoothPath(ctrl, n = 24) {
  const c = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
  return c.getPoints(n);
}
function canvasTex(w, h, fn) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; return tx;
}
// ventoinha: anel + hélices; eixo 'x', 'y' ou 'z'
function makeFan(parent, x, y, z, r, axis, frame = false) {
  const g = grp(parent, x, y, z);
  const spin = grp(g);
  const rot = grp(g);
  if (axis === 'x') rot.rotation.z = Math.PI / 2;
  if (axis === 'z') rot.rotation.x = Math.PI / 2;
  rot.add(spin);
  const ring = mesh(new THREE.TorusGeometry(r, r * 0.07, 10, 40), M('#30343d', { roughness: 0.4 }));
  ring.rotation.x = Math.PI / 2; spin.parent.add(ring);
  const glow = mesh(new THREE.TorusGeometry(r * 0.93, r * 0.025, 8, 40), new THREE.MeshStandardMaterial({ color: '#222', emissive: '#000000', emissiveIntensity: 1.5 }), false);
  glow.rotation.x = Math.PI / 2; spin.parent.add(glow);
  RGB.push(glow);
  const hub = mesh(new THREE.CylinderGeometry(r * 0.28, r * 0.28, r * 0.25, 20), M('#1b1d22'));
  spin.add(hub);
  for (let k = 0; k < 7; k++) {
    const b = mesh(GEO.box, M('#3a3f4a', { roughness: 0.45 }));
    b.scale.set(r * 0.62, r * 0.04, r * 0.3);
    const holder = new THREE.Group(); holder.rotation.y = k * Math.PI * 2 / 7; spin.add(holder);
    b.position.set(r * 0.55, 0, 0); b.rotation.x = 0.45; holder.add(b);
  }
  if (frame) {
    const fm = M('#22252c');
    const s = r * 1.05, w = r * 0.09, th = r * 0.22;
    // em 'rot' o eixo do ventilador é y: o quadro fica no plano xz, sem peças sobrepostas
    boxC(-s, -th, s - w, s, th, s, fm, rot); boxC(-s, -th, -s, s, th, -s + w, fm, rot);
    boxC(s - w, -th, -s + w, s, th, s - w, fm, rot); boxC(-s, -th, -s + w, -s + w, th, s - w, fm, rot);
  }
  g.userData = { spin, ring, glow };
  return g;
}
function buildRoom() {
  boxC(-40, FLOOR - 0.5, -6.2, 40, FLOOR, 30, M(COL.floor, { roughness: 0.8 }));
  boxC(-40, FLOOR, -6.4, 40, 30, -6.2, M(COL.wall, { roughness: 0.9 }));
  // mesa
  const dm = M(COL.desk, { roughness: 0.55 });
  boxC(-9.5, -0.45, -4.4, 9.5, 0, 3.5, dm);
  boxC(-9.5, -0.45, 3.5, 9.5, 0, 3.56, M(COL.deskDark));
  for (const [x, z] of [[-9.1, -4.0], [8.5, -4.0], [-9.1, 2.6], [8.5, 2.6]]) boxC(x, FLOOR, z, x + 0.6, -0.45, z + 0.6, M(COL.deskDark));
  // fita de LED na parede (acende no final)
  R.wallLed = boxC(-9, 0.5, -6.2, 9, 0.62, -6.15, new THREE.MeshStandardMaterial({ color: '#222', emissive: '#000000', emissiveIntensity: 1.6 }), null);
  RGB.push(R.wallLed);
  // prateleira com bonequinhos
  boxC(-8, 7.0, -6.2, -2, 7.2, -5.3, M(COL.deskDark));
  sph(0.45, M('#ffc62b'), -6.8, 7.65, -5.75); sph(0.35, M('#e63946'), -5.4, 7.55, -5.75);
  boxC(-4.4, 7.2, -5.95, -3.6, 8.1, -5.5, M('#4d7cfe'));
  // quadros
  const poster = (x, y, w, h, fn) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: canvasTex(512, Math.round(512 * h / w), fn), roughness: 0.7 })); p.position.set(x, y, -6.17); scene.add(p); };
  poster(1.5, 9.0, 4.2, 3.0, (g, w, h) => { g.fillStyle = '#121829'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffc62b'; g.beginPath(); g.arc(w * 0.5, h * 0.58, h * 0.32, Math.PI, 0); g.fill(); g.fillRect(w * 0.12, h * 0.56, w * 0.76, h * 0.08); g.font = `700 ${h * 0.14}px F`; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText('OBRA ENTREGUE', w / 2, h * 0.88); });
  poster(7.2, 9.4, 3.0, 4.0, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#ff3d7f'); gr.addColorStop(1, '#4d7cfe'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.font = `700 ${w * 0.22}px F`; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText('GAME', w / 2, h * 0.45); g.fillText('ON', w / 2, h * 0.7); });
  // tomada (padrão brasileiro, 3 furos)
  boxC(OUTLET.x - 0.4, OUTLET.y - 0.5, -6.2, OUTLET.x + 0.4, OUTLET.y + 0.5, -6.12, M(COL.white, { roughness: 0.4 }));
  const hole = M('#222');
  for (const [dx, dy] of [[-0.12, 0.05], [0.12, 0.05], [0, -0.16]]) cylZ(0.045, 0.02, hole, OUTLET.x + dx, OUTLET.y + dy, -6.11);
  // monitor
  const mk = M('#15171c', { roughness: 0.35 });
  boxC(-6.0, 0, -2.6, -3.2, 0.08, -1.6, mk);
  boxC(-4.8, 0.08, -2.3, -4.4, 1.6, -2.1, mk);
  boxC(SCREEN.x - 3.0, SCREEN.y - 1.7, -2.1, SCREEN.x + 3.0, SCREEN.y + 1.7, -1.9, mk);
  R.scrCanvas = document.createElement('canvas'); R.scrCanvas.width = 640; R.scrCanvas.height = 360;
  R.scrTex = new THREE.CanvasTexture(R.scrCanvas); R.scrTex.colorSpace = THREE.SRGBColorSpace;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w - 0.25, SCREEN.h - 0.25), new THREE.MeshBasicMaterial({ map: R.scrTex, toneMapped: false }));
  scr.position.set(SCREEN.x, SCREEN.y, SCREEN.z); scene.add(scr);
  R.scrLight = new THREE.PointLight('#6fa8ff', 0, 9, 1.5); R.scrLight.position.set(SCREEN.x, SCREEN.y, SCREEN.z + 1.5); scene.add(R.scrLight);
}
function buildCase() {
  const g = grp(null, CASE.x, CASE.y, CASE.z); R.case = g;
  const { L, H, D, t } = CASE;
  const cm = M(COL.case, { roughness: 0.45, metalness: 0.2 });
  const mesht = canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#d9dde4'; c.fillRect(0, 0, w, h); c.fillStyle = '#9aa1ad'; for (let y = 8; y < h; y += 16) for (let x = 8 + ((y / 16) % 2) * 8; x < w; x += 16) { c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill(); } });
  mesht.wrapS = mesht.wrapT = THREE.RepeatWrapping; mesht.repeat.set(3, 3);
  const parts = [
    [boxC(0, 0, 0, L, H, t, cm, g), { dz: -3 }],
    [boxC(0, 0, t, L, t, D, cm, g), { dy: -3 }],
    [boxC(0, H - t, t, L, H, D, cm, g), { dy: 3 }],
    [boxC(0, t, t, t, H - t, D, new THREE.MeshStandardMaterial({ map: mesht, roughness: 0.6 }), g), { dx: -3 }],
    [boxC(L - t, t, t, L, H - t, D, cm, g), { dx: 3 }],
  ];
  parts.forEach(([m, f], i) => asm(m, C.case0 + 0.1 + i * 0.12, 0.55, { dy: 0, ...f, ry: 0.6, s: 0.6 }));
  for (const [x, z] of [[0.25, 0.25], [L - 0.65, 0.25], [0.25, D - 0.65], [L - 0.65, D - 0.65]]) asm(boxC(x, -0.15, z, x + 0.4, 0, z + 0.4, M('#0f1014'), g), C.case0 + 0.7, 0.4, { dy: -1 });
  // botão de ligar com LED
  R.powerLed = sph(0.06, new THREE.MeshStandardMaterial({ color: '#334', emissive: '#3dff8a', emissiveIntensity: 0 }), 0.35, H + 0.01, D - 0.4, g);
  // vidro lateral (aparece no "forno" e no final)
  R.glass = mesh(GEO.box, new THREE.MeshPhysicalMaterial({ color: '#b8d8ff', transparent: true, opacity: 0.16, roughness: 0.05, depthWrite: false }), false);
  R.glass.scale.set(L - 0.02, H - 0.02, 0.04); R.glass.position.set(L / 2, H / 2, D + 0.03); g.add(R.glass);
}
function buildBoard() {
  const g = grp(R.case); R.mb = g;
  const tex = canvasTex(512, 640, (c, w, h) => {
    c.fillStyle = COL.board; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(120,200,170,.35)'; c.lineWidth = 2;
    for (let i = 0; i < 60; i++) { const x = rnd(i) * w, y = rnd(i + 40) * h; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rnd(i + 9) - 0.5) * 160, y); c.lineTo(x + (rnd(i + 9) - 0.5) * 160, y + (rnd(i + 3) - 0.5) * 200); c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,.75)'; c.font = '700 26px F'; c.fillText('OBRA-BOARD Z790', 30, h - 30);
  });
  boxC(MB.x0, MB.y0, MB.z0, MB.x1, MB.y1, MB.z1, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), g);
  const z = MB.z1;
  boxC(SOCK.x0, SOCK.y0, z, SOCK.x1, SOCK.y1, SOCK.z1, M(COL.steel, { metalness: 0.6, roughness: 0.3 }), g);
  boxC(2.45, 3.3, z, 2.7, 3.95, 0.3, M('#3a3f4a', { metalness: 0.4 }), g);
  boxC(2.8, 3.95, z, 3.4, 4.2, 0.3, M('#3a3f4a', { metalness: 0.4 }), g);
  boxC(2.05, 4.12, z, 2.35, 4.32, 0.28, M('#1b1b1b'), g);
  for (const x of RAMX) boxC(x - 0.035, 2.85, z, x + 0.035, 4.2, 0.16, M('#111214'), g);
  boxC(PCIE.x0, PCIE.y0, z, PCIE.x1, PCIE.y1, PCIE.z1, M('#111214'), g);
  boxC(SSD.x0 - 0.12, SSD.y0, z, SSD.x0, SSD.y1, 0.14, M('#111214'), g);
  boxC(2.0, 2.9, z, 2.12, 3.6, 0.32, M('#e8e8e8'), g);
  boxC(3.3, 1.55, z, 3.9, 2.0, 0.22, M('#3a3f4a', { metalness: 0.4 }), g);
  boxC(4.05, 3.4, z, 4.37, 4.3, 0.4, M('#2b2f39', { metalness: 0.3 }), g);
  for (let i = 0; i < 6; i++) { const c = mesh(GEO.cyl, M('#2b2b30', { metalness: 0.5 })); c.scale.set(0.05, 0.14, 0.05); c.rotation.x = Math.PI / 2; c.position.set(2.55 + i * 0.12, 3.18, z + 0.07); g.add(c); }
  asm(g, () => C.mb0, 0.8, { dy: 0, dz: 6, ry: 1.2, s: 0.5 });
}
function buildCPU() {
  const g = grp(null); R.cpu = g;
  boxC(-CPU.s / 2, 0, -CPU.s / 2, CPU.s / 2, 0.02, CPU.s / 2, M('#2a6b43'), g);
  R.ihs = boxC(-0.17, 0.02, -0.17, 0.17, 0.04, 0.17, new THREE.MeshStandardMaterial({ color: '#d7dbe2', metalness: 0.75, roughness: 0.25 }), g);
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.1), new THREE.MeshBasicMaterial({ map: textTex('CORE i9', { w: 256, h: 96, font: '700 60px F', col: '#555' }), transparent: true }));
  lbl.rotation.x = -Math.PI / 2; lbl.position.set(0, 0.042, 0); g.add(lbl);
  R.cpuLbl = lbl;
}
function buildCooler() {
  const g = grp(R.case); R.cool = g;
  const base = boxC(SOCK.x0, SOCK.y0, 0.18, SOCK.x1, SOCK.y1, 0.28, M(COL.copper, { metalness: 0.7, roughness: 0.3 }), g);
  asm(base, () => C.cool0, 0.5, { dy: 0, dz: 3, s: 0.5 });
  const pipes = grp(g);
  for (const x of [2.86, 3.0, 3.14, 3.27]) { const c = mesh(GEO.cyl, M(COL.copper, { metalness: 0.7, roughness: 0.3 })); c.scale.set(0.035, 1.3, 0.035); c.rotation.x = Math.PI / 2; c.position.set(x, CPU.y, 0.28 + 0.65); pipes.add(c); }
  asm(pipes, () => C.cool0 + 0.25, 0.5, { dy: 0, dz: 3 });
  const finM = M(COL.fin, { metalness: 0.6, roughness: 0.35 });
  for (let k = 0; k < FIN.n; k++) {
    const z0 = FIN.z0 + k * FIN.gap;
    const f = boxC(FIN.x0, FIN.y0, z0, FIN.x1, FIN.y1, z0 + 0.02, finM, g);
    asm(f, () => C.cool0 + 0.4 + k * 0.04, 0.35, { dy: 3, ry: 1.5 });
  }
  const cap = boxC(FIN.x0, FIN.y0, 1.56, FIN.x1, FIN.y1, 1.6, M('#1d2027'), g);
  asm(cap, () => C.cool0 + 1.25, 0.4, { dy: 0, dz: 2, rz: 2 });
  R.coolFan = makeFan(g, FIN.x0 - 0.14, (FIN.y0 + FIN.y1) / 2, 1.0, 0.52, 'x', true);
  asm(R.coolFan, () => C.fan0, 0.5, { dy: 0, dx: -3, rx: 3, s: 0.3 });
  // pasta térmica e seringa
  R.paste = mesh(GEO.cyl, M('#8d939c', { roughness: 0.6 }), false);
  R.paste.rotation.x = Math.PI / 2; g.add(R.paste);
  R.syringe = grp(null);
  const body = mesh(GEO.cyl, M('#e9edf2', { roughness: 0.3 })); body.scale.set(0.09, 0.9, 0.09); body.position.y = 0.55; R.syringe.add(body);
  const tip = mesh(new THREE.ConeGeometry(0.09, 0.2, 16), M('#8d939c')); tip.rotation.x = Math.PI; tip.position.y = 0.0; R.syringe.add(tip);
}
function buildSSD() {
  const g = grp(R.case); R.ssd = g;
  boxC(SSD.x0, SSD.y0, SSD.z0, SSD.x1, SSD.y1, SSD.z1, M(COL.ssd), g);
  for (const x of [2.5, 2.72, 2.94]) boxC(x, SSD.y0 + 0.03, SSD.z1, x + 0.17, SSD.y1 - 0.03, 0.14, M('#15171c'), g);
  asm(g, () => C.ssd0, 0.7, { dy: 0, dx: 2.5, dz: 1.5, rz: 2, s: 0.4 });
}
function buildRAM() {
  R.rams = [];
  RAMX.forEach((x, i) => {
    const g = grp(R.case);
    boxC(x - 0.02, 2.9, 0.16, x + 0.02, 4.15, 0.45, M(COL.pcb), g);
    boxC(x - 0.035, 2.92, 0.17, x - 0.02, 4.13, 0.47, M(COL.ram, { metalness: 0.4 }), g);
    boxC(x + 0.02, 2.92, 0.17, x + 0.035, 4.13, 0.47, M(COL.ram, { metalness: 0.4 }), g);
    const strip = boxC(x - 0.03, 2.95, 0.47, x + 0.03, 4.1, 0.5, new THREE.MeshStandardMaterial({ color: '#333', emissive: '#000000', emissiveIntensity: 1.6 }), g);
    RGB.push(strip);
    R.rams.push({ g, strip });
    asm(g, () => C.ram0 + i * 0.3, 0.45, { dy: 0, dz: 2.5, ry: 2, s: 0.5 });
  });
}
function buildGPU() {
  const g = grp(R.case); R.gpu = g;
  const inner = grp(g); R.gpuInner = inner;
  boxC(GPU.x0, 2.56, GPU.z0, GPU.x1, 2.6, 1.28, M(COL.pcb), inner);
  boxC(GPU.x0, 2.6, GPU.z0, GPU.x1, 2.64, 1.28, M('#3a3f4a', { metalness: 0.5 }), inner);
  boxC(GPU.x0, GPU.y0, 0.17, GPU.x1, 2.56, GPU.z1, M(COL.gpu, { metalness: 0.35, roughness: 0.4 }), inner);
  R.gpuStripe = boxC(GPU.x0 + 0.2, 2.25, GPU.z1, GPU.x1 - 0.2, 2.35, GPU.z1 + 0.02, new THREE.MeshStandardMaterial({ color: '#333', emissive: '#000000', emissiveIntensity: 1.6 }), inner);
  RGB.push(R.gpuStripe);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.16), new THREE.MeshBasicMaterial({ map: textTex('OBRA RTX', { w: 512, h: 96, font: '700 72px F', col: '#c9d1dc' }), transparent: true }));
  logo.position.set(GPU.x1 - 0.7, 2.45, GPU.z1 + 0.01); inner.add(logo);
  boxC(4.3, 2.0, GPU.z0, 4.36, 2.7, 0.9, M(COL.steel, { metalness: 0.7 }), inner);
  boxC(1.6, 2.64, 0.9, 1.95, 2.74, 1.2, M('#111214'), inner);
  R.gpuFans = [1.75, 2.75, 3.75].map(x => makeFan(inner, x, GPU.y0 - 0.06, 0.75, 0.42, 'y'));
  asm(inner, () => C.gpu0, 1.0, { dy: 0, dz: 4, rx: 0.8, s: 0.6 });
}
function buildPSUs() {
  const mk = (watts, accent) => {
    const g = grp(R.case);
    boxC(PSU.x0, PSU.y0, PSU.z0, PSU.x1, PSU.y1, PSU.z1, M(COL.psu, { roughness: 0.5 }), g);
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshBasicMaterial({ map: canvasTex(320, 160, (c, w, h) => { c.fillStyle = '#202329'; c.fillRect(0, 0, w, h); c.fillStyle = accent; c.fillRect(0, h - 26, w, 26); c.font = '700 38px F'; c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText('FONTE', w / 2, 52); c.font = '700 56px F'; c.fillStyle = accent; c.fillText(watts, w / 2, 112); }) }));
    lbl.position.set((PSU.x0 + PSU.x1) / 2, (PSU.y0 + PSU.y1) / 2, PSU.z1 + 0.01); g.add(lbl);
    const fan = makeFan(g, (PSU.x0 + PSU.x1) / 2, PSU.y1 + 0.03, (PSU.z0 + PSU.z1) / 2, 0.5, 'y');
    return { g, fan };
  };
  R.psuA = mk('550W', '#4d9bff');
  R.psuB = mk('850W', '#ffd23f');
  asm(R.psuA.g, () => C.psu0, 0.7, { dy: 4, dz: 2, ry: 1.5, s: 0.5 });
}
function buildCaseFans() {
  R.caseFans = [1.1, 2.35, 3.6].map((y, i) => {
    const f = makeFan(R.case, 0.19, y, 1.05, 0.55, 'x', true);
    asm(f, () => C.fansF + i * 0.25, 0.5, { dy: 0, dx: -3, rx: 3, s: 0.3 });
    return f;
  });
  R.rearFan = makeFan(R.case, 4.31, 3.75, 1.05, 0.55, 'x', true);
  asm(R.rearFan, () => C.fanR, 0.5, { dy: 0, dx: 3, rx: -3, s: 0.3 });
}
function buildDeskStuff() {
  const kb = grp(null); R.kb = kb;
  boxC(-6.6, 0, 1.0, -2.6, 0.18, 2.4, M('#15171c'), kb);
  const keys = canvasTex(512, 180, (c, w, h) => { c.fillStyle = '#15171c'; c.fillRect(0, 0, w, h); for (let r = 0; r < 5; r++) for (let k = 0; k < 15; k++) { c.fillStyle = '#2b2f39'; c.fillRect(8 + k * 33, 8 + r * 34, 28, 28); } });
  const kt = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 1.3), new THREE.MeshStandardMaterial({ map: keys, roughness: 0.6 }));
  kt.rotation.x = -Math.PI / 2; kt.position.set(-4.6, 0.19, 1.7); kb.add(kt);
  R.kbGlow = boxC(-6.55, 0.18, 2.36, -2.65, 0.2, 2.4, new THREE.MeshStandardMaterial({ color: '#222', emissive: '#000000', emissiveIntensity: 1.6 }), kb);
  RGB.push(R.kbGlow);
  asm(kb, () => C.acc[0], 0.5, { dy: 3, ry: 1.2, s: 0.4 });
  const ms = grp(null); R.mouse = ms;
  boxC(-2.3, 0, 0.6, 0.2, 0.03, 2.8, M('#1d2027', { roughness: 0.9 }), ms);
  const m = sph(1, M('#15171c', { roughness: 0.35 }), -1.0, 0.12, 1.7, ms); m.scale.set(0.32, 0.16, 0.5);
  asm(ms, () => C.acc[1], 0.5, { dy: 3, ry: -1.2, s: 0.4 });
  const hs = grp(null, -8.0, 0, -1.0); R.headset = hs;
  boxC(-0.3, 0, -0.3, 0.3, 0.06, 0.3, M('#15171c'), hs);
  boxC(-0.06, 0.06, -0.06, 0.06, 1.6, 0.06, M('#15171c'), hs);
  const band = mesh(new THREE.TorusGeometry(0.55, 0.06, 10, 30, Math.PI), M('#1d2027')); band.position.y = 1.15; hs.add(band);
  for (const s of [-1, 1]) { const cup = sph(1, M('#e63946'), s * 0.58, 1.05, 0, hs); cup.scale.set(0.16, 0.3, 0.26); }
  asm(hs, () => C.acc[2], 0.5, { dy: 3, ry: 2, s: 0.4 });
}
function buildEffects() {
  R.outCable = cablePool(40, 0.06, '#1b1b1b');
  R.cab24 = cablePool(30, 0.09, '#232323');
  R.cab8 = cablePool(30, 0.06, '#232323');
  R.cabPci = cablePool(30, 0.07, '#232323');
  R.smoke = []; for (let i = 0; i < 18; i++) { const m = mesh(GEO.sph, new THREE.MeshStandardMaterial({ color: '#4a4a50', transparent: true, opacity: 0.6, roughness: 1, depthWrite: false }), false); m.visible = false; scene.add(m); R.smoke.push(m); }
  R.sparks = []; for (let i = 0; i < 40; i++) { const m = mesh(GEO.sph, new THREE.MeshBasicMaterial({ color: '#ffe066' }), false); m.visible = false; scene.add(m); R.sparks.push(m); }
  R.data = []; for (let i = 0; i < 36; i++) { const m = mesh(GEO.sph, new THREE.MeshBasicMaterial({ color: '#3dffb0', toneMapped: false }), false); m.visible = false; scene.add(m); R.data.push(m); }
  R.air = []; for (let i = 0; i < 60; i++) { const m = mesh(GEO.sph, new THREE.MeshBasicMaterial({ color: '#6fc3ff', transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false }), false); m.visible = false; scene.add(m); R.air.push(m); }
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
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _eu = new THREE.Euler();
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function spinFan(f, on, t, speed) { f.userData.spin.rotation.y = on ? t * speed : 0.3; }
function updateWorld(t) {
  applyAsm(t);
  const dk = dark(t);
  hemi.intensity = lerp(1.9, 0.3, dk); sun.intensity = lerp(3.0, 0.2, dk); fill.intensity = lerp(1.3, 0.15, dk); R.caseLight.intensity = lerp(10, 1, dk);
  const on = pcOn(t);
  // processador: na mesa, depois voa para o soquete
  R.cpu.visible = t >= C.cpu0;
  const app = EZ.back(P(t, C.cpu0, 0.5));
  const cp = EZ.io(P(t, C.cpuIn, 0.7));
  const sock = CW(CPU.x, CPU.y, SOCK.z1);
  R.cpu.position.set(lerp(DESKCPU.x, sock.x, cp), lerp(DESKCPU.y, sock.y, cp) + Math.sin(Math.PI * cp) * 2.5, lerp(DESKCPU.z, sock.z, cp));
  _q1.identity(); _q2.setFromEuler(_eu.set(Math.PI / 2, 0, 0));
  R.cpu.quaternion.slerpQuaternions(_q1, _q2, cp);
  R.cpu.rotateY(Math.sin(Math.PI * cp) * 2.5);
  R.cpu.scale.setScalar(Math.max(0.001, app));
  const burnt = cpuBurnt(t);
  R.ihs.material.color.set(burnt ? '#2b2420' : '#d7dbe2');
  R.cpuLbl.visible = !burnt;
  // cooler sobe para a pasta e desce de novo
  let lift = 0;
  if (between(t, C.lift, C.press)) lift = EZ.io(P(t, C.lift, 0.4));
  else if (between(t, C.press, C.press + 0.45)) lift = 1 - EZ.io(P(t, C.press, 0.45));
  R.cool.position.z = 1.6 * lift;
  R.paste.visible = between(t, C.paste + 0.15, C.press + 0.3);
  const pr = lerp(0.03, 0.14, EZ.o(P(t, C.paste + 0.2, 0.6)));
  R.paste.scale.set(pr, 0.008, pr); R.paste.position.set(CPU.x, CPU.y, SOCK.z1 + 0.04 + 0.004);
  R.syringe.visible = between(t, C.paste - 0.3, C.paste + 0.9);
  if (R.syringe.visible) {
    const sp = EZ.o(P(t, C.paste - 0.3, 0.4)) - EZ.i2(P(t, C.paste + 0.5, 0.4));
    const w = CW(CPU.x, CPU.y, SOCK.z1 + 0.06 + (1 - sp) * 1.5);
    R.syringe.position.copy(w); R.syringe.rotation.set(Math.PI / 2, 0, 0.25);
  }
  // ventoinhas
  spinFan(R.coolFan, on && t >= C.fan0 + 0.4, t, 22);
  R.gpuFans.forEach(f => spinFan(f, on && gpuIn(t), t, 18));
  spinFan(R.psuA.fan, on, t, 15); spinFan(R.psuB.fan, on, t, 15);
  R.caseFans.forEach(f => spinFan(f, on, t, 16)); spinFan(R.rearFan, on, t, 16);
  // troca da fonte
  const outP = P(t, C.psuOut, 0.5);
  R.psuA.g.visible = t >= C.psu0 && outP < 1;
  if (outP > 0 && outP < 1) { R.psuA.g.position.set(0, 4.5 * EZ.i2(outP), 3 * outP); R.psuA.g.rotation.set(0, 0, 0.8 * outP); }
  const inP = P(t, C.psu2, 0.7);
  R.psuB.g.visible = inP > 0;
  if (inP > 0) { const e = EZ.back(inP); R.psuB.g.position.set(0, 4.5 * (1 - e), 2.5 * (1 - e)); R.psuB.g.rotation.set(0, 1.5 * (1 - e), 0); }
  // gabinete: LED, vidro, calor
  R.powerLed.material.emissiveIntensity = on ? 2.2 : 0;
  R.glass.visible = glassOn(t);
  const gs = t >= C.glass2 ? C.glass2 : C.glass;
  R.glass.position.z = CASE.D + 0.03 + 3 * (1 - EZ.o(P(t, gs, 0.5)));
  const heat = between(t, C.glass, C.rwA.a) ? P(t, C.glass + 0.4, E('a1') - C.glass) : 0;
  R.heatLight.intensity = 14 * heat;
  // monitor
  drawScreen(t);
  R.scrTex.needsUpdate = true;
  R.scrLight.intensity = on ? 4 : 0;
  // luzinhas coloridas
  const rgb = P(t, C.acc[3], 0.6);
  RGB.forEach((m, i) => {
    if (rgb > 0) { m.material.emissive.setHSL((t * 0.22 + i * 0.09) % 1, 1, 0.5); m.material.emissiveIntensity = 1.8 * rgb; }
    else { m.material.emissive.set('#000000'); }
  });
  updateCables(t);
  updateParticles(t, on);
}
function updateCables(t) {
  const desk = (x, z) => V3(x, 0.07, z);
  // gancho: tomada direto no processador
  if (between(t, C.plug0, C.rwH.a)) drawPoly(R.outCable, smoothPath([OUTLET.clone(), V3(7.0, 0.8, -5.9), desk(6.4, -4.0), desk(4.6, -0.6), desk(DESKCPU.x + 0.6, DESKCPU.z), V3(DESKCPU.x + 0.2, 0.05, DESKCPU.z)]), EZ.o(P(t, C.plug0, 0.5)));
  else if (between(t, C.plug2, C.rwF.a)) drawPoly(R.outCable, smoothPath([OUTLET.clone(), V3(7.0, 0.8, -5.9), desk(6.4, -3.6), V3(5.8, 1.5, 0.2), CW(2.7, 3.25, 2.4), CW(2.06, 3.25, 0.4)]), EZ.o(P(t, C.plug2, 0.5)));
  else if (t >= C.psu0 + 0.5) drawPoly(R.outCable, smoothPath([OUTLET.clone(), V3(7.0, 0.8, -5.9), desk(6.6, -4.2), desk(6.2, -2.4), CW(4.95, 0.5, 0.85), CW(4.52, 0.5, 0.85)]), EZ.o(P(t, C.psu0 + 0.5, 0.5)));
  else drawPoly(R.outCable, [], 0);
  // cabos internos da fonte
  if (t >= C.psuCab) {
    const q = EZ.o(P(t, C.psuCab, 0.6));
    drawPoly(R.cab24, smoothPath([CW(2.95, 0.94, 1.3), CW(1.7, 1.5, 1.5), CW(1.75, 3.0, 1.5), CW(2.0, 3.25, 0.6), CW(2.06, 3.25, 0.34)]), q);
    drawPoly(R.cab8, smoothPath([CW(3.1, 0.94, 1.45), CW(0.9, 1.4, 1.55), CW(0.9, 4.25, 1.4), CW(2.2, 4.25, 0.5), CW(2.2, 4.22, 0.3)]), q);
  } else { drawPoly(R.cab24, [], 0); drawPoly(R.cab8, [], 0); }
  if (t >= C.pcieCab) drawPoly(R.cabPci, smoothPath([CW(3.3, 0.94, 1.45), CW(1.5, 1.3, 1.6), CW(1.5, 2.9, 1.55), CW(1.78, 2.95, 1.05), CW(1.78, 2.76, 1.05)]), EZ.o(P(t, C.pcieCab, 0.6)));
  else drawPoly(R.cabPci, [], 0);
}
function burstPts(t, t0, origin, n, pool, offset, opt) {
  const a = t - t0; if (a < 0 || a > opt.life) return offset;
  for (let i = 0; i < n && offset < pool.length; i++, offset++) {
    const m = pool[offset];
    const ang = rnd(i + opt.seed) * Math.PI * 2, el = rnd(i + opt.seed + 9) * 1.2 - 0.2, v = opt.spd * (0.4 + rnd(i + opt.seed + 50) * 0.8);
    m.visible = true;
    m.position.set(origin.x + Math.cos(ang) * Math.cos(el) * v * a, origin.y + Math.sin(el) * v * a - opt.g * a * a, origin.z + Math.sin(ang) * Math.cos(el) * v * a);
    m.scale.setScalar(opt.size * (1 - a / opt.life * 0.6));
  }
  return offset;
}
const DATA_PATH = () => [CW(2.8, 1.71, 0.25), CW(3.3, 2.75, 0.6), CW(3.79, 3.0, 0.6), CW(3.79, 3.9, 0.6), CW(3.3, 3.6, 0.5), CW(CPU.x, CPU.y, 0.35)];
let _dataCurve = null;
function updateParticles(t, on) {
  // fumaça do processador queimando
  R.smoke.forEach(m => (m.visible = false));
  const smokeAt = (t0, t1, base) => {
    if (!between(t, t0, t1)) return;
    R.smoke.forEach((m, i) => {
      const life = 1.4 + rnd(i) * 0.7; const a0 = t - t0 - i * 0.06; if (a0 < 0) return;
      const k = (a0 % life) / life;
      m.visible = true; m.position.set(base.x + (rnd(i + 3) - 0.5) * 0.3 + k * 0.2, base.y + k * 2.2, base.z + (rnd(i + 7) - 0.5) * 0.3);
      m.scale.setScalar(0.06 + k * 0.4); m.material.opacity = 0.6 * (1 - k);
    });
  };
  smokeAt(C.zap1, C.rwH.a, V3(DESKCPU.x, 0.1, DESKCPU.z));
  smokeAt(C.zap2, C.rwF.a, CW(CPU.x, CPU.y + 0.1, 0.25));
  let s = 0;
  R.sparks.forEach(m => (m.visible = false));
  for (let j = 0; j < 3; j++) {
    s = burstPts(t, C.zap1 + j * 0.1, V3(DESKCPU.x + 0.2, 0.08, DESKCPU.z), 6, R.sparks, s, { life: 0.4, spd: 2.5, g: 4, size: 0.03, seed: 10 + j * 9 });
    s = burstPts(t, C.zap2 + j * 0.1, CW(CPU.x, CPU.y, 0.25), 6, R.sparks, s, { life: 0.4, spd: 2.5, g: 4, size: 0.03, seed: 60 + j * 9 });
  }
  // dados indo do SSD para o processador
  _dataCurve ??= new THREE.CatmullRomCurve3(DATA_PATH());
  R.data.forEach(m => (m.visible = false));
  const slow = between(t, C.load1, C.rwR.a), fast = between(t, C.load2 - 0.3, E('r3') + 0.2) && !between(t, C.blackout, C.blackout + 0.55);
  if (slow || fast) {
    const n = slow ? 4 : R.data.length, speed = slow ? 0.07 : 0.9;
    for (let i = 0; i < n; i++) {
      const u = ((t * speed + i / n) % 1 + 1) % 1;
      const m = R.data[i]; m.visible = true;
      m.position.copy(_dataCurve.getPointAt(u)); m.scale.setScalar(0.05);
    }
  }
  // fluxo de ar: entra frio pela frente, sai quente por trás
  R.air.forEach(m => (m.visible = false));
  if (on && t >= C.fansF + 0.8) {
    const k = P(t, C.fansF + 0.8, 0.6);
    R.air.forEach((m, i) => {
      const life = 2.2, u = ((t / life + rnd(i)) % 1 + 1) % 1;
      const x = -0.4 + u * (CASE.L + 0.9);
      const y0 = 0.7 + rnd(i + 11) * 3.3;
      const y = y0 + u * u * (3.75 - y0) * (t >= C.fanR + 0.4 ? 0.9 : 0.2);
      const z = 0.5 + rnd(i + 23) * 1.1;
      m.visible = true; m.position.copy(CW(x, y, z));
      m.scale.set(0.09, 0.03, 0.03).multiplyScalar(k);
      m.material.color.setHSL(lerp(0.58, 0.0, u), 1, 0.6);
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
  const [a, b] = ['COMO CONSTRUIR UM ', 'PC GAMER'];
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
// ================================================================ tela do monitor
function drawGame(g, w, h, tg, fps, fpsCol) {
  const sky = g.createLinearGradient(0, 0, 0, h * 0.55); sky.addColorStop(0, '#2d6cdf'); sky.addColorStop(1, '#ff9a5a');
  g.fillStyle = sky; g.fillRect(0, 0, w, h * 0.55);
  g.fillStyle = '#ffd36b'; g.beginPath(); g.arc(w * 0.72, h * 0.36, 34, 0, 7); g.fill();
  g.fillStyle = '#5a3a7a';
  for (let k = 0; k < 6; k++) { const x = ((k * 160 - tg * 20) % (w + 200) + w + 200) % (w + 200) - 100; g.beginPath(); g.moveTo(x - 120, h * 0.55); g.lineTo(x, h * 0.3); g.lineTo(x + 120, h * 0.55); g.fill(); }
  g.fillStyle = '#2f8f4a'; g.fillRect(0, h * 0.55, w, h * 0.45);
  g.fillStyle = '#3a3d45'; g.beginPath(); g.moveTo(w * 0.47, h * 0.55); g.lineTo(w * 0.53, h * 0.55); g.lineTo(w * 0.95, h); g.lineTo(w * 0.05, h); g.fill();
  g.fillStyle = '#f2f2f2';
  for (let k = 0; k < 8; k++) {
    const u = ((k / 8 + tg * 0.9) % 1);
    const y = h * 0.55 + Math.pow(u, 2.2) * h * 0.45, s = 2 + u * 14;
    g.fillRect(w / 2 - s / 2, y, s, s * 2.2);
  }
  for (let k = 0; k < 6; k++) {
    const u = ((k / 6 + tg * 0.7) % 1), y = h * 0.55 + Math.pow(u, 2.2) * h * 0.45, sc = 0.2 + u * 1.6;
    for (const side of [-1, 1]) { const x = w / 2 + side * (40 + u * w * 0.5); g.fillStyle = '#1f6b35'; g.beginPath(); g.moveTo(x, y - 40 * sc); g.lineTo(x - 18 * sc, y); g.lineTo(x + 18 * sc, y); g.fill(); }
  }
  const cx = w / 2 + Math.sin(tg * 1.7) * 40;
  g.fillStyle = '#e63946'; g.fillRect(cx - 50, h - 92, 100, 46); g.fillStyle = '#ff6b6b'; g.fillRect(cx - 34, h - 112, 68, 24);
  g.fillStyle = '#111'; g.fillRect(cx - 52, h - 54, 22, 16); g.fillRect(cx + 30, h - 54, 22, 16);
  g.font = '700 30px F'; g.textAlign = 'right'; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(w - 150, 12, 138, 44);
  g.fillStyle = fpsCol; g.fillText(fps, w - 22, 45);
}
function drawScreen(t) {
  const g = R.scrCanvas.getContext('2d'), w = R.scrCanvas.width, h = R.scrCanvas.height;
  const mode = screenMode(t);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (mode === 'off') { g.fillStyle = '#05060a'; g.fillRect(0, 0, w, h); return; }
  const desk = () => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#1d2b64'); gr.addColorStop(1, '#5a2d82');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffc62b'; g.beginPath(); g.arc(w / 2, h * 0.5, 60, Math.PI, 0); g.fill(); g.fillRect(w / 2 - 80, h * 0.5 - 4, 160, 12);
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, h - 30, w, 30);
    for (let k = 0; k < 4; k++) { g.fillStyle = ['#4d9bff', '#2ecc71', '#ff9f1c', '#e63946'][k]; g.fillRect(18, 18 + k * 56, 40, 40); }
  };
  const bar = (p, label, col) => {
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(w * 0.15, h * 0.62, w * 0.7, 70);
    g.fillStyle = '#fff'; g.font = '700 24px F'; g.fillText(label, w / 2, h * 0.62 + 20);
    g.fillStyle = '#2b2f39'; g.fillRect(w * 0.18, h * 0.62 + 40, w * 0.64, 18);
    g.fillStyle = col; g.fillRect(w * 0.18, h * 0.62 + 40, w * 0.64 * cl(p), 18);
  };
  if (mode === 'boot') {
    g.fillStyle = '#0d1020'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffc62b'; g.font = '700 54px F'; g.fillText('OBRA OS', w / 2, h * 0.42);
    for (let k = 0; k < 8; k++) { const a = t * 6 + k * Math.PI / 4; g.fillStyle = `rgba(255,255,255,${(k + 1) / 8})`; g.beginPath(); g.arc(w / 2 + Math.cos(a) * 26, h * 0.68 + Math.sin(a) * 26, 5, 0, 7); g.fill(); }
  } else if (mode === 'desk') desk();
  else if (mode === 'copy') { desk(); bar(P(t, C.ssd0 + 0.5, Math.max(0.5, S('r1') - C.ssd0 - 0.8)), 'Instalando o jogo no SSD...', '#2ecc71'); }
  else if (mode === 'slow') { desk(); bar(0.04 + 0.1 * P(t, C.load1, 4), 'Carregando...', '#ff9f1c'); g.fillStyle = '#fff'; g.font = '700 22px F'; g.fillText('esperando os dados chegarem...', w / 2, h * 0.92); }
  else if (mode === 'fast') { desk(); bar(EZ.o(P(t, C.load2, 0.8)), 'Carregando...', '#2ecc71'); }
  else if (mode === 'title') {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#120a2e'); gr.addColorStop(1, '#3a0f4f'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.font = '700 70px F'; g.fillStyle = '#ffd23f'; g.fillText('OBRA RACER', w / 2, h * 0.42);
    g.font = '700 26px F'; g.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(t * 5)})`; g.fillText('APERTE PLAY', w / 2, h * 0.7);
  } else if (mode === 'choppy') drawGame(g, w, h, Math.floor(t * 8) / 8, '8 FPS', '#ff4d3d');
  else drawGame(g, w, h, t, '144 FPS', '#2ecc71');
  // aviso de superaquecimento antes de desligar
  if (cpuTemp(t) > 88 && t < C.rwC.a) { g.fillStyle = 'rgba(200,20,20,.85)'; g.fillRect(0, 0, w, 44); g.fillStyle = '#fff'; g.font = '700 26px F'; g.fillText('SUPERAQUECIMENTO!', w / 2, 23); }
}

// ================================================================ termômetro, lupa e efeitos 2D
function gauge(x, y, label, temp, s = 1) {
  const col = temp < 60 ? '#2ecc71' : temp < 85 ? '#ffb02e' : '#ff3b3b';
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = 'rgba(20,24,36,.88)'; rr(-120, -46, 240, 92, 26); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 5; rr(-120, -46, 240, 92, 26); ctx.stroke();
  ctx.fillStyle = '#2b2f39'; rr(-98, -12, 22, 50, 11); ctx.fill(); circ(-87, 30, 16); ctx.fill();
  ctx.fillStyle = col; const hh = 40 * cl((temp - 20) / 85); rr(-93, 30 - hh, 12, hh, 6); ctx.fill(); circ(-87, 30, 11); ctx.fill();
  ctx.fillStyle = '#9aa3b5'; ctx.font = '600 22px F'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(label, -64, -22);
  ctx.fillStyle = col; ctx.font = '700 44px F'; ctx.fillText(`${Math.round(temp)}°C`, -64, 14);
  ctx.restore();
}
function drawGauges(t, wt) {
  const cpuS = project(CW(CPU.x, CPU.y + 0.6, 0.6));
  if (between(wt, C.on1, E('t3') + 0.3)) gauge(cl(cpuS[0] + 230, 170, 900), cl(cpuS[1] - 120, 260, 1300), 'PROCESSADOR', cpuTemp(wt), 1.1);
  if (between(wt, S('a1'), E('a3') + 0.3)) {
    gauge(250, 300, 'PROCESSADOR', cpuTemp(wt), 1.0);
    gauge(830, 300, 'PLACA DE VÍDEO', gpuTemp(wt), 1.0);
  }
}
function magnifier(t, wt) {
  if (!between(wt, C.zoom1, E('t2') + 0.6)) return;
  const k = EZ.back(P(t, C.zoom1, 0.4)) * (1 - P(wt, E('t2') + 0.3, 0.3));
  if (k <= 0) return;
  const cx = 760, cy = 560, r = 230;
  const [px, py] = project(CW(CPU.x, CPU.y, 0.2));
  ctx.save();
  ctx.strokeStyle = 'rgba(20,24,36,.8)'; ctx.lineWidth = 8; line(px, py, cx - r * 0.6 * k, cy + r * 0.6 * k);
  ctx.translate(cx, cy); ctx.scale(k, k);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.save(); ctx.clip();
  ctx.fillStyle = '#20242c'; ctx.fillRect(-r, -r, 2 * r, 2 * r);
  const filled = wt >= C.press;
  // cooler (cobre, embaixo) e processador (metal, em cima) vistos de lado, ampliados
  const rough = (y0, dir, seed) => { ctx.beginPath(); ctx.moveTo(-r, y0 + dir * 200); for (let x = -r; x <= r; x += 12) ctx.lineTo(x, y0 + dir * (6 + 14 * rnd(seed + x))); ctx.lineTo(r, y0 + dir * 200); ctx.closePath(); };
  ctx.fillStyle = '#c0c6cf'; rough(-28, -1, 1); ctx.fill();
  ctx.fillStyle = '#d0814a'; rough(28, 1, 7); ctx.fill();
  if (!filled) {
    ctx.fillStyle = 'rgba(160,215,255,.55)';
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.ellipse(-r + 30 + i * 52, 0, 18, 9, 0, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#ff6b4a'; ctx.font = '700 30px F'; ctx.textAlign = 'center'; ctx.fillText('AR', 0, -95);
  } else {
    const p = P(wt, C.press, 0.6);
    ctx.fillStyle = '#8d939c'; ctx.fillRect(-r, -24 * p - 2, 2 * r, 48 * p + 4);
    ctx.fillStyle = '#ffffff'; ctx.font = '700 30px F'; ctx.textAlign = 'center'; ctx.fillText('PASTA', 0, -95);
  }
  ctx.restore();
  ctx.lineWidth = 12; ctx.strokeStyle = '#141824'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
  ctx.lineWidth = 5; ctx.strokeStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(0, 0, r - 6, 0, 7); ctx.stroke();
  ctx.fillStyle = '#ffd23f'; ctx.font = '700 26px F'; ctx.textAlign = 'center'; ctx.fillText('VISTO DE PERTO', 0, r + 34);
  ctx.restore();
}
function comic(t, wt) {
  const word = (t0, dur, v, txt, size, col) => {
    if (t < t0 || t > t0 + dur) return;
    const [x, y, z] = project(v); if (z > 1) return;
    const k = P(t, t0, dur);
    ctx.save(); ctx.translate(x, y - 140); ctx.scale(EZ.back(cl(k * 3)), EZ.back(cl(k * 3))); ctx.rotate(-0.1); ctx.globalAlpha *= 1 - P(t, t0 + dur * 0.7, dur * 0.3);
    bigWord(txt, 0, 0, size, col); ctx.restore();
  };
  word(C.zap1, 1.0, V3(DESKCPU.x, 0.2, DESKCPU.z), 'ZZZT!', 110, '#ffd23f');
  word(C.zap2, 1.0, CW(CPU.x, CPU.y + 0.4, 0.3), 'ZZZT!', 110, '#ffd23f');
  word(C.hot1 - 0.2, 1.1, CW(CPU.x, CPU.y + 0.6, 0.3), '100°C!', 110, '#ff4d3d');
  word(C.off, 1.0, CW(2.2, 3.2, 1.0), 'PLOFT!', 100, '#ffffff');
  if (between(wt, C.load1 + 0.4, C.rwR.a)) {
    const [x, y] = project(CW(CPU.x, CPU.y + 1.0, 0.6));
    ctx.save(); ctx.globalAlpha *= 0.9;
    for (let i = 0; i < 3; i++) { const a = ((t * 0.8 + i / 3) % 1); ctx.globalAlpha = Math.sin(a * Math.PI); bigWord('z', x + 40 + a * 70 + i * 6, y - 40 - a * 120, 50 + a * 30, '#c7d7ff'); }
    ctx.restore();
  }
}
function heatOverlay(t, wt) {
  if (!between(wt, C.glass + 0.3, C.rwA.a)) return;
  const k = P(wt, C.glass + 0.3, 1.2);
  ctx.save(); ctx.globalAlpha = 0.45 * k;
  const g = ctx.createRadialGradient(540, 900, 200, 540, 900, 1000);
  g.addColorStop(0, 'rgba(255,90,20,.15)'); g.addColorStop(1, 'rgba(200,20,0,.85)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.5 * k; ctx.strokeStyle = 'rgba(255,200,120,.8)'; ctx.lineWidth = 4;
  for (let i = 0; i < 7; i++) {
    const x0 = 180 + i * 120; ctx.beginPath();
    for (let y = 1300; y > 500; y -= 20) ctx.lineTo(x0 + Math.sin(y * 0.03 + t * 8 + i) * 14, y - ((t * 200) % 40));
    ctx.stroke();
  }
  ctx.restore();
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
    ctx.fillStyle = '#141824'; ctx.font = '700 48px F'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('QUAL OBRA EU FAÇO', 0, -30);
    ctx.fillStyle = '#e63946'; ctx.fillText('NO PRÓXIMO VÍDEO?', 0, 34);
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
  buildRoom(); buildCase(); buildBoard(); buildCPU(); buildCooler(); buildSSD(); buildRAM(); buildGPU(); buildPSUs();
  buildCaseFans(); buildDeskStuff(); buildEffects();
  R.caseLight = new THREE.PointLight('#f2f6ff', 10, 9, 1.4); R.caseLight.position.copy(CW(2.0, 4.1, 2.6)); scene.add(R.caseLight);
  R.heatLight = new THREE.PointLight('#ff4a1a', 0, 7, 1.5); R.heatLight.position.copy(CW(2.25, 2.3, 1.2)); scene.add(R.heatLight);
  HOST = makeHost(hostScene);
  const HS = 3.4;
  HOSTW_PLACE = grp(null, -0.3, FLOOR + 1.68 * HS, 6.4); HOSTW_PLACE.scale.setScalar(HS);
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
  heatOverlay(t, wt);
  drawGauges(t, wt);
  magnifier(t, wt);
  if (Q.get('clean') !== '1') {
    drawArrows(t);
    drawLabels(t);
    comic(t, wt);
    overlays(t);
    drawHeader();
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
