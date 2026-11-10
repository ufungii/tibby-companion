# TIBBY phone companion

The phone connects to the wearable over BLE and to a Python backend over HTTP(S).
These are separate connections. BLE connection is not clinician authentication,
backend login, or proof of device identity. This development version still uses
anonymous demo sessions and a synthetic patient roster.

```text
PCB microphone -> ESP32-S3 -> BLE -> phone -> Python backend -> transcription / Navigator
                                    phone <- transcript + reply + sources
                                    phone -> speech -> phone speaker / paired headphones
```

The UI is organized around backend/model connection, wearable connection, audio
output and conversation review. There are no simulated device-connection buttons.
It displays received transcripts, typed phone questions, replies, and sources.
The **Chat history** section shows those messages. The **Ask about chat history**
text box sends follow-ups using the session's retained conversation as context.
Startup automatically selects the API's synthetic demo fixture internally; the
patient picker and confirmation UI are temporarily removed. Typed follow-ups work
without a connected wearable once automatic session setup succeeds.

## Start the backend and connect the app

The app opens a session automatically with the shared prototype server at
`https://tibby-backend-9le6.onrender.com`, defined in `src/config.ts`.
Users do not enter a backend URL or choose a host. Developers can override the
address in the app build environment:

```text
EXPO_PUBLIC_BACKEND_URL=https://tibby-backend-9le6.onrender.com
EXPO_PUBLIC_DEMO_MODE=false
```

See [shared deployment setup](../tibby_backend/DEPLOYMENT.md). A failed request
reports the service error; it never silently enters an offline demo. Reload/rebuild
after changing build configuration. API keys stay on the server, never in
`EXPO_PUBLIC_*` variables.

For local development only, the same build setting can point at a reachable PC
running the backend (`http://YOUR_PC_LAN_IP:8000`). A browser on that computer can
use `http://127.0.0.1:8000`; a physical phone cannot. No address form is shown to
users in either build. Campus client isolation can prevent local PC access.
The host's CORS setting must match browser preview origins; native apps do not
require CORS.

An explicit `EXPO_PUBLIC_DEMO_MODE=true` build supports offline UI development.
It is labelled demo mode and makes no server or LLM calls. This is a developer
build setting, not a choice users must make each time they open the app.

The normal flow is: open app -> demo conversation starts -> connect wearable ->
record or ask a question. Service failures show an error and Retry.
New conversation clears chat/context and automatically starts a fresh session
at the same shared service, without disconnecting the wearable. The technical
Backend panel is removed; setup status and Retry remain visible when needed.

## Build for real BLE (Android and iPhone)

Node.js 24 and npm are required. This app uses `react-native-ble-plx` with an Expo
config plugin and a development client for native builds. **Expo Go and Safari
cannot connect to the wearable.** The web adapter now uses Web Bluetooth where
available (including Bluefy on iPhone and Chrome on Android). Physical browser
BLE/audio testing is still pending; see [Bluefy setup](../HOME_DEMO.md#try-the-pcb-on-iphone-through-bluefy).

```sh
npm ci
# Android, with Android SDK/emulator or a connected Android phone:
npx expo run:android
# iPhone, on macOS with Xcode and an attached device:
npx expo run:ios --device
```

An EAS development build is another option after the team configures its Expo
project and Apple/Android signing:

```sh
npx eas-cli@latest build --profile development --platform android
# or --platform ios
npm start
```

`eas.json` contains development and internal preview profiles. Preview Android
builds produce an APK with embedded JavaScript, suitable for another tester
without a Metro server. Configure the shared backend URL in the Expo preview
environment first. See [the demo walkthrough](../DEMO_TEST.md).
The app identifiers currently use `org.tibby.companion`. Local iOS builds require
macOS/Xcode. Physical Android/iPhone validation is still required for this Expo
SDK, the BLE library, permissions, throughput and headphone audio routing.

The `testflight` profile prepares a store-distribution iOS build. Signing and
submission need Apple Developer/App Store Connect access; see [iPhone setup](../IOS_SETUP.md).

## Connect and chat

1. Power the PCB running the BLE peripheral firmware and allow Bluetooth permissions.
2. Tap **Scan for TIBBY**, choose `TIBBY_peripheral`, and connect. Scanning lasts
   six seconds. No bonding/device identity verification is implemented.
3. Use **Test audio** in Audio output to check phone/headphone playback.
4. In Chat history, type a question and tap **Ask question**. Review the latest
   response or use **Play / replay response** for phone TTS.

The wearable recording and audio round-trip test panel has been removed. Wearable
connection controls remain available, but the screen no longer captures or uploads
microphone audio. The underlying audio adapters and backend API remain available
for future integration.

Cancelling, starting a new conversation, disconnecting or backgrounding invalidates
pending answers. The app requests foreground BLE support only. Android 12+ requests
scan/connect; older Android uses location permission as required for BLE discovery.

## Conversation and playback

The backend stores the latest 40 messages in memory until the one-hour session
ends/expires or the process restarts. The temporary UI uses one synthetic fixture
per session. The API retains its context tokens and isolated histories; removing
the picker does not bypass that contract. This is not durable audio storage or an
audit log. Raw audio is not saved.

A wearable transcript describes what the microphone captured; it does **not** prove
who spoke. No speaker recognition/diarization is implemented. The conversation LLM
uses only that patient's retained transcript/questions/replies. It does not gain
access to a medical record by being connected to the app.

Replies are generated as speech by `expo-speech` on the phone. Pair headphones
with the phone in system settings. The Audio output section includes Test audio
and a listening confirmation. The local Expo module in `modules/tibby-audio-output`
reports iOS's current AVAudioSession output; playback uses that app audio session.
Android reports connected outputs and, on Android 13+, the system's anticipated
media route. That is labelled **not verified for speech** because the TTS engine
owns its playback track. Older Android/browser/older builds without the module
show **Output not verified**. No device is invented and no headphone route is
forced. Physical route/audibility testing is still required. Output changes reset
the listening confirmation; detected headphone removal stops active playback.
Browser preview plays on the computer and cannot detect its headphone route.

Question and response status is shown in Chat history above the latest answer. Sending means
request preparation/dispatch, not a verified completed upload. Waiting includes
upload and server processing. Playing is shown only after speech's start callback.
This is request/response behavior, not streamed speech or token delivery.

## Validation

```sh
npm run typecheck
npm run lint
npm test
npx expo export --platform all
npx expo config --type introspect
```

Exports check JavaScript/Hermes bundling, and introspection checks generated native
configuration. They do not prove native compilation or a successful BLE connection.
Use physical devices for that. Tests cover HTTP/context isolation, cancellation
and WAV construction; they do not simulate the physical Bluetooth radio.

Dependency advisories remain in the Expo/native development dependency graph.
Review `npm audit` before deployment; avoid forcing an incompatible Expo downgrade.
Real clinician/device authentication, patient records, draft review/sign-off,
production hosting and background operation remain separate milestones.

References: [BLE library setup](https://github.com/dotintent/react-native-ble-plx),
[Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/).
