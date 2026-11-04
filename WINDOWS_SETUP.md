# Continue development on Windows

Use PowerShell. The app, backend and deployment definition all live in this
repository; the hardware repository is separate.

For the complete required/optional software list, see
[INSTALL_CHECKLIST.md](INSTALL_CHECKLIST.md). Local Android builds need JDK 17
and Android Studio/SDK tools; cloud development builds are an alternative.

## 1. Install tools and clone

Install Git for Windows, Node.js 24 LTS, and Python 3.12 (including the Windows
Python launcher). Restart your terminal after installing them.

```powershell
git clone https://github.com/ufungii/tibby-companion.git
cd tibby-companion
node --version
npm --version
py -3.12 --version
```

This repository is private. Authenticate Git/GitHub as an account with access. If
you use GitHub CLI, run `gh auth login` and clone with
`gh repo clone ufungii/tibby-companion`. Do not put tokens in a clone URL.

## 2. Backend (terminal one)

```powershell
cd tibby_backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m uvicorn app:app --host 0.0.0.0 --port 8000
```

This uses the virtual environment directly; no PowerShell activation-policy
change is needed. Open `http://localhost:8000/health` or `/docs`. Demo mode makes
no model calls. To use Navigator, edit the ignored backend `.env`:

```text
TIBBY_PROVIDER=navigator
NAVIGATOR_TOOLKIT_API_KEY=your-team-key
NAVIGATOR_CHAT_MODEL=a-model-your-key-can-access
NAVIGATOR_STT_MODEL=whisper-large-v3
```

Restart the backend after editing it. Obtain credentials from your own secure
storage/team; they are intentionally not transferred through Git. Confirm the
key/model/audio endpoint permissions with a real request.

## 3. App/browser (terminal two, from the repository root)

```powershell
cd tibby_app
npm ci
Copy-Item .env.example .env.local
```

Edit `.env.local` for a browser on this PC:

```text
EXPO_PUBLIC_BACKEND_URL=http://127.0.0.1:8000
EXPO_PUBLIC_DEMO_MODE=false
```

```powershell
npm run web
```

The app opens its backend session automatically. Confirm a sample patient, review
**Chat history**, and use **Ask about chat history**. Demo mode reports that no
wearable speech exists rather than fabricating a recording.

To preview only the interface without running Python, use an explicit developer
setting `EXPO_PUBLIC_DEMO_MODE=true` in `.env.local`. This makes no backend/LLM calls.

For a physical phone, replace `127.0.0.1` with this PC's LAN IPv4 address (find it
with `ipconfig`). Both devices must be able to reach each other and Windows
Firewall must permit the development server on the appropriate private network.
Campus device isolation may block local access. Packaged/shared deployments use
one HTTPS host configured by the team, not user-entered PC addresses.

## 4. Real BLE on Android/iPhone

A browser or Expo Go cannot test the native BLE connection. Install the app's
custom development build on a real phone. For Android on Windows, install Android
Studio/SDK and follow the linked Expo device setup, then:

```powershell
npx expo run:android --device
```

After the development build is installed:

```powershell
npm start
```

You cannot compile an iOS app locally on Windows. Use a team-configured EAS cloud
development build, or macOS/Xcode. Apple device signing/account setup may be
required. The included `eas.json` is a starting profile, not an existing signed
build or hosted project. No cloud build is triggered by cloning this repository.

## 5. Checks

From `tibby_app`:

```powershell
npm run typecheck
npm run lint
npm test
```

From `tibby_backend`:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

The GitHub workflow also runs app/backend checks on Windows and Linux. It does
not build native apps, connect to a physical wearable or call live models.

## 6. Move between computers

Commit source changes and push them before switching computers; pull on the next
computer. Re-run `npm ci` and recreate/install the Python environment from the
lockfile. Do not copy Linux `node_modules` or `.venv` into Windows. Each computer
needs its own ignored environment files. Session/chat data is not part of Git.

For shared deployment, connect this repository to Render using the existing
`render.yaml`, or use the backend Dockerfile on a team/UF host. Configure the
assigned HTTPS address in the app build. GitHub hosting of the source code alone
does not run the backend. See [deployment instructions](tibby_backend/DEPLOYMENT.md).

## Optional hardware compatibility patch

The board firmware stays in the original team repository. `docs/firmware-compatibility.patch`
contains only the full-sample/MTU-sized notification changes made during the app
work. Apply it to a clean compatible hardware checkout after review. It has been
host-tested in isolation but still needs ESP-IDF build/board validation. It is not
a complete firmware image and does not contain PCB designs or the older PC script.

References: [Expo environment setup](https://docs.expo.dev/get-started/set-up-your-environment/),
[Python virtual environments](https://docs.python.org/3/library/venv.html).
