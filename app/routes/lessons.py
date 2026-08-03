from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse

from main import templates
from lib import fs

router = APIRouter()


@router.get("/lessons/{lesson_id}", response_class=HTMLResponse)
def lesson(request: Request, lesson_id: str):
    data = fs.load_lesson(lesson_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Lección no encontrada")
    ready, missing = fs.lesson_audio_status(lesson_id, data)
    if not ready:
        return templates.TemplateResponse(
            request,
            "lesson_pending.html",
            {"lesson_id": lesson_id, "missing_audio": missing},
            status_code=409,
        )
    return templates.TemplateResponse(
        request,
        "lesson.html",
        {
            "lesson_id": lesson_id,
            "slides": data.get("slides", []),
            "accuracy": fs.load_accuracy(lesson_id),
        },
    )


@router.get("/lessons/{lesson_id}/audio/{filename}")
def lesson_audio(lesson_id: str, filename: str):
    path = fs.lesson_audio_path(lesson_id, filename)
    if path is None:
        raise HTTPException(status_code=404, detail="Audio no encontrado")
    return FileResponse(path)


@router.get("/media/{path:path}")
def media(path: str):
    p = fs.media_path(path)
    if not p.is_file():
        raise HTTPException(status_code=404, detail="Media no encontrado")
    return FileResponse(p)
