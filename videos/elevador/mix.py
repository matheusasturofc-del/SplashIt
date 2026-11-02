"""Mixa narração + efeitos sonoros + trilha e junta com o vídeo.

Os efeitos e a trilha são sintetizados aqui (sem arquivos de terceiros),
então não há problema de direitos autorais.
Entrada: build/timeline.json, build/sfx.json, build/tts/*.wav, build/video_mudo.mp4
Saída:   build/audio.wav e elevador.mp4
"""
import json
import subprocess
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / "build"
SR = 44100
rng = np.random.default_rng(7)


def tt(d):
    return np.arange(round(SR * d)) / SR


def env(n, a=0.005, r=None):
    x = np.ones(n)
    na = max(1, round(SR * a))
    x[:na] = np.linspace(0, 1, na)
    if r:
        nr = min(n, round(SR * r))
        x[-nr:] *= np.linspace(1, 0, nr)
    return x


def lp(x, k):
    """passa-baixa simples (k entre 0 e 1, menor = mais abafado)"""
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += k * (v - acc)
        y[i] = acc
    return y


def noise(d):
    return rng.uniform(-1, 1, round(SR * d))


def sweep(f0, f1, d, shape=np.sin):
    t = tt(d)
    f = np.linspace(f0, f1, len(t))
    return shape(2 * np.pi * np.cumsum(f) / SR)


def saw(ph):
    return 2 * ((ph / (2 * np.pi)) % 1) - 1


def bell(freqs, d, decay):
    t = tt(d)
    return sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t * decay * (1 + i * 0.6)) for i, (f, a) in enumerate(freqs))


def s_pop(d=0):
    x = sweep(900, 260, 0.09) * np.exp(-tt(0.09) * 30)
    return x * 0.8


def s_clank(d=0):
    t = tt(0.4)
    x = bell([(523, 0.6), (1307, 0.4), (2211, 0.3), (3150, 0.2)], 0.4, 12)
    x[:300] += noise(300 / SR) * np.linspace(1, 0, 300)
    return x * 0.6


def s_whoosh(d=0.45):
    d = max(d, 0.45)
    n = noise(d)
    e = np.sin(np.linspace(0, np.pi, len(n))) ** 2
    return lp(n, 0.12) * e * 1.6


def s_strain(d):
    t = tt(d)
    f = np.linspace(80, 150, len(t)) + 6 * np.sin(2 * np.pi * 9 * t)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = 0.5 * saw(ph) + 0.25 * np.sin(2 * ph) + 0.15 * lp(noise(d), 0.3)
    return lp(x, 0.25) * np.linspace(0.3, 1, len(t)) * env(len(t), 0.05, 0.05)


def s_blowout(d=0):
    t = tt(0.9)
    x = lp(noise(0.9), 0.08) * np.exp(-t * 4) * 2.2
    x += np.sin(2 * np.pi * 55 * t) * np.exp(-t * 8)
    return x


def s_thud(d=0):
    t = tt(0.3)
    x = np.sin(2 * np.pi * (70 - 30 * t) * t) * np.exp(-t * 14)
    x[:400] += lp(noise(400 / SR), 0.3) * np.linspace(1, 0, 400)
    return x


def s_hum(d):
    t = tt(max(d, 0.2))
    x = 0.5 * np.sin(2 * np.pi * 110 * t) + 0.3 * np.sin(2 * np.pi * 220 * t) + 0.1 * lp(noise(len(t) / SR), 0.1)
    return x * env(len(t), 0.15, 0.2) * 0.5


def s_creak(d=0):
    t = tt(0.7)
    f = 320 + 120 * np.sin(2 * np.pi * 3 * t)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = saw(ph) * (0.6 + 0.4 * np.sin(2 * np.pi * 37 * t))
    return lp(x, 0.3) * env(len(t), 0.05, 0.2) * 0.6


def s_snap(d=0):
    t = tt(0.5)
    x = np.zeros(len(t))
    x[:900] = noise(900 / SR) * np.linspace(1, 0, 900) * 1.4
    x += np.sin(2 * np.pi * 760 * t) * np.exp(-t * 9) * 0.5
    return x


def s_fall(d):
    d = max(d, 0.3)
    return sweep(1300, 380, d) * env(round(SR * d), 0.05, 0.1) * 0.35


def s_crash(d=0):
    t = tt(1.2)
    x = lp(noise(1.2), 0.25) * np.exp(-t * 3.5) * 1.6
    x += np.sin(2 * np.pi * (60 - 20 * t) * t) * np.exp(-t * 6) * 1.2
    x += bell([(410, 0.4), (967, 0.3), (1733, 0.25)], 1.2, 5)
    return x


def s_rewind(d):
    d = max(d, 0.3)
    t = tt(d)
    f = 900 + 600 * np.sin(2 * np.pi * 14 * t) + np.linspace(0, 800, len(t))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR)
    return x * env(len(t), 0.03, 0.08) * 0.35


def s_zip(d=0):
    n = noise(0.22)
    x = n - lp(n, 0.4)
    return x * np.linspace(0.2, 1, len(x)) * env(len(x), 0.01, 0.05) * 1.2


def s_powerdown(d=0):
    return sweep(620, 70, 0.8) * np.linspace(1, 0, round(SR * 0.8)) * 0.5


def s_powerup(d=0):
    return sweep(70, 620, 0.6) * env(round(SR * 0.6), 0.02, 0.15) * 0.4


def s_slide(d):
    d = max(d, 0.3)
    return lp(noise(d), 0.05) * env(round(SR * d), 0.08, 0.12) * 1.4


def s_zap(d=0):
    t = tt(0.35)
    x = np.sign(np.sin(2 * np.pi * 120 * t)) * 0.4 + noise(0.35) * 0.4
    return lp(x, 0.5) * env(len(t), 0.005, 0.1) * 0.7


def s_clac(d=0):
    return _mix2(s_clank() * 1.1, s_thud())


def _mix2(a, b):
    n = max(len(a), len(b))
    out = np.zeros(n)
    out[: len(a)] += a
    out[: len(b)] += b
    return out


def s_freeze(d=0):
    t = tt(0.45)
    f = 400 + 1600 * np.abs(np.sin(2 * np.pi * 2.2 * t))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.4 + noise(0.45) * 0.25
    return lp(x, 0.4) * env(len(t), 0.01, 0.1)


def s_screech(d):
    d = max(d, 0.3)
    t = tt(d)
    n = noise(d)
    x = (n - lp(n, 0.5)) * 0.6 + 0.4 * np.sin(2 * np.pi * (2400 + 300 * np.sin(2 * np.pi * 30 * t)) * t)
    return x * env(len(t), 0.01, 0.1)


def s_ding(d=0):
    return bell([(1319, 0.7), (2637, 0.3), (3951, 0.15)], 1.4, 3) * 0.7


def s_bonk(d=0):
    t = tt(0.45)
    f = 210 * np.exp(-t * 2) + 25 * np.sin(2 * np.pi * 18 * t)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5) * 0.9


def s_beep(d=0):
    return np.sin(2 * np.pi * 1500 * tt(0.08)) * env(round(SR * 0.08), 0.003, 0.02) * 0.4


def s_alarm(d=0):
    a = np.sin(2 * np.pi * 880 * tt(0.15)); b = np.sin(2 * np.pi * 660 * tt(0.15))
    x = np.concatenate([a, b, a])
    return x * env(len(x), 0.005, 0.05) * 0.35


def s_click(d=0):
    x = noise(0.02) * np.linspace(1, 0, round(SR * 0.02))
    return x


def s_stamp(d=0):
    return _mix2(s_thud() * 1.4, s_clank() * 0.5)


def s_tada(d=0):
    out = np.zeros(round(SR * 1.6))
    for i, f in enumerate([523.25, 659.25, 783.99, 1046.5]):
        s = round(SR * i * 0.08)
        tone = bell([(f, 0.6), (f * 2, 0.2)], 1.6 - i * 0.08, 2.5)
        out[s : s + len(tone)] += tone
    return out * 0.6


SOUNDS = {k[2:]: v for k, v in globals().items() if k.startswith("s_")}


def read_wav(p):
    with wave.open(str(p)) as w:
        assert w.getframerate() == SR and w.getnchannels() == 1
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768


def music(total):
    """trilha leve: arpejo em Dó (C–G–Am–F) a 104 bpm + baixo + chimbal"""
    bpm = 104
    beat = 60 / bpm
    chords = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]
    out = np.zeros(round(SR * total) + SR)
    hz = lambda m: 440 * 2 ** ((m - 69) / 12)
    step = beat / 2
    n = int(total / step) + 1
    for i in range(n):
        bar = int(i * step / (beat * 4)) % 4
        ch = chords[bar]
        s = round(SR * i * step)
        note = ch[[0, 1, 2, 1][i % 4]] + 12
        d = 0.35
        t = tt(d)
        pl = (2 * np.abs(2 * ((hz(note) * t) % 1) - 1) - 1) * np.exp(-t * 9) * 0.25
        out[s : s + len(pl)] += pl[: len(out) - s]
        if i % 2 == 0:
            hh = (noise(0.03) - lp(noise(0.03), 0.5)) * np.linspace(1, 0, round(SR * 0.03)) * 0.06
            out[s : s + len(hh)] += hh[: len(out) - s]
        if i % 4 == 0:
            tb = tt(beat * 1.8)
            b = np.sin(2 * np.pi * hz(ch[0] - 24) * tb) * np.exp(-tb * 2) * 0.35
            out[s : s + len(b)] += b[: len(out) - s]
    return out[: round(SR * total)]


def main():
    tl = json.loads((BUILD / "timeline.json").read_text(encoding="utf-8"))
    ev = json.loads((BUILD / "sfx.json").read_text(encoding="utf-8"))
    total = tl["duration"]
    N = round(SR * total) + SR
    voice = np.zeros(N); fx = np.zeros(N)
    for l in tl["lines"]:
        v = read_wav(BUILD / "tts" / f"{l['id']}.wav")
        s = round(SR * l["start"])
        voice[s : s + len(v)] += v[: N - s]
    for e in ev:
        x = SOUNDS[e["name"]](e["d"]) * e["gain"]
        s = round(SR * e["t"])
        if s >= N:
            continue
        fx[s : s + len(x)] += x[: N - s]
    mus = music(total)
    mus = np.pad(mus, (0, N - len(mus)))
    # abaixa a trilha enquanto alguém fala
    talk = np.zeros(N)
    for l in tl["lines"]:
        talk[round(SR * l["start"]) : round(SR * l["end"])] = 1
    k = round(SR * 0.25)
    talk = np.convolve(talk, np.ones(k) / k, mode="same")
    mus *= 0.55 - 0.3 * talk
    fade = np.ones(N); nf = round(SR * 1.5); fade[round(SR * total) - nf : round(SR * total)] = np.linspace(1, 0, nf); fade[round(SR * total):] = 0
    mix = (voice * 1.0 + fx * 0.32 + mus * 0.22) * fade
    mix = mix[: round(SR * total)]
    mix /= max(1e-6, np.abs(mix).max()) / 0.95
    with wave.open(str(BUILD / "audio.wav"), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((mix * 32767).astype(np.int16).tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(BUILD / "video_mudo.mp4"), "-i", str(BUILD / "audio.wav"),
                    "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
                    "-shortest", "-movflags", "+faststart", str(ROOT / "elevador.mp4")], check=True)
    print("pronto:", ROOT / "elevador.mp4")


if __name__ == "__main__":
    main()
