"""Trilha original e animada (118 BPM), sintetizada aqui mesmo: sem direitos de terceiros.

track(total, hits) -> array estéreo (n, 2) em 44.1 kHz
  total: duração em segundos
  hits:  momentos para pratos/subidas (por exemplo o carimbo final)
"""
import numpy as np
from scipy.signal import butter, fftconvolve, lfilter, sosfilt

SR = 44100
BPM = 118
BEAT = 60 / BPM
STEP = BEAT / 4
rng = np.random.default_rng(11)


def t_(d):
    return np.arange(round(SR * d)) / SR


def hz(m):
    return 440 * 2 ** ((m - 69) / 12)


def lowpass(x, f, order=2):
    return sosfilt(butter(order, min(f, SR / 2 - 100) / (SR / 2), "low", output="sos"), x)


def highpass(x, f, order=2):
    return sosfilt(butter(order, f / (SR / 2), "high", output="sos"), x)


def bandpass(x, lo, hi):
    return sosfilt(butter(2, [lo / (SR / 2), hi / (SR / 2)], "band", output="sos"), x)


def adsr(n, a=0.005, d=0.1, s=0.6, r=0.05):
    e = np.full(n, s)
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    e[:na] = np.linspace(0, 1, na) if na else e[:na]
    e[na:na + nd] = np.linspace(1, s, len(e[na:na + nd]))
    if nr:
        e[-nr:] *= np.linspace(1, 0, len(e[-nr:]))
    return e


# ---------------------------------------------------------------- instrumentos
def kick():
    t = t_(0.42)
    f = 52 + 110 * np.exp(-t * 28)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5)
    x[:220] += rng.uniform(-1, 1, 220) * np.linspace(0.5, 0, 220)
    return np.tanh(x * 1.6)


def snare():
    t = t_(0.28)
    n = bandpass(rng.uniform(-1, 1, len(t)), 1200, 8000) * np.exp(-t * 16)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 22) * 0.6
    clap = np.zeros(len(t))
    for k, off in enumerate([0, 0.011, 0.023]):
        s = int(off * SR)
        b = bandpass(rng.uniform(-1, 1, 900), 900, 5000) * np.exp(-np.arange(900) / 120)
        clap[s:s + 900] += b * (0.7 if k < 2 else 1)
    return (n * 0.8 + tone + clap * 0.7) * 0.8


def hat(open_=False):
    d = 0.32 if open_ else 0.05
    t = t_(d)
    x = highpass(rng.uniform(-1, 1, len(t)), 7000) * np.exp(-t * (9 if open_ else 70))
    return x * 0.5


def crash():
    t = t_(2.2)
    return highpass(rng.uniform(-1, 1, len(t)), 4000) * np.exp(-t * 2.2) * 0.6


def riser(d):
    t = t_(d)
    n = rng.uniform(-1, 1, len(t))
    out = np.zeros(len(t))
    for i in range(16):  # varredura do filtro em blocos
        a, b = i * len(t) // 16, (i + 1) * len(t) // 16
        out[a:b] = bandpass(n[a:b], 400 + i * 450, 1400 + i * 650)
    return out * np.linspace(0, 1, len(t)) ** 2 * 0.6


def saw(f, t):
    return 2 * ((f * t) % 1) - 1


def bass(m, d):
    t = t_(d)
    f = hz(m)
    x = 0.6 * saw(f, t) + 0.4 * np.sign(np.sin(2 * np.pi * f * t))
    x = lowpass(x * adsr(len(t), 0.004, 0.12, 0.5, 0.03), 500 + 900 * 0.5)
    return np.tanh(x * 1.4) * 0.55 + np.sin(2 * np.pi * f * t) * adsr(len(t), 0.004, 0.2, 0.7, 0.03) * 0.5


def stab(notes, d):
    t = t_(d)
    x = np.zeros(len(t))
    for m in notes:
        for det in (-0.12, 0, 0.12):
            x += saw(hz(m + det), t + rng.uniform(0, 0.01))
    x /= len(notes) * 3
    env = adsr(len(t), 0.003, 0.18, 0.15, 0.04)
    return lowpass(x * env, 2600) * 0.9


def pad(notes, d):
    t = t_(d)
    x = sum(saw(hz(m + det), t) for m in notes for det in (-0.08, 0.08)) / (len(notes) * 2)
    return lowpass(x, 1100) * adsr(len(t), 0.4, 0.3, 0.8, 0.5) * 0.35


def mallet(m, d=0.6):
    t = t_(d)
    f = hz(m)
    x = np.sin(2 * np.pi * f * t) * np.exp(-t * 6) + 0.35 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t * 18) + 0.15 * np.sin(2 * np.pi * 10 * f * t) * np.exp(-t * 40)
    return x * 0.5


# ---------------------------------------------------------------- composição
# acordes (C  G/B  Am  F) com baixo
CHORDS = [([60, 64, 67], 36), ([59, 62, 67], 35), ([57, 60, 64], 33), ([53, 57, 60], 29)]
KICK = [0, 6, 8]           # passos de 16 avos
KICK_B = [0, 6, 8, 11]
SNARE = [4, 12]
HATS = [2, 6, 10, 14]
STABS = [2, 7, 10, 15]     # acordes no contratempo
BASS = [(0, 0, 3), (3, 12, 1), (6, 0, 2), (8, 0, 2), (11, 7, 1), (14, 12, 2)]  # (passo, intervalo, duração em passos)
# tema de marimba (2 compassos): (passo, nota)
HOOK = [(0, 76), (2, 79), (4, 81), (6, 79), (8, 76), (11, 74), (14, 72), (16, 74), (18, 76), (20, 79), (22, 76), (24, 74), (27, 72), (30, 67)]


def place(buf, x, t, gain=1.0, pan=0.0):
    s = int(t * SR)
    if s >= len(buf):
        return
    x = x[: len(buf) - s]
    buf[s:s + len(x), 0] += x * gain * np.sqrt(0.5 * (1 - pan))
    buf[s:s + len(x), 1] += x * gain * np.sqrt(0.5 * (1 + pan))


def track(total, hits=()):
    n = int(total * SR) + SR * 3
    drums = np.zeros((n, 2)); music = np.zeros((n, 2)); lead = np.zeros((n, 2))
    K, SN, HC, HO, CR = kick(), snare(), hat(), hat(True), crash()
    bar_len = BEAT * 4
    bars = int(total / bar_len) + 2
    kick_times = []
    for b in range(bars):
        t0 = b * bar_len
        ch, root = CHORDS[b % 4]
        sec = b // 8                      # seção de 8 compassos
        intro = False  # começa com tudo: os primeiros segundos seguram o público
        lead_on = sec % 2 == 1 or b >= bars - 6
        if not intro:
            for s in (KICK_B if b % 4 == 3 else KICK):
                place(drums, K, t0 + s * STEP, 0.9); kick_times.append(t0 + s * STEP)
            for s in SNARE:
                place(drums, SN, t0 + s * STEP, 0.55)
            if b % 8 == 7:  # virada
                for s in (13, 14, 15):
                    place(drums, SN, t0 + s * STEP, 0.3 + 0.1 * (s - 13))
        for s in range(16):
            if s in HATS:
                place(drums, HO if s == 14 and b % 2 else HC, t0 + s * STEP, 0.35 if s in HATS else 0.15, pan=0.3)
            elif not intro and s % 2 == 1:
                place(drums, HC, t0 + s * STEP, 0.12, pan=-0.3)
        for s in STABS:
            place(music, stab(ch, STEP * 1.6), t0 + s * STEP, 0.5, pan=-0.25 if s % 2 else 0.25)
        place(music, pad(ch, bar_len + 0.3), t0, 0.5)
        if not intro:
            for s, iv, dl in BASS:
                place(music, bass(root + iv, STEP * dl * 0.95), t0 + s * STEP, 0.75)
        if lead_on and b % 2 == 0:
            for s, m in HOOK:
                tr = 0 if b % 8 < 4 else (2 if (b // 2) % 2 else 0)
                place(lead, mallet(m + tr), t0 + s * STEP, 0.55, pan=0.15)
        if b % 8 == 0 and b > 0:
            place(drums, CR, t0, 0.5)
        if b % 8 == 7:
            place(music, riser(bar_len), t0, 0.35)
    for h in hits:
        place(drums, CR, h, 0.8)
        place(music, riser(1.6), h - 1.6, 0.4)
    # bombeamento (sidechain) da harmonia pelo bumbo
    duck = np.ones(n)
    for kt in kick_times:
        s = int(kt * SR); L = int(0.22 * SR)
        if s < n:
            seg = 1 - 0.55 * np.exp(-np.arange(min(L, n - s)) / (0.06 * SR))
            duck[s:s + len(seg)] = np.minimum(duck[s:s + len(seg)], seg)
    music *= duck[:, None]
    # reverberação curta no tema e na harmonia
    ir_t = np.arange(int(1.1 * SR)) / SR
    ir = rng.uniform(-1, 1, len(ir_t)) * np.exp(-ir_t * 5)
    ir = lowpass(ir, 6000)
    for buf, amt in ((lead, 0.25), (music, 0.12)):
        for c in range(2):
            wet = fftconvolve(buf[:, c], np.roll(ir, c * 37))[:n]
            buf[:, c] += wet / np.abs(ir).sum() * 18 * amt
    # eco no tema
    d = int(BEAT * 0.75 * SR)
    lead[d:, 0] += lead[:-d, 1] * 0.3; lead[d:, 1] += lead[:-d, 0] * 0.3
    mix = drums + music + lead
    mix = np.tanh(mix * 0.9)
    return mix[: int(total * SR)]


if __name__ == "__main__":
    import wave
    x = track(40, hits=[30])
    x /= np.abs(x).max()
    with wave.open("musica_teste.wav", "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())
