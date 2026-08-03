#!/usr/bin/env python3
"""generate_lesson_audio.py — genera TODO el MP3 de una lección + glosario.

Lee lessons/<id>/slides.json y glossary/glossary.json y produce, con Kokoro
(es) + ffmpeg (MP3 qscale 4), cada bloque narrable con nombres deterministas.
Los WAV temporales van SOLO a app/tmp/ y se borran tras comprimir.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TMP = ROOT / "app" / "tmp"
TMP.mkdir(parents=True, exist_ok=True)

VOICE = "ef_dora"
GLOSS_AUDIO = ROOT / "glossary" / "audio"
KOKORO = Path.home() / ".kokoro" / ".venv" / "bin" / "python"
GEN = ROOT / "generate_audio.py"

# Kokoro usa GPU si ONNX_PROVIDER está seteado (su detección por
# find_spec("onnxruntime-gpu") no funciona porque el módulo importable es
# onnxruntime). Si CUDA está disponible (cuDNN instalado), forzarla.
def _providers_env() -> dict[str, str]:
    if os.environ.get("ONNX_PROVIDER"):
        return {}
    try:
        import onnxruntime as ort

        if "CUDAExecutionProvider" in ort.get_available_providers():
            return {"ONNX_PROVIDER": "CUDAExecutionProvider"}
    except Exception:
        pass
    return {}


GPU_ENV = _providers_env()


def wav(tmp_name: str) -> Path:
    return TMP / f"{tmp_name}.wav"


def mp3(path: Path) -> None:
    wavp = wav(path.stem)
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(wavp), "-codec:a", "libmp3lame", "-qscale:a", "4", str(path)],
        check=True, capture_output=True,
    )
    wavp.unlink(missing_ok=True)


def synth(name: str, text: str, dest_dir: Path) -> None:
    dest = dest_dir / f"{name}.mp3"
    if dest.is_file():
        print(f"  = ya existe {dest.name}")
        return
    subprocess.run([str(KOKORO), str(GEN), text, "--out", str(wav(name)), "--voice", VOICE],
                   check=True, capture_output=True, env={**os.environ, **GPU_ENV})
    mp3(dest)
    print(f"  ✓ {dest.name}")


def main() -> None:
    lesson_id = sys.argv[1] if len(sys.argv) > 1 else "lesson-002"
    AUDIO_DIR = ROOT / "lessons" / lesson_id / "audio"
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    GLOSS_AUDIO.mkdir(parents=True, exist_ok=True)

    slides = json.loads((ROOT / "lessons" / lesson_id / "slides.json").read_text())["slides"]

    for i, s in enumerate(slides, start=1):
        n = f"{i:02d}"
        synth(f"slide-{n}", s["text"], AUDIO_DIR)
        if s.get("prediction", {}).get("audio"):
            synth(s["prediction"]["audio"].rsplit(".", 1)[0], s["prediction"]["question"], AUDIO_DIR)
        if s.get("audio_instr"):
            synth(s["audio_instr"].rsplit(".", 1)[0], s["instructions"], AUDIO_DIR)
        if s.get("experiment", {}).get("audio"):
            synth(s["experiment"]["audio"].rsplit(".", 1)[0], s["experiment"]["prompt"], AUDIO_DIR)
        if s.get("self_explain", {}).get("audio"):
            synth(s["self_explain"]["audio"].rsplit(".", 1)[0], s["self_explain"]["prompt"], AUDIO_DIR)
        if s.get("quiz", {}).get("audio"):
            synth(s["quiz"]["audio"].rsplit(".", 1)[0], s["quiz"]["question"], AUDIO_DIR)

        # EVIDENCE D14: opciones de quiz y predicción narradas (options_audio)
        for sub_key in ("prediction", "quiz"):
            sub = s.get(sub_key) or {}
            for opt_name in sub.get("options_audio") or []:
                idx = int(opt_name.rsplit(".", 1)[0].rsplit("-", 1)[-1])
                opt_text = sub["options"][idx] if idx < len(sub["options"]) else ""
                if opt_text:
                    synth(opt_name.rsplit(".", 1)[0], opt_text, AUDIO_DIR)

        # audio de widgets: saturación semántica (palabra suelta y en contexto)
        w = s.get("widget") or {}
        if w.get("type") == "satiation":
            for wi, wd in enumerate(w.get("words") or []):
                if wd.get("word_audio"):
                    synth(wd["word_audio"].rsplit(".", 1)[0], wd["word"], AUDIO_DIR)
                if wd.get("context_audio"):
                    synth(wd["context_audio"].rsplit(".", 1)[0], f"{wd['word']}. {wd['context']}", AUDIO_DIR)

    gloss = json.loads((ROOT / "glossary" / "glossary.json").read_text())
    for g in gloss:
        if g["lesson"] == lesson_id and g.get("audio"):
            synth(g["audio"].rsplit(".", 1)[0], f"{g['term']}. {g['definition']}", GLOSS_AUDIO)

    print("Audio de la lección generado.")


if __name__ == "__main__":
    main()
