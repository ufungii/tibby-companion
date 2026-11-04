import io
import base64
import binascii
import os
import secrets
import time
import wave
from dataclasses import dataclass, field
from typing import Annotated, Callable

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import ValidationError

from models import (Answer, AskRequest, Base64AudioRequest, Context, Encounter, SelectEncounter,
                    Selection, SessionResponse, Source, Turn)
from providers import Provider, ProviderError, load_provider
from records import ENCOUNTERS, format_answer

load_dotenv()
MAX_AUDIO_BYTES = 1_920_044 + 4096
SESSION_SECONDS = 3600


@dataclass
class Session:
    expires: float
    selection_version: int = 0
    encounter_id: str | None = None
    encounter_token: str | None = None
    last_request: int = 0
    histories: dict[str, list[Turn]] = field(default_factory=dict)


def create_app(provider: Provider | None = None,
               clock: Callable[[], float] = time.monotonic) -> FastAPI:
    provider = provider or load_provider()
    api = FastAPI(title="TIBBY development backend", version="0.1.0",
                  description="Synthetic records and demo sessions. No clinician authentication.")
    sessions: dict[str, Session] = {}
    bearer = HTTPBearer(auto_error=False)
    api.add_middleware(
        CORSMiddleware,
        allow_origins=[origin.strip() for origin in os.getenv(
            "TIBBY_CORS_ORIGINS", "http://localhost:8081,http://127.0.0.1:8081"
        ).split(",") if origin.strip()],
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Tibby-Context"],
    )

    @api.middleware("http")
    async def no_cache(request: Request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    def get_session(credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(bearer)
    ]) -> Session:
        if not credentials or credentials.scheme.lower() != "bearer":
            raise HTTPException(401, "Start a new demo session.")
        session = sessions.get(credentials.credentials)
        if not session or session.expires <= clock():
            sessions.pop(credentials.credentials, None)
            raise HTTPException(401, "Session expired. Start a new demo session.")
        return session

    def check_context(session: Session, context: Context):
        if session.expires <= clock():
            raise HTTPException(401, "Session expired. Start a new demo session.")
        if (session.encounter_id != context.encounterId or
            not session.encounter_token or
            not secrets.compare_digest(session.encounter_token, context.encounterToken)):
            raise HTTPException(409, "Patient context changed. Confirm the patient again.")

    def begin_request(session: Session, context: Context):
        check_context(session, context)
        if context.requestId <= session.last_request:
            raise HTTPException(409, "Request is stale. Submit a new question.")
        session.last_request = context.requestId

    def check_response(session: Session, context: Context):
        check_context(session, context)
        if context.requestId != session.last_request:
            raise HTTPException(409, "A newer question replaced this request.")

    async def answer_question(session: Session, context: Context, question: str,
                              transcript: str | None = None, scope: str = "record") -> Answer:
        history = list(session.histories.get(context.encounterId, []))
        try:
            if scope == "conversation":
                text = await provider.respond(question, history)
                sources = [Source(title="Session conversation", detail="Based on the current patient's session transcript and replies; no speaker identity verification.")] if history else []
            else:
                intent = await provider.interpret(question)
                text, sources = format_answer(context.encounterId, intent)
        except ProviderError:
            raise HTTPException(502, "AI service unavailable. Please try again.") from None
        check_response(session, context)
        kind = "wearable" if transcript is not None else "typed"
        history.extend([
            Turn(id=secrets.token_urlsafe(12), role="user", text=question, inputKind=kind),
            Turn(id=secrets.token_urlsafe(12), role="assistant", text=text, inputKind=kind),
        ])
        session.histories[context.encounterId] = history[-40:]
        return Answer(context=context, text=text, sources=sources, transcript=transcript, provider=provider.name)

    @api.get("/health")
    def health():
        return {"status": "ok", "mode": "synthetic", "provider": provider.name}

    @api.post("/v1/sessions", response_model=SessionResponse, status_code=201)
    async def start_session():
        for token in [key for key, item in sessions.items() if item.expires <= clock()]:
            del sessions[token]
        if len(sessions) >= 128:
            raise HTTPException(503, "Demo session limit reached. Try later.")
        token = secrets.token_urlsafe(32)
        sessions[token] = Session(expires=clock() + SESSION_SECONDS)
        return SessionResponse(sessionToken=token, expiresIn=SESSION_SECONDS,
                               provider=provider.name, model=getattr(provider, "model", None),
                               audioMode="check" if provider.name == "demo" else "transcription")

    @api.delete("/v1/sessions/current", status_code=204)
    async def end_session(session: Annotated[Session, Depends(get_session)]):
        session.expires = 0  # Also invalidates requests already awaiting a provider.
        for token in [key for key, value in sessions.items() if value is session]:
            del sessions[token]
        return Response(status_code=204)

    @api.get("/v1/encounters", response_model=list[Encounter])
    async def roster(session: Annotated[Session, Depends(get_session)]):
        return ENCOUNTERS

    @api.put("/v1/encounters/active", response_model=Selection)
    async def select(body: SelectEncounter, session: Annotated[Session, Depends(get_session)]):
        if body.selectionVersion <= session.selection_version:
            raise HTTPException(409, "Selection was superseded by a newer change.")
        if body.encounterId is not None and body.encounterId not in {e.id for e in ENCOUNTERS}:
            raise HTTPException(404, "Unknown demo encounter.")
        session.selection_version = body.selectionVersion
        session.encounter_id = body.encounterId
        session.encounter_token = secrets.token_urlsafe(24) if body.encounterId else None
        session.last_request = 0
        return Selection(encounterToken=session.encounter_token,
                         selectionVersion=session.selection_version)

    @api.post("/v1/ask", response_model=Answer)
    async def ask(body: AskRequest, session: Annotated[Session, Depends(get_session)]):
        begin_request(session, body.context)
        return await answer_question(session, body.context, body.question, scope=body.scope)

    @api.get("/v1/conversation")
    async def conversation(session: Annotated[Session, Depends(get_session)]):
        return {"encounterId": session.encounter_id,
                "messages": session.histories.get(session.encounter_id, [])}

    def validate_audio(audio: bytes) -> int:
        if len(audio) > MAX_AUDIO_BYTES:
            raise HTTPException(413, "Recording exceeds the 60-second upload limit.")
        try:
            with wave.open(io.BytesIO(audio), "rb") as wav:
                if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getcomptype()) != (1, 2, 16000, "NONE"):
                    raise ValueError()
                frames = wav.getnframes()
                if not 0 < frames <= 16000 * 60:
                    raise ValueError()
                pcm = wav.readframes(frames)
                if len(pcm) != frames * 2 or not any(pcm):
                    raise ValueError()
        except (wave.Error, EOFError, ValueError):
            raise HTTPException(422, "Expected non-empty 16 kHz mono 16-bit PCM WAV, up to 60 seconds.") from None
        return frames

    @api.post("/v1/audio/check", response_model=Answer)
    async def check_audio(body: Base64AudioRequest, session: Annotated[Session, Depends(get_session)]):
        begin_request(session, body.context)
        try:
            audio = base64.b64decode(body.audioBase64, validate=True)
        except (ValueError, binascii.Error):
            raise HTTPException(422, "Invalid base64 WAV data.") from None
        frames = validate_audio(audio)
        check_response(session, body.context)
        receipt = f"Received {frames / 16000:.2f} seconds of wearable audio ({len(audio)} bytes)."
        text = receipt + " Connection test complete. Speech transcription and AI were not used."
        history = session.histories.setdefault(body.context.encounterId, [])
        history.extend([
            Turn(id=secrets.token_urlsafe(12), role="user", inputKind="wearable-check",
                 text=receipt + " Audio was not transcribed."),
            Turn(id=secrets.token_urlsafe(12), role="assistant", inputKind="wearable-check", text=text),
        ])
        session.histories[body.context.encounterId] = history[-40:]
        return Answer(context=body.context, text=text, sources=[], provider="connection-test")

    async def process_audio(session: Session, context: Context, audio: bytes, scope: str = "record") -> Answer:
        validate_audio(audio)
        if provider.name == "demo":
            raise HTTPException(503, "Audio transcription requires Navigator mode; use text questions in demo mode.")
        try:
            transcript = await provider.transcribe(audio)
        except ProviderError:
            raise HTTPException(502, "Transcription service unavailable. Please try again.") from None
        check_response(session, context)
        return await answer_question(session, context, transcript, transcript=transcript, scope=scope)

    @api.post("/v1/ask/audio/base64", response_model=Answer)
    async def ask_audio_base64(body: Base64AudioRequest, session: Annotated[Session, Depends(get_session)]):
        begin_request(session, body.context)
        try:
            audio = base64.b64decode(body.audioBase64, validate=True)
        except (ValueError, binascii.Error):
            raise HTTPException(422, "Invalid base64 WAV data.") from None
        return await process_audio(session, body.context, audio, scope=body.scope)

    @api.post("/v1/ask/audio", response_model=Answer)
    async def ask_audio(request: Request, session: Annotated[Session, Depends(get_session)],
                        x_tibby_context: Annotated[str, Header(max_length=2048)]):
        try:
            context = Context.model_validate_json(x_tibby_context)
        except ValidationError:
            raise HTTPException(422, "Invalid X-Tibby-Context header.") from None
        begin_request(session, context)
        if request.headers.get("content-type", "").split(";")[0].strip() != "audio/wav":
            raise HTTPException(415, "Send a PCM WAV recording as audio/wav.")
        audio = bytearray()
        async for chunk in request.stream():
            if len(audio) + len(chunk) > MAX_AUDIO_BYTES:
                raise HTTPException(413, "Recording exceeds the 60-second upload limit.")
            audio.extend(chunk)
        return await process_audio(session, context, bytes(audio))

    return api


app = create_app()
