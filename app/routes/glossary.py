from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse

from main import templates
from lib import fs

router = APIRouter()


@router.get("/partials/glossary", response_class=HTMLResponse)
def partial_glossary(request: Request):
    return templates.TemplateResponse(
        request, "partials/tab_glossary.html", {"glossary": fs.load_glossary()}
    )


@router.get("/glossary/audio/{filename}")
def glossary_audio(filename: str):
    path = fs.glossary_audio_path(filename)
    if path is None:
        raise HTTPException(status_code=404, detail="Audio no encontrado")
    return FileResponse(path)
