# First shared phone / PCB demo

The first goal is a foreground connection test, followed by live transcription.
Render hosts the Python API. Expo builds the installable phone app. Headphones
pair to the phone through system settings; the PCB connects separately over BLE.

The shared demo backend is now `https://tibby-backend-9le6.onrender.com` and the app
uses it by default. Hosting is online; deploy the current `main` commit to enable
the recording-check endpoint. Physical PCB/headphone checks need a phone and hardware.

## 1. Create the shared backend

The existing `render.yaml` can create the service through New > Blueprint.
If you are already on Render's New Web Service form, use:

| Setting | Value |
| --- | --- |
| Repository | `ufungii/tibby-companion` |
| Branch | `main` |
| Runtime/language | Python 3 |
| Root directory | `tibby_backend` |
| Build command | `pip install -r requirements.lock` |
| Start command | `python -m uvicorn app:app --host 0.0.0.0 --port $PORT --workers 1` |
| Health check path | `/health` |
| Instance | Free for the initial test |
| Environment | `PYTHON_VERSION=3.12.14`, `TIBBY_PROVIDER=demo` |

No Postgres or Key Value instance is needed for this session-only test. A manually
created Web Service is not automatically managed by the Blueprint file. Use one
creation method, and deploy the latest reviewed `main` commit.

Open the assigned HTTPS URL plus `/health`. Expect `status: ok` and `provider:
demo`. This does not prove NaviGator access. Free services can sleep when idle;
retry startup if waking the host takes time. A restart loses current histories.

## 2. Configure and build the phone app

In `tibby_app/.env.local`, for developer previews:

```text
EXPO_PUBLIC_BACKEND_URL=https://YOUR_ACTUAL_RENDER_HOST
EXPO_PUBLIC_DEMO_MODE=false
```

The shared endpoint is already in `src/config.ts`, so no override is required
to build or run the app against that service. Use an override only for another
host. The endpoint is not a secret. Cloud build overrides can be set in the Expo
project's **preview** environment as plain-text variables. The model key never belongs
in the app or in `EXPO_PUBLIC_*` settings.

From `tibby_app`:

```sh
# Shareable Android APK with embedded JavaScript, no developer Metro server needed:
npx eas-cli@latest build --profile preview --platform android

# Developer build: includes BLE/native output support, but normally uses Metro:
npx eas-cli@latest build --profile development --platform android
npm start
```

The Expo project is linked in `app.json`. Sign into an account with access to it.
An Android APK can be installed directly on a physical Android phone. An iPhone
build uses `--platform ios` and needs Apple signing/provisioning and a registered
test device; an Android APK cannot be installed on iPhone. Expo Go and a browser
cannot test the PCB's native BLE connection. Install the TIBBY build.

A development build is useful for code changes. Give non-developer testers a
**preview build** after the shared backend URL is configured and verified. Do not
describe a development client that needs Metro as a standalone tester app.

## 3. Verify each connection on the phone

1. Open the app. Backend status should become **Session active** automatically.
   There is no server-address form.
2. Pair/select headphones in phone settings. Use **Test audio**, then confirm
   audibility with **I heard the test audio**. The app reports detected outputs
   where the OS permits it. Android's expected media route is labelled separately
   from an actual speech route; a detected device alone does not prove audibility.
3. Power the PCB running the compatible BLE microphone firmware. Allow Bluetooth
   permissions, scan for `TIBBY_peripheral`, select it, and confirm connection.
4. Select and confirm a synthetic patient. Press **Test wearable audio round trip**,
   speak near the PCB microphone, then press **Stop recording and send**.
5. Watch **Recording > Sending > Waiting for response > Response ready**. Sending
   is a brief dispatch state, not a measured upload percentage. The app cannot
   tell whether an in-flight request is uploading or processing on the server.
6. The latest response should acknowledge duration and bytes received. Press
   **Play / replay response** and verify it is audible through the selected output.
   Stop playback, replay, and repeat after switching patients.
7. Disconnect the PCB and verify the app reports it. Disconnect headphones during
   playback and verify route handling on the actual phone before the demo.

The receipt proves that the backend received a valid, nonzero-signal WAV from
the app. It does not prove intelligible speech, lossless BLE delivery, microphone
quality, device identity, or transcription. No fabricated transcript is returned.
Connection-check entries are labelled separately in history.

## 4. Enable actual speech / AI

After the connection path works, configure NaviGator on the server following
[deployment instructions](tibby_backend/DEPLOYMENT.md). Restart the backend and
start a new app session so it reloads capabilities. The recording button changes
to **Record wearable audio**. Test an actual utterance, review the returned
transcript and answer, then play the reply and ask a typed follow-up.

This requires a working team key, permitted models and reachability from the
hosting server. The demo audio receipt does not establish any of those. Use
synthetic patients and test speech. The current app cancels work when backgrounded;
keep it in the foreground for this demonstration.

## Record the result

Record phone/OS, app build link/commit, PCB firmware commit, backend URL/commit,
headphone model, each step's pass/fail and any errors. Native compilation, a
successful web bundle and browser speech mocks do not replace physical checks.

References: [Render FastAPI](https://render.com/docs/deploy-fastapi),
[Expo internal builds](https://docs.expo.dev/build/internal-distribution/).
