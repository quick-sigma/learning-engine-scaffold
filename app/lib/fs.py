from __future__ import annotations

import json
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent.parent  # learning/

DEFAULT_CONFIG: dict[str, Any] = {
    "source_path": "",
    "source_type": "",
    "total_pages": 0,
    "current_page": 1,
    "current_section": "",
    "current_lesson": None,
    "current_concept": None,
    "mastery_score": 0,
    "learning_goals": [],
    "preferred_language": "es",
    "history": [],
    "last_updated": "",
}

_SAFE_NAME = re.compile(r"^[a-z0-9._-]+$")


# ---------------------------------------------------------------------------
# config.json
# ---------------------------------------------------------------------------

def read_config() -> dict[str, Any]:
    path = ROOT / "config.json"
    if not path.is_file():
        return dict(DEFAULT_CONFIG)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        merged = dict(DEFAULT_CONFIG)
        merged.update(data)
        return merged
    except Exception:
        return dict(DEFAULT_CONFIG)


def write_config(data: dict[str, Any]) -> None:
    cfg = dict(DEFAULT_CONFIG)
    cfg.update(data)
    cfg["last_updated"] = datetime.now().strftime("%Y-%m-%d")
    (ROOT / "config.json").write_text(
        json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8"
    )


# ---------------------------------------------------------------------------
# lecciones
# ---------------------------------------------------------------------------

def list_lessons() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    lessons_dir = ROOT / "lessons"
    if not lessons_dir.is_dir():
        return out
    for d in sorted(lessons_dir.glob("lesson-*")):
        if not d.is_dir():
            continue
        lesson_id = d.name
        title = f"Lección {lesson_id}"
        content_file = d / "content.md"
        slides_file = d / "slides.json"
        if content_file.is_file():
            first = next(
                (ln.lstrip("# ").strip() for ln in content_file.read_text(encoding="utf-8").splitlines() if ln.strip()),
                "",
            )
            if first:
                title = first
        slides: list[dict[str, Any]] = []
        slides_root: dict[str, Any] = {"slides": []}
        if slides_file.is_file():
            try:
                slides_root = json.loads(slides_file.read_text(encoding="utf-8"))
                slides = slides_root.get("slides", [])
            except Exception:
                slides_root = {"slides": []}
                slides = []
        acc = load_accuracy(lesson_id)
        ready, missing_audio = lesson_audio_status(lesson_id, slides_root)
        out.append(
            {
                "id": lesson_id,
                "title": title,
                "slides": len(slides),
                "mastery": acc.get("mastery", 0),
                "has_content": content_file.is_file(),
                "ready": ready,
                "missing_audio": missing_audio,
                "updated": acc.get("updated", ""),
            }
        )
    return out


def load_lesson(lesson_id: str) -> dict[str, Any] | None:
    if not _SAFE_NAME.match(lesson_id):
        return None
    slides_file = ROOT / "lessons" / lesson_id / "slides.json"
    if not slides_file.is_file():
        return None
    try:
        return json.loads(slides_file.read_text(encoding="utf-8"))
    except Exception:
        return None


def lesson_audio_status(lesson_id: str, lesson: dict[str, Any] | None = None) -> tuple[bool, list[str]]:
    """Verifica que exista cada MP3 referenciado en slides.json.

    Devuelve (audio_completo, [faltantes]). La lección NO es visible hasta que
    audio_completo es True (publicación retardada, §5.9/§6.7 de SKILL.md).
    """
    if not _SAFE_NAME.match(lesson_id):
        return False, ["lesson_id inválido"]
    if lesson is None:
        lesson = load_lesson(lesson_id)
    if lesson is None:
        return False, ["sin slides.json"]
    audio_dir = ROOT / "lessons" / lesson_id / "audio"
    missing: list[str] = []
    for slide in lesson.get("slides", []):
        # audio de la slide, instrucciones y alt de imagen
        for field in ("audio", "audio_instr", "audio_alt"):
            name = slide.get(field)
            if name and not (audio_dir / name).is_file():
                missing.append(f"{slide.get('id', '?')}/{field}: {name}")
        # audio anidado de predicción, experimento, self-explanation y quiz
        for sub_key in ("prediction", "experiment", "self_explain", "quiz"):
            sub = slide.get(sub_key)
            if isinstance(sub, dict):
                name = sub.get("audio")
                if name and not (audio_dir / name).is_file():
                    missing.append(f"{slide.get('id', '?')}/{sub_key}.audio: {name}")
                name = sub.get("feedback_audio")
                if name and not (audio_dir / name).is_file():
                    missing.append(f"{slide.get('id', '?')}/{sub_key}.feedback: {name}")
                # cada opción de quiz/predicción debe estar narrada
                for i, opt in enumerate(sub.get("options_audio") or []):
                    if opt and not (audio_dir / opt).is_file():
                        missing.append(f"{slide.get('id', '?')}/{sub_key}.opcion[{i}]: {opt}")
    # Marca explícita de publicación en slides.json (audio_ready)
    ready_flag = lesson.get("audio_ready", True)
    return (ready_flag and not missing), missing


def lesson_is_ready(lesson_id: str) -> bool:
    return lesson_audio_status(lesson_id)[0]


def lesson_audio_path(lesson_id: str, filename: str) -> Path | None:
    if not _SAFE_NAME.match(lesson_id) or not _SAFE_NAME.match(filename):
        return None
    p = (ROOT / "lessons" / lesson_id / "audio" / filename).resolve()
    if not p.is_file() or not str(p).startswith(str(ROOT.resolve())):
        return None
    return p


def check_quiz_answer(lesson: dict[str, Any], slide_id: str, answer: str) -> bool:
    for slide in lesson.get("slides", []):
        if slide.get("id") != slide_id or "quiz" not in slide:
            continue
        correct_idx = slide["quiz"].get("correct")
        return answer == str(correct_idx)
    return False


# ---------------------------------------------------------------------------
# glosario
# ---------------------------------------------------------------------------

def load_glossary() -> list[dict[str, Any]]:
    path = ROOT / "glossary" / "glossary.json"
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else data.get("entries", [])
    except Exception:
        return []


def glossary_audio_path(filename: str) -> Path | None:
    if not _SAFE_NAME.match(filename):
        return None
    p = (ROOT / "glossary" / "audio" / filename).resolve()
    if not p.is_file() or not str(p).startswith(str(ROOT.resolve())):
        return None
    return p


# ---------------------------------------------------------------------------
# notas
# ---------------------------------------------------------------------------

def list_notes() -> list[dict[str, Any]]:
    notes_dir = ROOT / "notes"
    lessons_dir = ROOT / "lessons"
    out: list[dict[str, Any]] = []
    ids: set[str] = set()
    if notes_dir.is_dir():
        for f in sorted(notes_dir.glob("lesson-*.md")):
            lesson_id = f.stem
            ids.add(lesson_id)
            try:
                mtime = datetime.fromtimestamp(f.stat().st_mtime)
            except Exception:
                mtime = datetime.now()
            out.append(
                {
                    "lesson_id": lesson_id,
                    "text": f.read_text(encoding="utf-8"),
                    "updated": mtime.strftime("%Y-%m-%d %H:%M"),
                }
            )
    if lessons_dir.is_dir():
        for d in sorted(lessons_dir.glob("lesson-*")):
            if d.is_dir() and d.name not in ids:
                out.append({"lesson_id": d.name, "text": "", "updated": ""})
    out.sort(key=lambda n: n["lesson_id"])
    return out


def get_note(lesson_id: str) -> str:
    if not _SAFE_NAME.match(lesson_id):
        return ""
    path = ROOT / "notes" / f"{lesson_id}.md"
    return path.read_text(encoding="utf-8") if path.is_file() else ""


def save_note(lesson_id: str, text: str) -> None:
    if not _SAFE_NAME.match(lesson_id):
        return
    (ROOT / "notes").mkdir(exist_ok=True)
    (ROOT / "notes" / f"{lesson_id}.md").write_text(text, encoding="utf-8")


# ---------------------------------------------------------------------------
# telemetría / accuracy
# ---------------------------------------------------------------------------

def now_ms() -> int:
    return int(time.time() * 1000)


def append_response(lesson_id: str, event: dict[str, Any]) -> None:
    if not _SAFE_NAME.match(lesson_id):
        return
    dirpath = ROOT / "responses"
    dirpath.mkdir(exist_ok=True)
    with open(dirpath / f"{lesson_id}.jsonl", "a", encoding="utf-8") as fh:
        fh.write(json.dumps(event, ensure_ascii=False) + "\n")


def load_responses(lesson_id: str) -> list[dict[str, Any]]:
    if not _SAFE_NAME.match(lesson_id):
        return []
    path = ROOT / "responses" / f"{lesson_id}.jsonl"
    if not path.is_file():
        return []
    out: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            out.append(json.loads(line))
        except Exception:
            continue
    return out


def load_accuracy(lesson_id: str) -> dict[str, Any]:
    if not _SAFE_NAME.match(lesson_id):
        return {}
    path = ROOT / "accuracy" / f"{lesson_id}.json"
    if not path.is_file():
        return {"lesson_id": lesson_id, "mastery": 0}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {"lesson_id": lesson_id, "mastery": 0}


def save_accuracy(lesson_id: str, data: dict[str, Any]) -> None:
    if not _SAFE_NAME.match(lesson_id):
        return
    (ROOT / "accuracy").mkdir(exist_ok=True)
    (ROOT / "accuracy" / f"{lesson_id}.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def recompute_accuracy(lesson_id: str) -> dict[str, Any]:
    events = load_responses(lesson_id)
    quiz = [e for e in events if e.get("ev") == "quiz"]
    correct = sum(1 for e in quiz if e.get("correct"))
    total = len(quiz)
    mastery = round(100 * correct / total) if total else 0

    time_on = [e.get("ms", 0) for e in events if e.get("ev") == "time_on_slide"]
    avg_ms = round(sum(time_on) / len(time_on)) if time_on else 0

    seen: set[str] = set()
    revisited: list[str] = []
    prev_h = None
    for e in events:
        if e.get("ev") != "slidechange":
            continue
        h = e.get("indexh")
        if prev_h is not None and isinstance(h, int) and isinstance(prev_h, int) and h < prev_h:
            slide = str(h)
            if slide not in seen:
                revisited.append(slide)
                seen.add(slide)
        prev_h = h

    acc = {
        "lesson_id": lesson_id,
        "mastery": mastery,
        "quiz_total": total,
        "quiz_correct": correct,
        "quiz_errors": [e.get("answer") for e in quiz if not e.get("correct")],
        "prediction_count": sum(1 for e in events if e.get("ev") == "prediction"),
        "notes_count": sum(1 for e in events if e.get("ev") == "note"),
        "audio_played_count": sum(1 for e in events if e.get("ev") == "audio"),
        "avg_time_per_slide_ms": avg_ms,
        "revisited_slides": revisited,
        "updated": datetime.now().isoformat(timespec="seconds"),
    }
    save_accuracy(lesson_id, acc)

    cfg = read_config()
    cfg["mastery_score"] = mastery
    write_config(cfg)
    return acc


# ---------------------------------------------------------------------------
# widgets (estado de herramientas interactivas por lección)
# ---------------------------------------------------------------------------

def widget_state_path(lesson_id: str, widget_id: str) -> Path | None:
    if not _SAFE_NAME.match(lesson_id) or not _SAFE_NAME.match(widget_id):
        return None
    return (ROOT / "widgets" / lesson_id / f"{widget_id}.json").resolve()


def save_widget_state(lesson_id: str, widget_id: str, data: dict[str, Any]) -> bool:
    path = widget_state_path(lesson_id, widget_id)
    if path is None:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return True
    except Exception:
        return False


def load_widget_state(lesson_id: str, widget_id: str) -> dict[str, Any] | None:
    path = widget_state_path(lesson_id, widget_id)
    if path is None or not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


# ---------------------------------------------------------------------------
# media
# ---------------------------------------------------------------------------

def media_path(relative: str) -> Path:
    p = (ROOT / "media" / relative).resolve()
    if not str(p).startswith(str((ROOT / "media").resolve())):
        return ROOT / "media" / "__invalid__"
    return p
