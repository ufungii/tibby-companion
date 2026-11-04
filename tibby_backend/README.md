# TIBBY development backend

A Python/FastAPI API for the Android/iPhone companion app. It runs on a development
computer now and can later run on a server. The default provider makes no external
calls. All records are synthetic. No clinician login or clinical-record integration
is implemented; the session tokens below isolate demo interactions, not clinicians.

## Start

Python 3.12+ is required. From `tibby_backend`:

```sh
uv venv .venv --python python3
uv pip install --python .venv/bin/python -r requirements.lock
cp .env.example .env
.venv/bin/python -m uvicorn app:app --host 0.0.0.0 --port 8000
```

Alternatively, create a standard Python virtual environment and install
`requirements.lock` with pip. The lockfile captures the versions tested here;
`requirements.txt` lists the direct dependency constraints.

Open `http://localhost:8000/docs` for the interactive API documentation, or
`http://localhost:8000/health` to check startup. Binding to `0.0.0.0` makes this
synthetic-data development API reachable from other devices on your network.
Use one process/worker: session state is currently in memory and is lost on restart.

## Connect the app

The app's service address is a team/build setting, not an end-user form. For a
shared hosted service, follow [DEPLOYMENT.md](DEPLOYMENT.md). Set its assigned
HTTPS URL once in the app build environment:

```text
EXPO_PUBLIC_BACKEND_URL=https://YOUR_ASSIGNED_SERVICE_HOST
EXPO_PUBLIC_DEMO_MODE=false
```

The app automatically opens a session on launch. Everyone uses the same service
address, with separate session tokens/history. The current prototype runs at
`https://tibby-backend-9le6.onrender.com` in demo mode. The app defaults to this
address and does not ask users to enter server details.

For local development, set that build variable to your computer's LAN IP and run
the API with `--host 0.0.0.0`. On a physical phone, localhost means the phone,
not your PC. Browser previews on the same computer can use `127.0.0.1`.
Campus isolation can prevent local access. Browser origins must match
`TIBBY_CORS_ORIGINS`; native apps do not require CORS. Do not put a model key
in the phone build.

Confirm a sample patient after startup. Typed conversation questions do not
require BLE. Real voice needs the native app, a populated mic and Navigator
configured on the server. Errors are shown rather than silently falling back.
A developer can explicitly build the offline UI using
`EXPO_PUBLIC_DEMO_MODE=true`; this is not a user-facing server choice.

## Request contract

| Endpoint | Behavior |
| --- | --- |
| `GET /health` | Provider/mode and process health; not a live UF connectivity check |
| `POST /v1/sessions` | Opens a one-hour synthetic-data session |
| `DELETE /v1/sessions/current` | Revokes the session, including pending replies |
| `GET /v1/encounters` | Returns the synthetic roster |
| `PUT /v1/encounters/active` | Selects/clears an encounter and rotates its token |
| `POST /v1/ask` | Record query, or conversation follow-up with `scope: "conversation"` |
| `POST /v1/audio/check` | Validates base64 WAV and acknowledges duration/bytes; no transcription or model call |
| `POST /v1/ask/audio` | Validates WAV, transcribes with Navigator, queries fixture |
| `POST /v1/ask/audio/base64` | WAV transcription plus conversation reply, using JSON `{context, audioBase64}` |
| `GET /v1/conversation` | Returns the active patient's latest 40 messages in this session |

All `/v1` routes except session creation require `Authorization: Bearer SESSION_TOKEN`.
A patient selection looks like:

```json
{"encounterId":"demo-encounter-01","selectionVersion":1}
```

Increment `selectionVersion` for each selection or clear. Delayed older selections
are rejected. A clear uses `encounterId: null`. A successful selection returns an
opaque `encounterToken` for the next questions. The text endpoint receives:

```json
{
  "context": {
    "requestId": 1,
    "encounterId": "demo-encounter-01",
    "contextVersion": 1,
    "encounterToken": "TOKEN_FROM_SELECTION"
  },
  "question": "What is the latest potassium?"
}
```

The response echoes `context` and contains `text`, `sources`, `synthetic: true`
and optional `transcript`, plus the actual `provider` used. Here `synthetic` refers
to the patient-record fixtures; microphone transcripts can be real test speech.
Request IDs increase within the selected context.
The server verifies the session and encounter token before and after provider
work; changed patients, expired/revoked sessions and superseded questions reject
pending replies. The client independently rejects stale answers and stops speech.
`contextVersion` is a client correlation value, not server authorization.

## Optional NaviGator integration

In the backend's ignored `.env`:

```text
TIBBY_PROVIDER=navigator
NAVIGATOR_TOOLKIT_API_KEY=your-team-key
NAVIGATOR_CHAT_MODEL=a-model-your-key-can-access
NAVIGATOR_STT_MODEL=whisper-large-v3
```

Restart the server. The text provider calls UF's chat-completion endpoint to select
an allowlisted query (`latest_potassium` or `unsupported`). The model never supplies
the lab value: synthetic records and fixed templates provide values, units and
source details. Unsupported/invalid output cannot turn into an arbitrary record
query. Changing provider does not make the fixtures real patient records.

The audio endpoint accepts the WAV bytes directly with `Content-Type: audio/wav`.
Put the same context JSON in the `X-Tibby-Context` header, not the URL. Uploads must
be non-empty mono, 16-bit PCM at 16 kHz, at most 60 seconds. Empty/zero-signal,
truncated, wrong-format and oversized inputs are rejected before transcription.
The transcription endpoints in default demo mode return 503 rather than a fake
transcript. The app instead uses `/v1/audio/check` when session creation reports
`audioMode: "check"`. This validates actual audio and returns a receipt labelled
`provider: "connection-test"`, with no transcript. History uses `wearable-check`
for these entries so they are never presented as captured words. NaviGator
sessions report `audioMode: "transcription"` and use the transcription endpoint.
The phone BLE adapter uses the base64 JSON endpoint for WAV uploads. Real Bluetooth
operation still needs physical-phone validation. This endpoint defaults to
conversation replies. Set `scope: "record"` for the separate synthetic record-query
test. The original raw-WAV endpoint retains its record-query behavior.

## Conversation follow-ups

The phone sends typed follow-ups to `/v1/ask` with `scope: "conversation"`.
In Navigator mode this calls the model with the active patient's retained session
conversation. It is no longer limited to classifying the sample potassium query.
Replies are instructed to use conversation evidence, distinguish typed questions
from wearable transcripts, and avoid identifying a speaker or inventing records.
This does not implement speaker recognition or verify transcript accuracy.

Successful text/audio requests append a user input and assistant reply, labelled
`inputKind: "typed"` or `"wearable"`. `GET /v1/conversation` returns the current
patient's history. Histories are isolated per session and patient, capped at 40
messages each, and held only in process memory. End/expiry/restart discards access.
Raw audio is not retained. Model requests use at most the latest 20 history messages.
Failed/cancelled work may not appear in history: this is not a durable audit log.

In demo mode, conversation follow-ups replay the most recent wearable transcript
or say none exists; they do not call an LLM. Session creation reports `provider`
and configured model, but successful connectivity is established only by an actual
request. No live UF access has been tested without the team's credentials.

Credentials are never sent to the phone or exposed in upstream error messages.
Live UF access, model permissions and off-campus reachability still need testing
with the team's key. Tests use mocked upstream responses and incur no model usage.
Official references: [UF text API](https://docs.ai.it.ufl.edu/docs/navigator_toolkit/capabilities/text_generation/)
and [UF transcription API](https://docs.ai.it.ufl.edu/docs/navigator_toolkit/capabilities/speech_to_text/).

## Playback

This version returns text and sources; `expo-speech` generates speech on the phone
and uses its current output (speaker/headphones). The backend never plays through
the PC. Server-generated speech/audio streaming can be added to the contract later.
The existing desktop `tibby_fw_central.py` is unchanged and is not this API server.

## Tests and remaining work

```sh
.venv/bin/python -m pytest -q
```

Tests cover API auth requirements, session expiry/revocation, cross-session and
changed-patient context, delayed responses during selection changes, replay
rejection, WAV validation, the transcription pipeline and mocked UF calls.

Still needed: real BLE transport, real clinician/device authentication, encounter
expiry rules for the study, actual record access, draft review/storage, production
hosting and physical Android/iPhone testing. The anonymous demo-session route and
in-memory store are for synthetic-data development only.
