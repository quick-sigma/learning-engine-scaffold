#!/usr/bin/env python3
"""generate_audio.py — Kokoro TTS → WAV (luego comprimir a MP3 con ffmpeg).

Uso (desde learning/):
    ~/.kokoro/.venv/bin/python generate_audio.py "<texto>" --out app/tmp/tmp-slide
    ffmpeg -y -i app/tmp/tmp-slide.wav -codec:a libmp3lame -qscale:a 4 \
        lessons/lesson-001/audio/slide-02.mp3
    rm -f app/tmp/tmp-slide.wav

El WAV temporal SIEMPRE se escribe en app/tmp/ y se borra tras comprimir.
Kokoro vive SOLO en ~/.kokoro/ (models/kokoro-v1.0.onnx y voices-v1.0.bin).
Voces ES: ef_dora (fem), em_alex / em_santa (masc). lang="es", NUNCA "es-es".
"""
from __future__ import annotations

import argparse
from pathlib import Path

VOICES = ("ef_dora", "em_alex", "em_santa")


def main() -> None:
    ap = argparse.ArgumentParser(description="Kokoro TTS en español → WAV")
    ap.add_argument("text")
    ap.add_argument("--out", required=True, help="salida sin extensión (ej. app/tmp/tmp-slide)")
    ap.add_argument("--voice", default="ef_dora", choices=VOICES)
    args = ap.parse_args()

    models = Path.home() / ".kokoro" / "models"
    onnx = models / "kokoro-v1.0.onnx"
    voices = models / "voices-v1.0.bin"
    if not onnx.is_file() or not voices.is_file():
        raise SystemExit(
            f"Modelo Kokoro no encontrado en {models}. Descárgalo primero "
            "(kokoro-v1.0.onnx y voices-v1.0.bin)."
        )

    from kokoro_onnx import Kokoro  # venv ~/.kokoro/.venv
    import soundfile as sf

    kokoro = Kokoro(str(onnx), str(voices))
    samples, sr = kokoro.create(args.text, voice=args.voice, lang="es")

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(out.with_suffix(".wav")), samples, sr)
    print(f"WAV escrito: {out}.wav (sr={sr})")


if __name__ == "__main__":
    main()
