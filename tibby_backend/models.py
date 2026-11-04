from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Encounter(Model):
    id: str
    patientName: str
    patientId: str
    dateOfBirth: str
    room: str


class Context(Model):
    requestId: int = Field(gt=0, strict=True)
    encounterId: str = Field(min_length=1, max_length=100)
    contextVersion: int = Field(gt=0, strict=True)
    encounterToken: str = Field(min_length=1, max_length=200, pattern=r"^[A-Za-z0-9_-]+$")


class AskRequest(Model):
    context: Context
    question: str = Field(min_length=1, max_length=500)
    scope: Literal["record", "conversation"] = "record"


class Turn(Model):
    id: str
    role: Literal["user", "assistant"]
    text: str
    inputKind: Literal["typed", "wearable"]


class Source(Model):
    title: str
    detail: str


class Answer(Model):
    context: Context
    text: str
    sources: list[Source]
    transcript: str | None = None
    synthetic: Literal[True] = True
    provider: str = "demo"


class SelectEncounter(Model):
    encounterId: str | None = Field(default=None, max_length=100)
    selectionVersion: int = Field(gt=0, strict=True)


class Selection(Model):
    encounterToken: str | None
    selectionVersion: int


class SessionResponse(Model):
    sessionToken: str
    expiresIn: int
    mode: Literal["synthetic"] = "synthetic"
    provider: str = "demo"
    model: str | None = None


class Base64AudioRequest(Model):
    context: Context
    audioBase64: str = Field(min_length=1, max_length=2_566_000)
    scope: Literal["record", "conversation"] = "conversation"
