# Share TIBBY for a home demo

The prototype now opens a demo conversation automatically. It has no patient
selection/confirmation screen. Each app session still gets its own server token
and conversation history. This is a synthetic demo, not real patient selection.
The Backend panel and manual End session button are removed; use New conversation
in chat history to start fresh. Connection setup and cleanup are automatic.

## Simplest iPhone demo for now

Open **https://tibby-app.onrender.com** in Safari. Use Share > Add to Home Screen
(and Open as Web App if offered) for an app-like entry. No Expo Go, Apple developer
membership, or running developer computer is needed for this hosted web demo.
The website provides a home-screen icon and standalone display metadata. It still
needs internet; no offline caching or background recording has been added.

Step headings have an arrow to show or hide instructions. They start collapsed;
connection state, errors, actions, and replies remain visible. The interface uses
a restrained navy/teal palette and the phone's system font.

The web version can demonstrate the backend, typed chat, and speech playback.
Safari cannot connect to the PCB. For an experimental website-to-PCB test, use
Bluefy as described below. The web version cannot detect the phone's headphone route. Pair headphones in phone settings and use Test audio.
The current backend returns demo replies; live AI/transcription is not configured.

Expo Go is an optional developer preview, not a simpler sharing route: it needs
Expo development setup and does not include our BLE or audio-route native modules.
For PCB testing, use Bluefy with the web adapter, the installed Android build,
or a signed iPhone build.
The existing Android APK predates this theme; rebuild it to include these changes.

## Choose what they will test

| Version | Tester needs | Can test |
| --- | --- | --- |
| Android preview APK | Physical Android phone; install the TIBBY APK | Backend, chat, phone/headphone playback, PCB BLE when the board is nearby |
| iPhone internal build / TestFlight | Signed iPhone build; appropriate Apple account/provisioning | Same phone features after iOS validation |
| Hosted web app | Website URL and a browser | Backend, typed chat and speech playback; BLE requires a Web Bluetooth browser such as Bluefy, not Safari |

Most planned testers use iPhone. See [iPhone setup](IOS_SETUP.md): the team needs
Apple signing/distribution access before an installable iPhone build can be shared.
No iPhone installer exists yet. The website remains available in Safari.

Neither a standalone preview APK nor a hosted website requires the developer's
computer to remain on. Expo Go is not the install path for the native BLE app.
Expo Build compiles the phone app; it does not relay runtime conversations.
The installed app talks directly to the shared Render backend over the internet.
For a BLE test, the tester must have the powered PCB within range of their phone.

## Try the PCB on iPhone through Bluefy

Bluefy is a third-party iPhone browser with Web Bluetooth support. The website's
Web Bluetooth adapter uses the same firmware name, service/characteristic UUIDs,
and 16 kHz mono 16-bit PCM format as the native adapter. No Apple Developer
membership or custom TIBBY installation is needed for this experiment.

1. Install [Bluefy – Web BLE Browser by PNN SOFT](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055).
2. Turn on Bluetooth, power the PCB running the microphone/BLE firmware, and keep
   it nearby. Disconnect other apps/computers that are using the board.
3. **Inside Bluefy**, open https://tibby-app.onrender.com over HTTPS. Allow Bluefy
   Bluetooth access when asked. Safari and a Safari Home Screen shortcut do not
   provide this bridge.
4. Tap **Scan for TIBBY**, choose **TIBBY_peripheral** in the browser's picker,
   then tap the **Connect** button shown in the page. Wait for Connected.
5. Use **Test wearable audio round trip**, speak for a few seconds, then choose
   **Stop recording and send**. A successful receipt confirms recorded WAV data
   reached the server; in demo mode it does not transcribe or call AI.
6. Pair headphones in iPhone settings, use **Test audio**, and play the response.
   Check audibility yourself: the web page cannot verify the output route.

Keep Bluefy open and the phone unlocked. Capture is limited to 30 seconds. The
browser chooser selects one device; it is not a background scanner. If permission
was denied, enable Bluefy Bluetooth access in iPhone settings and reload. If no
board is listed, check its power, advertising name, firmware and other connections.

Validation so far covers protocol/lifecycle tests and simulated browser BLE
notifications sent to the real hosted audio-check API. Physical Bluefy/PCB audio
throughput, completeness, sound quality and playback remain unverified. A receipt
proves received bytes, not that no BLE packets were lost. Native builds remain
available if the browser bridge does not sustain the required microphone stream.

References: [Bluefy publisher](https://pnnsoft.com/portfolio/detail/bluefy-web-bluetooth-api-solution-for-ios-devices),
[Web Bluetooth device selection](https://developer.mozilla.org/en-US/docs/Web/API/Bluetooth/requestDevice).

## Host the web interface on Render

The website has been created at **https://tibby-app.onrender.com**. Keep using
this existing site; the creation instructions below are for setting up another
deployment. The actual public site and backend passed a browser test on November
4, 2026: automatic session setup, no patient picker, typed demo reply, visible
playback controls, history and session cleanup. No local server or API request
interception was used. Physical audibility and BLE were not tested.

The existing backend remains `https://tibby-backend-9le6.onrender.com`.
Create a separate **Static Site** for the frontend. The website then has its own
shareable HTTPS address. You do not need to run Expo/Metro on your computer.

In Render choose **New > Static Site**, connect `ufungii/tibby-companion`, and use:

| Field | Value |
| --- | --- |
| Branch | `main` |
| Name | `tibby-companion-web` (Render assigns the actual hostname) |
| Root directory | `tibby_app` |
| Build command | `npm ci && npm run build:web` |
| Publish directory | `dist` |
| Environment | `NODE_VERSION=24` |

The shared backend URL is built into `src/config.ts`. Leave
`EXPO_PUBLIC_DEMO_MODE` unset or `false`; setting it to `true` would bypass the
backend and use an offline UI demo instead.

In the static site's Redirects/Rewrites settings add:

| Source | Destination | Action |
| --- | --- | --- |
| `/*` | `/index.html` | Rewrite |

Alternatively, create **New > Blueprint** using `render-web.yaml` as the Blueprint
path. It defines only the static site, with the same build settings and rewrite.
It does not create a second backend. Choose one creation method.

### Allow the website to call the backend

The backend defaults now allow `https://tibby-app.onrender.com` and local port-8081
previews. Deploy the current backend commit to apply those defaults. An explicit
`TIBBY_CORS_ORIGINS` environment variable overrides them; if it exists, include
the website's exact origin there, preserving the local origins:

```text
https://tibby-app.onrender.com,http://localhost:8081,http://127.0.0.1:8081
```

Do not add a trailing slash or path. Save/redeploy the backend, then reload the
website. Editing the hosted environment requires the
hosting account owner unless the Render integration has been connected.
The native app is not subject to browser CORS.

Verify automatic startup, type a question, inspect the reply and use Test audio /
Play / replay response. Then share the website URL. The backend's primary URL is
an API address; it does not currently serve the frontend website.

## Share a phone build

The Android preview compiled successfully:
[install/build page](https://expo.dev/accounts/wnhdkk/projects/tibby-companion/builds/548fafdf-691c-4fd3-941b-77be0f766f40).
It contains the simplified startup from source commit `32554af`. Installation,
physical BLE capture and headphone routing still require checks on a phone.

Use the **preview** profile in `tibby_app/eas.json`. Its Android artifact is an APK
with embedded JavaScript and the shared backend address:

```sh
npx eas-cli@latest build --profile preview --platform android
```

Give testers the completed build's installation link. They install TIBBY, allow
Bluetooth access, pair headphones in phone settings, use Test audio, and scan for
the nearby PCB. A development-client build normally needs Metro; a preview build
does not. Rebuild the preview after app changes before sharing the updated UI.
An Android APK cannot be installed on iPhone. iOS distribution requires its own
signed build and Apple setup (registered devices for ad hoc builds, or TestFlight).

The current backend is in demo mode: recording checks acknowledge duration/bytes;
they do not transcribe speech or generate model answers. NaviGator configuration
is a separate server step. Both hosted versions use the same temporary,
session-only backend storage. Free backend instances can sleep when idle.

References: [Render static sites](https://render.com/docs/static-sites),
[Expo web publishing](https://docs.expo.dev/guides/publishing-websites/),
[Expo internal distribution](https://docs.expo.dev/build/internal-distribution/).
