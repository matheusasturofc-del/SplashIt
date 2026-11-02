"""Gera a narração de cada fala com o Piper e monta a linha do tempo.

Saídas:
  build/tts/<id>.wav   narração de cada fala (44.1 kHz mono)
  build/timeline.json  início/fim de cada fala, usado pela animação e pela mixagem
"""
import json
import subprocess
import sys
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / "build"
TTS = BUILD / "tts"
VOICES = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "voices"


def duration(path: Path) -> float:
    with wave.open(str(path)) as w:
        return w.getnframes() / w.getframerate()


def main() -> None:
    script = json.loads((ROOT / "script.json").read_text(encoding="utf-8"))
    model = VOICES / f"{script['voice']}.onnx"
    TTS.mkdir(parents=True, exist_ok=True)

    lines = []
    t = 0.35
    for bi, beat in enumerate(script["beats"]):
        for line in beat["lines"]:
            raw = TTS / f"{line['id']}.raw.wav"
            out = TTS / f"{line['id']}.wav"
            text = line.get("say", line["text"])
            if not out.exists() or out.with_suffix(".txt").read_text(encoding="utf-8") != text:
                subprocess.run(
                    [sys.executable, "-I", "-m", "piper", "-m", str(model), "-f", str(raw),
                     "--length-scale", str(script["lengthScale"])],
                    input=text.encode("utf-8"), check=True, capture_output=True,
                )
                subprocess.run(
                    ["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
                     "-af", "silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
                            "silenceremove=start_periods=1:start_threshold=-50dB,areverse",
                     "-ar", "44100", "-ac", "1", str(out)],
                    check=True,
                )
                raw.unlink()
                out.with_suffix(".txt").write_text(text, encoding="utf-8")
            d = duration(out)
            lines.append({
                "id": line["id"], "beat": beat["id"], "beatIndex": bi,
                "text": line["text"], "hl": line.get("hl"),
                "start": round(t, 3), "end": round(t + d, 3),
            })
            t += d + line.get("pad", 0) + script["gapLine"]
        t += script["gapBeat"]

    timeline = {"duration": round(t + 0.3, 3), "lines": lines}
    (BUILD / "timeline.json").write_text(json.dumps(timeline, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(lines)} falas, duração total {timeline['duration']:.1f}s")


if __name__ == "__main__":
    main()
