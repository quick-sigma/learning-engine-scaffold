from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

BASE_DIR = Path(__file__).resolve().parent

templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

app = FastAPI(title="Cognitive Learning Engine", version="0.1.0")

app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

from routes import index, lessons, glossary, notes, api

app.include_router(index.router)
app.include_router(lessons.router)
app.include_router(glossary.router)
app.include_router(notes.router)
app.include_router(api.router)
