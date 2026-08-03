from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from main import templates
from lib import fs

router = APIRouter()

_TABS = ("lessons", "glossary", "notes")


def _shell_ctx(tab: str) -> dict:
    return {
        "tab": tab,
        "lessons": fs.list_lessons(),
        "glossary": fs.load_glossary(),
        "notes": fs.list_notes(),
        "config": fs.read_config(),
    }


@router.get("/", response_class=HTMLResponse)
def index(request: Request, tab: str = "lessons"):
    if tab not in _TABS:
        tab = "lessons"
    return templates.TemplateResponse(request, "index.html", _shell_ctx(tab))


@router.get("/partials/lessons", response_class=HTMLResponse)
def partial_lessons(request: Request):
    return templates.TemplateResponse(
        request, "partials/tab_lessons.html", {"lessons": fs.list_lessons()}
    )
