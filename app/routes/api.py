from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse

from main import templates
from lib import fs, types

router = APIRouter()


def _append_to_note(lesson_id: str, section: str, text: str) -> None:
    existing = fs.get_note(lesson_id)
    if not existing:
        existing = f"# Notas de {lesson_id}\n"
    existing = existing.rstrip() + f"\n\n## {section}\n{text}\n"
    fs.save_note(lesson_id, existing)


@router.post("/api/telemetry")
def telemetry(ev: types.TelemetryEvent):
    fs.append_response(ev.lesson_id, ev.model_dump(exclude_none=True))
    return {"ok": True}


@router.post("/api/widget/{lesson_id}/{widget_id}")
def widget_state(lesson_id: str, widget_id: str, payload: types.WidgetState):
    fs.save_widget_state(lesson_id, widget_id, payload.state)
    fs.append_response(
        lesson_id,
        {
            "ev": payload.ev,
            "widget": widget_id,
            "state": payload.state,
            "ts": fs.now_ms(),
        },
    )
    return {"ok": True}


@router.post("/api/prediction/{lesson_id}")
def prediction(lesson_id: str, payload: types.Prediction):
    fs.append_response(
        lesson_id,
        {"ev": "prediction", "q": payload.q, "answer": payload.answer, "ts": fs.now_ms()},
    )
    return {"ok": True}


@router.post("/api/prediction_form/{lesson_id}", response_class=HTMLResponse)
def prediction_form(
    request: Request, lesson_id: str, slide: str = Form(...), q: str = Form(...), answer: str = Form(...)
):
    fs.append_response(
        lesson_id,
        {"ev": "prediction", "slide": slide, "q": q, "answer": answer, "ts": fs.now_ms()},
    )
    return templates.TemplateResponse(request, "partials/prediction_result.html", {})


@router.post("/api/experiment/{lesson_id}", response_class=HTMLResponse)
def experiment(request: Request, lesson_id: str, slide: str = Form(...), text: str = Form(...)):
    fs.append_response(
        lesson_id, {"ev": "experiment", "slide": slide, "text": text[:2000], "ts": fs.now_ms()}
    )
    _append_to_note(lesson_id, f"Experimento (slide {slide})", text)
    return templates.TemplateResponse(request, "partials/experiment_saved.html", {})


@router.post("/api/self_explain/{lesson_id}", response_class=HTMLResponse)
def self_explain(request: Request, lesson_id: str, slide: str = Form(...), text: str = Form(...)):
    fs.append_response(
        lesson_id, {"ev": "self_explain", "slide": slide, "text": text[:2000], "ts": fs.now_ms()}
    )
    _append_to_note(lesson_id, f"Reflexión (slide {slide})", text)
    return templates.TemplateResponse(request, "partials/self_explain_saved.html", {})


@router.post("/api/quiz/{lesson_id}", response_class=HTMLResponse)
def quiz(request: Request, lesson_id: str, slide: str = Form(...), answer: str = Form(...)):
    lesson = fs.load_lesson(lesson_id)
    correct = bool(lesson) and fs.check_quiz_answer(lesson, slide, answer)
    fs.append_response(
        lesson_id,
        {"ev": "quiz", "slide": slide, "answer": answer, "correct": correct, "ts": fs.now_ms()},
    )
    accuracy = fs.recompute_accuracy(lesson_id)
    return templates.TemplateResponse(
        request,
        "partials/quiz_result.html",
        {"correct": correct, "accuracy": accuracy},
    )
