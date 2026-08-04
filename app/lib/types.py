from pydantic import BaseModel, ConfigDict, Field


class TelemetryEvent(BaseModel):
    model_config = ConfigDict(extra="allow")

    lesson_id: str
    ev: str
    ts: int | None = None


class Prediction(BaseModel):
    lesson_id: str
    q: str
    answer: str


class NotePayload(BaseModel):
    lesson_id: str
    text: str


class WidgetState(BaseModel):
    """Estado de un widget interactivo guardado desde el frontend.

    `state` es un dict arbitrario (nodos/aristas del lienzo, celdas de la
    tabla de verdad, transcript del debate, etc.). `ev` es la etiqueta de
    telemetría (canvas, logic_truth, debate, ...) que se registra en
    `responses/`.
    """

    ev: str = "widget"
    state: dict = Field(default_factory=dict)


class RunCodePayload(BaseModel):
    """Código enviado al editor vivo del widget `code_editor` (programación
    e IA). Se ejecuta en el sandbox de `lib/runner.py` y el resultado se
    devuelve como JSON (fetch, no HTMX)."""

    lesson_id: str
    widget: str = "code"
    slide: str = ""
    language: str = "python"
    code: str = ""
