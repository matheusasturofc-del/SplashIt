"""Gera a narração de cada fala e monta a linha do tempo.

Motores (campo "engine" do script.json):
  chatterbox  voz neural natural (precisa do Python com chatterbox-tts em CHATTERBOX_PY)
  piper       voz mais simples e rápida

Saídas:
  build/tts/<id>.wav   narração de cada fala (44.1 kHz mono)
  build/timeline.json  início/fim de cada fala e de cada palavra
"""
import json
import os
import subprocess
import sys
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / "build"
TTS = BUILD / "tts"
VOICES = Path(os.environ.get("VOICES", ROOT / "voices"))


def duration(path: Path) -> float:
    with wave.open(str(path)) as w:
        return w.getnframes() / w.getframerate()


def tighten(out: Path, words):
    """corta sobras depois da última palavra (o Chatterbox às vezes deixa respiração ou ruído)"""
    if not words:
        return
    end = words[-1]["e"] + 0.3
    if duration(out) <= end + 0.15:
        return
    tmp = out.with_suffix(".tmp.wav")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(out), "-t", f"{end:.3f}",
                    "-af", f"afade=t=out:st={end - 0.12:.3f}:d=0.12", str(tmp)], check=True)
    tmp.replace(out)


def stamp(line, engine):
    return json.dumps([engine, line.get("say", line["text"])], ensure_ascii=False)


def piper(script, line, out):
    raw = out.with_suffix(".raw.wav")
    subprocess.run([sys.executable, "-I", "-m", "piper", "-m", str(VOICES / f"{script['voice']}.onnx"), "-f", str(raw),
                    "--length-scale", str(script.get("lengthScale", 1.0))],
                   input=line.get("say", line["text"]).encode("utf-8"), check=True, capture_output=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
                    "-af", "silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
                           "silenceremove=start_periods=1:start_threshold=-50dB,areverse",
                    "-ar", "44100", "-ac", "1", str(out)], check=True)
    raw.unlink()


def main():
    script = json.loads((ROOT / "script.json").read_text(encoding="utf-8"))
    engine = script.get("engine", "piper")
    TTS.mkdir(parents=True, exist_ok=True)
    all_lines = [(b, l) for b in script["beats"] for l in b["lines"]]

    todo = []
    for _, line in all_lines:
        out = TTS / f"{line['id']}.wav"
        tag = out.with_suffix(".txt")
        if out.exists() and tag.exists() and tag.read_text(encoding="utf-8") == stamp(line, engine):
            continue
        todo.append(line)
    if todo:
        print(f"gerando {len(todo)} falas com {engine}...", flush=True)
        if engine == "chatterbox":
            py = os.environ.get("CHATTERBOX_PY")
            if not py:
                sys.exit("defina CHATTERBOX_PY com o python onde o chatterbox-tts está instalado")
            cfg = script.get("chatterbox", {})
            ref = cfg.get("ref")
            job = {"ref": str(VOICES / ref) if ref else None, "exaggeration": cfg.get("exaggeration", 0.5), "cfg": cfg.get("cfg", 0.5),
                   "lines": [{"id": l["id"], "say": l.get("say", l["text"]), "out": str(TTS / f"{l['id']}.wav")} for l in todo]}
            jf = BUILD / "tts_jobs.json"
            jf.write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")
            subprocess.run([py, str(ROOT / "tts_chatterbox.py"), str(jf)], check=True)
        else:
            for line in todo:
                piper(script, line, TTS / f"{line['id']}.wav")
        for line in todo:
            (TTS / f"{line['id']}.txt").write_text(stamp(line, engine), encoding="utf-8")

    lines = []
    t = 0.35
    for bi, beat in enumerate(script["beats"]):
        for line in beat["lines"]:
            out = TTS / f"{line['id']}.wav"
            d = duration(out)
            wj = Path(str(out) + ".words.json")
            words = json.loads(wj.read_text(encoding="utf-8"))["words"] if wj.exists() and engine == "chatterbox" else []
            tighten(out, words)
            d = duration(out)
            lines.append({
                "id": line["id"], "beat": beat["id"], "beatIndex": bi,
                "text": line["text"], "say": line.get("say", line["text"]), "hl": line.get("hl"),
                "start": round(t, 3), "end": round(t + d, 3),
                "words": [{"w": w["w"], "s": round(t + w["s"], 3), "e": round(t + w["e"], 3)} for w in words],
            })
            t += d + line.get("pad", 0) + script["gapLine"]
        t += script["gapBeat"]

    timeline = {"duration": round(t + 0.3, 3), "lines": lines}
    (BUILD / "timeline.json").write_text(json.dumps(timeline, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(lines)} falas, duração total {timeline['duration']:.1f}s")


if __name__ == "__main__":
    main()
