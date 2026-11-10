# TIBBY Companion

Phone app and application backend for the TIBBY wearable. This is an independent
repository prepared from the `app-prototype` working tree of the team's hardware
repository. Continue app/backend development here after cloning it on another PC.

## What is in this repository?

| Folder/file | Purpose |
| --- | --- |
| `tibby_app/` | Android/iPhone app: BLE, automatic demo conversation, chat history and follow-up questions |
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

Browser demo: **https://tibby-app.onrender.com**. The public website-to-backend
flow passed automatic setup, typed replies, history and session-cleanup checks.
It requires no locally hosted app or backend. For experimental PCB access on
iPhone without signing a custom app, open the website in Bluefy; see the
[Bluefy test steps](HOME_DEMO.md#try-the-pcb-on-iphone-through-bluefy).
Physical Bluefy/PCB validation is still pending.

- **Windows:** [Windows setup](WINDOWS_SETUP.md).
- **What to install:** [Installation checklist](INSTALL_CHECKLIST.md).
- **App/native BLE:** [App setup](tibby_app/README.md).
- **Local backend/API:** [Backend setup](tibby_backend/README.md).
- **Shared hosting:** [Deployment setup](tibby_backend/DEPLOYMENT.md).
- **First shared phone / PCB test:** [Demo walkthrough](DEMO_TEST.md).
- **Share with home testers / host the website:** [Home demo guide](HOME_DEMO.md).
- **iPhone installation and Apple account requirements:** [iOS setup](IOS_SETUP.md).

The app automatically uses the shared prototype backend at
`https://tibby-backend-9le6.onrender.com`. Users do not enter a backend address.
Developers can override it with `EXPO_PUBLIC_BACKEND_URL` for local work; model
keys belong only in the backend environment. The live demo passed session,
patient-selection, generated-WAV receipt, history-isolation and typed-reply checks
on November 4, 2026. Physical BLE, microphone quality, transcription and AI access
still need validation.

## iPhone demo with the PCB: Bluefy

This is the experimental iPhone route without signing a custom TIBBY app. Install
[Bluefy – Web BLE Browser by PNN SOFT](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055),
which supplies Web Bluetooth support to the website. No personal Apple Developer
membership is needed to use this existing browser.

1. Ensure Render's **tibby-app Static Site** has deployed the latest `main` commit.
   If necessary, choose **Manual Deploy → Deploy latest commit**. Web BLE support
   was introduced in commit `7aa679b`.
2. Enable Bluetooth on the iPhone and allow Bluefy Bluetooth access when prompted.
3. Power the PCB running the compatible microphone/BLE firmware. Keep it nearby
   and disconnect other phones or computers already connected to it.
4. **Inside Bluefy**, open **https://tibby-app.onrender.com**. Keep the browser open
   and the phone unlocked. Safari and a Safari Home Screen shortcut do not provide
   the required Web Bluetooth interface.
5. Tap **Scan for TIBBY**, select **TIBBY_peripheral** in the browser's device picker,
   then tap **Connect** in the page. Wait for the Connected status.
6. In **Chat history**, type a question and tap **Ask question**. The wearable
   recording and audio round-trip test panel has been removed.
7. Pair headphones through iPhone settings if desired. Use **Test audio**, then
   **Play / replay response** to check audibility. The website cannot verify the
   active headphone route. Expand a step's arrow for additional instructions.

Protocol tests and simulated browser BLE capture to the hosted backend passed.
**Physical Bluefy/PCB throughput, recording quality and playback remain unverified.**
The current UI does not capture or upload wearable audio. See [troubleshooting and details](HOME_DEMO.md#try-the-pcb-on-iphone-through-bluefy).

For the native iPhone app, [TestFlight setup](IOS_SETUP.md) is a separate option:
Apple Developer signing access → Expo cloud build → App Store Connect/TestFlight
→ tester installation. Testers do not each need paid developer memberships.
Expo Go does not contain TIBBY's native BLE integration.

## Enable NaviGator AI on the shared backend

For the hosted demo, add the secret only to **Render → tibby-backend Web Service
→ Environment**. These are backend runtime settings, not settings for the
`tibby-app` Static Site. Enter each name in the **Key** column and its value in
the separate **Value** column; do not put `NAME=value` together in the Key field.

| Key | Value |
| --- | --- |
| `TIBBY_PROVIDER` | `navigator` |
| `NAVIGATOR_TOOLKIT_API_KEY` | Your actual NaviGator API key |
| `NAVIGATOR_CHAT_MODEL` | Exact chat model ID allowed by that key |
| `NAVIGATOR_STT_MODEL` | `whisper-large-v3`, if allowed by that key |

Create or inspect a key in the [UF NaviGator Toolkit](https://api.ai.it.ufl.edu/ui).
Its detail page shows accessible models; use the exact API model ID rather than
a display name. See [UF's key/model instructions](https://docs.ai.it.ufl.edu/docs/navigator_toolkit/getting_started/quickstart/).

Save the settings and redeploy the **backend**, then reload the website to start
a fresh session. Test a typed chat question first; then test transcription with
a short recording through a supported BLE client. Navigator mode changes the
recording action from an audio connection check to transcription and AI replies.
Model permissions, quota and successful calls from Render still need verification;
a Live deployment or successful health check alone does not prove AI works.

Do not put the API key in GitHub, this README, chat, screenshots, the phone app,
or an `EXPO_PUBLIC_*` variable. For local backend development only, use an ignored
`tibby_backend/.env` following the [backend setup](tibby_backend/README.md).
The phone/browser does not need its own copy of the key. Keep the existing
`TIBBY_CORS_ORIGINS` setting intact. Use synthetic data/test speech; see
[deployment limitations and access controls](tibby_backend/DEPLOYMENT.md).

## Chat history

The latest response and Play / replay controls appear above history. Audio output
has a separate Test audio control and listening confirmation. Conversation
sections stay visible, with unavailable controls disabled, before backend startup.
The technical Backend panel is removed. A compact status shows connection/setup
state, Retry appears when setup fails, and New conversation resets chat while
preserving the wearable connection.
The default hosted demo can acknowledge uploaded wearable audio without a model
key; it explicitly does not transcribe or call AI. NaviGator mode enables those.

The app prepares one synthetic demo conversation automatically; there is no
patient picker or confirmation step. **Chat history** shows wearable transcripts,
phone questions and replies. **Ask about chat history** sends typed follow-ups
using the current session's conversation. BLE does not need to stay connected for
typed follow-ups. Phone speech playback is explicit.

History is in memory, limited to 40 messages per patient/session and lost on server
restart or session expiry/end. It is not permanent storage. A waveform transcript
does not establish who spoke. Real clinician/device authentication, real patient
records, durable storage and clinical deployment are not implemented.

## Development status

Local checks cover app types/lint, request/history isolation, WAV formatting,
backend API behavior, browser interaction and container startup. Android/iPhone
JavaScript bundles and native configuration were checked. The Android preview
compiled successfully on Expo Build. iOS native compilation, physical BLE/audio
and live UF model access still need validation. Existing dependency
advisories are documented in the app README. Use test patients and test speech.

The new Git history deliberately excludes the old repository's historical code,
local environment files, installed dependencies and sample recordings. Recreate
`node_modules`/`.venv` on each computer using the committed lockfiles.
