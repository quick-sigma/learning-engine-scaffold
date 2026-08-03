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
