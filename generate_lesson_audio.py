#!/usr/bin/env python3
"""generate_lesson_audio.py — genera TODO el MP3 de una lección + glosario.

Lee lessons/<id>/slides.json y glossary/glossary.json y produce, con Kokoro
(es) + ffmpeg (MP3 qscale 4), cada bloque narrable con nombres deterministas.
Los WAV temporales van SOLO a app/tmp/ y se borran tras comprimir.

Cubre (SKILL.md §6): narración de slide (usa el campo `audio` del slide para
respetar la portada slide-00.mp3), instrucciones, quiz (dict o lista),
predicción, self-explanation, y los widgets timeline / canvas / debate.
El debate narra con dos voces: la tesis y los turnos del contrincante con
em_santa, el opening y las opciones del defensor con em_alex.
Las opciones se mapean POR POSICIÓN dentro de options_audio (robusto tanto
para nombres 0-based como 1-based).
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

VOICE = "ef_dora"          # narración principal (fem)
VOICE_POSITIVISTA = "em_santa"  # contrincante del debate (masc)
VOICE_DEFENSOR = "em_alex"      # defensor/estudiante del debate (masc)
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


def synth(name: str, text: str, dest_dir: Path, voice: str = VOICE) -> None:
    dest = dest_dir / f"{name}.mp3"
    if dest.is_file():
        print(f"  = ya existe {dest.name}")
        return
    if not text or not text.strip():
        print(f"  ! TEXTO VACÍO: {dest.name} — no generado")
        return
    subprocess.run([str(KOKORO), str(GEN), text, "--out", str(wav(name)), "--voice", voice],
                   check=True, capture_output=True, env={**os.environ, **GPU_ENV})
    mp3(dest)
    print(f"  ✓ {dest.name} (voz {voice})")


def slide_name(s: dict, i: int) -> str:
    """Nombre determinista del MP3 del slide: el campo `audio` si existe
    (permite la portada slide-00.mp3 de lesson-008) o slide-<i+1> (legacy)."""
    explicit = (s.get("audio") or "").rsplit(".", 1)[0]
    return explicit if explicit else f"slide-{i + 1:02d}"


def options_audio_pair(sub: dict, opt_name: str, m: int) -> tuple[str, str]:
    """Devuelve (nombre_mp3, texto) de una opción mapeando por posición m en
    options_audio → options (robusto para nombres 0-based y 1-based)."""
    options = sub.get("options") or []
    text = options[m] if m < len(options) else ""
    return opt_name.rsplit(".", 1)[0], text


def synth_quiz(quiz: dict, AUDIO_DIR: Path) -> None:
    """Quiz estándar: pregunta + opciones (options_audio)."""
    if quiz.get("audio"):
        synth(quiz["audio"].rsplit(".", 1)[0], quiz.get("question", ""), AUDIO_DIR)
    for m, opt_name in enumerate(quiz.get("options_audio") or []):
        if opt_name:
            name, text = options_audio_pair(quiz, opt_name, m)
            if text:
                synth(name, text, AUDIO_DIR)


def main() -> None:
    lesson_id = sys.argv[1] if len(sys.argv) > 1 else "lesson-002"
    AUDIO_DIR = ROOT / "lessons" / lesson_id / "audio"
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    GLOSS_AUDIO.mkdir(parents=True, exist_ok=True)

    slides = json.loads((ROOT / "lessons" / lesson_id / "slides.json").read_text())["slides"]

    for i, s in enumerate(slides):
        synth(slide_name(s, i), s.get("text", ""), AUDIO_DIR)
        if s.get("audio_instr") and s.get("instructions"):
            synth(s["audio_instr"].rsplit(".", 1)[0], s["instructions"], AUDIO_DIR)

        # predicción (dict): pregunta + opciones
        pred = s.get("prediction") or {}
        if isinstance(pred, dict):
            if pred.get("audio"):
                synth(pred["audio"].rsplit(".", 1)[0], pred.get("question", ""), AUDIO_DIR)
            for m, opt_name in enumerate(pred.get("options_audio") or []):
                if opt_name:
                    name, text = options_audio_pair(pred, opt_name, m)
                    if text:
                        synth(name, text, AUDIO_DIR)

        # quiz: dict (1 pregunta) o lista (N preguntas, ej. quiz-08-{1..3})
        quiz = s.get("quiz")
        if isinstance(quiz, dict):
            synth_quiz(quiz, AUDIO_DIR)
        elif isinstance(quiz, list):
            for q in quiz:
                synth_quiz(q, AUDIO_DIR)

        # experiment legacy (exp-03.mp3, lecciones 001-007)
        exp = s.get("experiment") or {}
        if exp.get("audio") and exp.get("prompt"):
            synth(exp["audio"].rsplit(".", 1)[0], exp["prompt"], AUDIO_DIR)

        # self-explanation
        se = s.get("self_explain") or {}
        if se.get("audio") and se.get("prompt"):
            synth(se["audio"].rsplit(".", 1)[0], se["prompt"], AUDIO_DIR)

        # widget: satiation (palabra suelta y en contexto)
        w = s.get("widget") or {}
        if w.get("type") == "satiation":
            for wd in w.get("words") or []:
                if wd.get("word_audio"):
                    synth(wd["word_audio"].rsplit(".", 1)[0], wd["word"], AUDIO_DIR)
                if wd.get("context_audio"):
                    synth(wd["context_audio"].rsplit(".", 1)[0], f"{wd['word']}. {wd['context']}", AUDIO_DIR)

        # widget: timeline (predicción de hitos)
        # Naming determinista w-<slideid>-*: task, instr, hint, un MP3 por
        # nodo (year + title + text) y uno por opción de predicción por nodo.
        w = s.get("widget") or {}
        if w.get("type") == "timeline":
            wa = w.get("audio") or {}
            if wa.get("task"):
                synth(wa["task"].rsplit(".", 1)[0], w.get("task", ""), AUDIO_DIR)
            if wa.get("instr"):
                synth(wa["instr"].rsplit(".", 1)[0], w.get("instructions", ""), AUDIO_DIR)
            if wa.get("hint"):
                synth(wa["hint"].rsplit(".", 1)[0], w.get("hint", ""), AUDIO_DIR)
            for ni, node in enumerate(w.get("nodes") or []):
                nodes_audio = wa.get("nodes") or []
                if ni < len(nodes_audio) and nodes_audio[ni]:
                    texto = " ".join(
                        str(x) for x in [node.get("year", ""), node.get("title", ""), node.get("text", "")]
                        if x
                    )
                    synth(nodes_audio[ni].rsplit(".", 1)[0], texto, AUDIO_DIR)
                opts_audio = (wa.get("nodes_options") or [])[ni] if ni < len(wa.get("nodes_options") or []) else []
                for m, opt_name in enumerate(opts_audio):
                    opts = w.get("options") or []
                    if opt_name and m < len(opts):
                        synth(opt_name.rsplit(".", 1)[0], opts[m], AUDIO_DIR)

        # widget: canvas (argument mapping, opcional) — task + hint
        w = s.get("widget") or {}
        if w.get("type") == "canvas":
            wa = w.get("audio") or {}
            if wa.get("task"):
                synth(wa["task"].rsplit(".", 1)[0], w.get("task", ""), AUDIO_DIR)
            if wa.get("hint"):
                synth(wa["hint"].rsplit(".", 1)[0], w.get("hint", ""), AUDIO_DIR)

        # widget: debate — dos voces: contrincante (tesis + turnos) y
        # defensor (opening + opciones). Solo si hay mapa de audio (lesson-008;
        # lecciones previas sin audio map se omiten, retrocompatible).
        w = s.get("widget") or {}
        if w.get("type") == "debate":
            wa = w.get("audio") or {}
            if wa.get("thesis"):
                synth(wa["thesis"].rsplit(".", 1)[0], w.get("thesis", ""), AUDIO_DIR, VOICE_POSITIVISTA)
            if wa.get("opening"):
                synth(wa["opening"].rsplit(".", 1)[0], w.get("opening", ""), AUDIO_DIR, VOICE_DEFENSOR)
            turns = w.get("turns") or []
            for ti, turn in enumerate(turns):
                turns_audio = wa.get("turns") or []
                if ti < len(turns_audio) and turns_audio[ti]:
                    synth(turns_audio[ti].rsplit(".", 1)[0], turn.get("agent", ""), AUDIO_DIR, VOICE_POSITIVISTA)
                topts_audio = (wa.get("turns_options") or [])[ti] if ti < len(wa.get("turns_options") or []) else []
                topts = turn.get("options") or [r.get("text", "") for r in (turn.get("responses") or [])]
                for m, opt_name in enumerate(topts_audio):
                    if opt_name and m < len(topts):
                        synth(opt_name.rsplit(".", 1)[0], topts[m], AUDIO_DIR, VOICE_DEFENSOR)

        # widget: levels_reality (jerarquía de niveles / doble control).
        # Naming determinista w-<slideid>-*: task, instr, hint, por nivel
        # (name, law_prompt + law_options, boundary_prompt + boundary_options,
        # derivable_prompt, feedback_ok/ko), derivable_options compartidos
        # (Sí/No) y la pregunta final (prompt + options + feedback_ok/ko).
        # Los niveles se recorren por índice de config (orden inferior→superior);
        # el mapa audio.levels[N] se alinea por posición con w.levels[N].
        w = s.get("widget") or {}
        if w.get("type") == "levels_reality":
            wa = w.get("audio") or {}
            if wa.get("task"):
                synth(wa["task"].rsplit(".", 1)[0], w.get("task", ""), AUDIO_DIR)
            if wa.get("instr"):
                synth(wa["instr"].rsplit(".", 1)[0], w.get("instructions", ""), AUDIO_DIR)
            if wa.get("hint"):
                synth(wa["hint"].rsplit(".", 1)[0], w.get("hint", ""), AUDIO_DIR)
            levels = w.get("levels") or []
            for li, lv in enumerate(levels):
                la = (wa.get("levels") or [])[li] if li < len(wa.get("levels") or []) else {}
                if not isinstance(la, dict):
                    la = {}
                if la.get("name"):
                    synth(
                        la["name"].rsplit(".", 1)[0],
                        " ".join(str(x) for x in [lv.get("name", ""), lv.get("text", "")] if x),
                        AUDIO_DIR,
                    )
                if la.get("law_prompt"):
                    synth(la["law_prompt"].rsplit(".", 1)[0], lv.get("law_prompt", ""), AUDIO_DIR)
                for m, opt_name in enumerate(la.get("law_options") or []):
                    opts = lv.get("law_options") or []
                    if opt_name and m < len(opts):
                        synth(opt_name.rsplit(".", 1)[0], opts[m], AUDIO_DIR)
                if la.get("boundary_prompt"):
                    synth(la["boundary_prompt"].rsplit(".", 1)[0], lv.get("boundary_prompt", ""), AUDIO_DIR)
                for m, opt_name in enumerate(la.get("boundary_options") or []):
                    opts = lv.get("boundary_options") or []
                    if opt_name and m < len(opts):
                        synth(opt_name.rsplit(".", 1)[0], opts[m], AUDIO_DIR)
                if la.get("derivable_prompt"):
                    synth(la["derivable_prompt"].rsplit(".", 1)[0], lv.get("derivable_prompt", ""), AUDIO_DIR)
                if la.get("feedback_ok"):
                    synth(la["feedback_ok"].rsplit(".", 1)[0], lv.get("feedback_ok", ""), AUDIO_DIR)
                if la.get("feedback_ko"):
                    synth(la["feedback_ko"].rsplit(".", 1)[0], lv.get("feedback_ko", ""), AUDIO_DIR)
            # opciones compartidas de no-derivación (Sí/No): fijas en el JS
            deriv_opts_text = ["Sí", "No"]
            for m, opt_name in enumerate(wa.get("derivable_options") or []):
                if opt_name and m < len(deriv_opts_text):
                    synth(opt_name.rsplit(".", 1)[0], deriv_opts_text[m], AUDIO_DIR)
            fin = w.get("final") or {}
            fa = wa.get("final") or {}
            if not isinstance(fa, dict):
                fa = {}
            if fa.get("prompt"):
                synth(fa["prompt"].rsplit(".", 1)[0], fin.get("prompt", ""), AUDIO_DIR)
            for m, opt_name in enumerate(fa.get("options") or []):
                opts = fin.get("options") or []
                if opt_name and m < len(opts):
                    synth(opt_name.rsplit(".", 1)[0], opts[m], AUDIO_DIR)
            if fa.get("feedback_ok"):
                synth(fa["feedback_ok"].rsplit(".", 1)[0], fin.get("feedback_ok", ""), AUDIO_DIR)
            if fa.get("feedback_ko"):
                synth(fa["feedback_ko"].rsplit(".", 1)[0], fin.get("feedback_ko", ""), AUDIO_DIR)

    # glosario: los términos de esta lección (texto = término + definición)
    gloss = json.loads((ROOT / "glossary" / "glossary.json").read_text())
    for g in gloss:
        if g["lesson"] == lesson_id and g.get("audio"):
            synth(g["audio"].rsplit(".", 1)[0], f"{g['term']}. {g['definition']}", GLOSS_AUDIO)

    print("Audio de la lección generado.")


if __name__ == "__main__":
    main()
