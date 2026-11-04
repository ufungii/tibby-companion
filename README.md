# TIBBY Companion

Phone app and application backend for the TIBBY wearable. This is an independent
repository prepared from the `app-prototype` working tree of the team's hardware
repository. Continue app/backend development here after cloning it on another PC.

## What is in this repository?

| Folder/file | Purpose |
| --- | --- |
| `tibby_app/` | Android/iPhone app: BLE, patient selection, chat history and follow-up questions |
| `tibby_backend/` | New Python/FastAPI API: sessions, audio transcription, Navigator calls and history |
| `render.yaml` | Shared backend deployment definition |
| `docs/firmware-compatibility.patch` | Small BLE packet-size fix to apply in the separate hardware repository |
| `WINDOWS_SETUP.md` | Windows/PowerShell setup and moving between computers |
| `INSTALL_CHECKLIST.md` | Required/optional installs plus the current machine audit |
| `.github/workflows/checks.yml` | Windows/Linux app and backend checks |

The original `tibby_fw_central/tibby_central.py` is a desktop program that receives
BLE audio and plays replies on a PC. It was **not modified or copied here**.
`tibby_backend/` is new application-server code for the phone workflow, rather than
a replacement silently applied to that desktop program. PCB designs and firmware
remain in the team's original repository. See [source notes](docs/SOURCE.json).

```text
Wearable microphone -> BLE -> phone app -> shared Python backend -> UF Navigator
                               phone <- transcript + answer + sources
                               phone -> speech -> phone / phone-paired headphones
```

## Start here

- **Windows:** [Windows setup](WINDOWS_SETUP.md).
- **What to install:** [Installation checklist](INSTALL_CHECKLIST.md).
- **App/native BLE:** [App setup](tibby_app/README.md).
- **Local backend/API:** [Backend setup](tibby_backend/README.md).
- **Shared hosting:** [Deployment setup](tibby_backend/DEPLOYMENT.md).
- **First shared phone / PCB test:** [Demo walkthrough](DEMO_TEST.md).

The app automatically uses the shared prototype backend at
`https://tibby-backend-9le6.onrender.com`. Users do not enter a backend address.
Developers can override it with `EXPO_PUBLIC_BACKEND_URL` for local work; model
keys belong only in the backend environment. The live demo passed session,
patient-selection, generated-WAV receipt, history-isolation and typed-reply checks
on November 4, 2026. Physical BLE, microphone quality, transcription and AI access
still need validation.

## Chat history

The latest response and Play / replay controls appear above history. Audio output
has a separate Test audio control and listening confirmation. Conversation
sections stay visible, with unavailable controls disabled, before backend startup.
The default hosted demo can acknowledge uploaded wearable audio without a model
key; it explicitly does not transcribe or call AI. NaviGator mode enables those.

Confirm a sample patient, then open **Chat history** to inspect wearable
transcripts, phone questions and replies. **Ask about chat history** sends typed
follow-ups using that patient's retained conversation. BLE does not need to stay
connected for typed follow-ups. Phone speech playback is explicit.

History is in memory, limited to 40 messages per patient/session and lost on server
restart or session expiry/end. It is not permanent storage. A waveform transcript
does not establish who spoke. Real clinician/device authentication, real patient
records, durable storage and clinical deployment are not implemented.

## Development status

Local checks cover app types/lint, request/history isolation, WAV formatting,
backend API behavior, browser interaction and container startup. Android/iPhone
JavaScript bundles and native configuration were checked. Native compilation,
physical BLE and live UF model access still need validation. Existing dependency
advisories are documented in the app README. Use test patients and test speech.

The new Git history deliberately excludes the old repository's historical code,
local environment files, installed dependencies and sample recordings. Recreate
`node_modules`/`.venv` on each computer using the committed lockfiles.
