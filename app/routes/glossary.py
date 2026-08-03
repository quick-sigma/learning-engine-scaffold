from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from main import templates
from lib import fs

router = APIRouter()


@router.get("/partials/glossary", response_class=HTMLResponse)
def partial_glossary(request: Request):
    return templates.TemplateResponse(
        request, "partials/tab_glossary.html", {"glossary": fs.load_glossary()}
    )
