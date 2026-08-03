from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse

from main import templates
from lib import fs, types

router = APIRouter()


@router.post("/api/telemetry")
def telemetry(ev: types.TelemetryEvent):
    fs.append_response(ev.lesson_id, ev.model_dump(exclude_none=True))
    return {"ok": True}


@router.post("/api/prediction/{lesson_id}")
def prediction(lesson_id: str, payload: types.Prediction):
    fs.append_response(
        lesson_id,
        {"ev": "prediction", "q": payload.q, "answer": payload.answer, "ts": fs.now_ms()},
    )
    return {"ok": True}


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
