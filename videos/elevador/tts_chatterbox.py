"""Narração com Chatterbox Multilingual (Resemble AI, licença MIT).

Roda no ambiente Python onde o chatterbox-tts está instalado:
    <python-do-chatterbox> tts_chatterbox.py jobs.json

jobs.json: {"ref": "voz.wav" | null, "exaggeration": 0.6, "cfg": 0.3,
            "lines": [{"id": "h1", "say": "...", "out": "build/tts/h1.wav"}]}

Para cada fala: gera o áudio, corta o silêncio, confere com o Whisper (gera de
novo se a transcrição ficar muito diferente do texto) e salva os tempos de cada
palavra em <out>.words.json.
"""
import difflib
import os
import json
import re
import sys
import unicodedata

import numpy as np
import torch
import torchaudio as ta
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
from faster_whisper import WhisperModel

SR_OUT = 44100


def norm(s):
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9 ]+", " ", s).split()


def trim(w, sr, thr=0.01, pad=0.05):
    a = np.abs(w)
    idx = np.where(a > thr * a.max())[0]
    if len(idx) == 0:
        return w, 0.0
    s = max(0, idx[0] - int(pad * sr))
    e = min(len(w), idx[-1] + int(pad * sr))
    return w[s:e], s / sr


def main():
    job = json.load(open(sys.argv[1], encoding="utf-8"))
    torch.set_num_threads(4)
    tts = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
    asr = WhisperModel("small", device="cpu", compute_type="int8")
    for line in job["lines"]:
        best = None
        for attempt in range(int(os.environ.get("MAXTRY", "3"))):
            torch.manual_seed(1000 + attempt * 77 + sum(map(ord, line["id"])) + int(os.environ.get("SEED", "0")))
            kw = dict(language_id="pt", exaggeration=job.get("exaggeration", 0.5), cfg_weight=job.get("cfg", 0.5))
            if job.get("ref"):
                kw["audio_prompt_path"] = job["ref"]
            wav = tts.generate(line["say"], **kw)
            w = ta.functional.resample(wav.mean(0), tts.sr, SR_OUT).numpy()
            w, _ = trim(w, SR_OUT)
            w16 = ta.functional.resample(torch.from_numpy(w), SR_OUT, 16000).numpy()
            segs, _ = asr.transcribe(w16, language="pt", word_timestamps=True)
            words = [{"w": x.word.strip(), "s": round(x.start, 3), "e": round(x.end, 3)} for s in segs for x in s.words]
            heard = " ".join(x["w"] for x in words)
            score = max(difflib.SequenceMatcher(None, norm(x), norm(heard)).ratio() for x in (line["say"], line.get("text", line["say"])))
            print(f"{line['id']} tentativa {attempt + 1}: {score:.2f} | {heard}", flush=True)
            if best is None or score > best[0]:
                best = (score, w, words)
            if score >= float(os.environ.get("MINSCORE", "0.85")):
                break
        score, w, words = best
        w = w / max(1e-6, np.abs(w).max()) * 0.9
        ta.save(line["out"], torch.from_numpy(w).float().unsqueeze(0), SR_OUT, bits_per_sample=16, encoding="PCM_S")
        json.dump({"score": round(score, 3), "words": words}, open(line["out"] + ".words.json", "w", encoding="utf-8"), ensure_ascii=False)


if __name__ == "__main__":
    main()
