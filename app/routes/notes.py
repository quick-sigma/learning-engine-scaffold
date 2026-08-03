from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse

from main import templates
from lib import fs

router = APIRouter()


@router.get("/partials/notes", response_class=HTMLResponse)
def partial_notes(request: Request):
    return templates.TemplateResponse(
        request, "partials/tab_notes.html", {"notes": fs.list_notes()}
    )


@router.post("/api/notes/{lesson_id}", response_class=HTMLResponse)
def save_note(request: Request, lesson_id: str, text: str = Form("")):
    fs.save_note(lesson_id, text)
    fs.append_response(lesson_id, {"ev": "note", "text": text[:200], "ts": fs.now_ms()})
    fs.recompute_accuracy(lesson_id)
    return templates.TemplateResponse(
        request, "partials/note_saved.html", {"lesson_id": lesson_id}
    )
