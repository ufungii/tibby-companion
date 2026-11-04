# Installation checklist

For the TIBBY phone app and its new Python backend. Checked on November 4, 2026.
The instructions do not require installing every optional tool below.

## Minimum on a new Windows computer

| Install | Why / when |
| --- | --- |
| **Git for Windows** | Clone, pull and push this private repository. Its credential manager can handle GitHub browser login. |
| **Node.js 24 LTS** | Runs npm, Expo, the app's development server and checks. npm is included. This is the version tested by our Windows/Linux workflow. |
| **Python 3.12 + pip + Windows Python launcher** | Runs the backend locally. Enable the launcher so `py -3.12` works. Python 3.12 is the tested baseline. |
| **An editor**, such as VS Code | Recommended for editing code; not required to run commands. |
| **A browser** | Preview the interface and use GitHub/hosting dashboards. |

Official downloads: [Git for Windows](https://git-scm.com/download/win),
[Node.js](https://nodejs.org/en/download/),
[Python for Windows](https://www.python.org/downloads/windows/),
[VS Code](https://code.visualstudio.com/Download).

Then install the project dependencies, rather than downloading each library
separately:

```powershell
git clone https://github.com/ufungii/tibby-companion.git
cd tibby-companion
cd tibby_app
npm ci
cd ..\tibby_backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock
```

`npm ci` installs Expo, React Native, the BLE library, speech and app tooling.
The Python lockfile installs FastAPI, Uvicorn, httpx and backend test dependencies.
Do not copy Linux `node_modules` or `.venv` directories to Windows.

## To build Android locally and test wearable BLE

| Install/configure | Detail |
| --- | --- |
| **JDK 17** | Recommended by the Expo/React Native setup guides. Configure `JAVA_HOME` to use it for builds. Do not assume a newer installed Java is compatible. |
| **Android Studio** | Provides the SDK Manager and Android development tools. |
| **Android SDK Platform** | Install the platform version required by the Expo-generated project. |
| **Android SDK Build-Tools** | Install the version requested by that project/Gradle build. |
| **Android SDK Platform-Tools** | Includes `adb`; put `platform-tools` on PATH. |
| **Android SDK Command-line Tools** | Install through Android Studio's SDK Manager. |
| **Android phone setup** | Use a physical BLE-capable phone, enable Developer options/USB debugging and approve the computer connection. |
| **USB driver, if required** | Use the phone manufacturer's Windows driver if Windows/adb does not recognize the phone. |

Downloads: [Android Studio](https://developer.android.com/studio),
[Temurin JDK 17](https://adoptium.net/temurin/releases/?version=17).

Set `ANDROID_HOME` to the SDK directory shown in Android Studio; the usual Windows
location is `%LOCALAPPDATA%\Android\Sdk`. Add its `platform-tools` directory to
PATH. Open a fresh terminal and verify:

```powershell
java -version
adb version
adb devices
```

From `tibby_app`, build/install the development app:

```powershell
npx expo run:android --device
```

An emulator/system image is optional for interface testing. It is not a substitute
for verifying the wearable BLE link on a real phone. Follow the SDK versions
required by this project's generated native build rather than assuming the newest
Android platform is sufficient.

## Alternative: cloud development builds

You can avoid the local Android SDK/JDK build setup by using an **Expo account**
and **EAS Build** to build a custom development app in the cloud. Install that app
on your physical phone and run the JavaScript development server on your computer.
The first cloud build requires Expo project configuration and signing setup.

Run EAS CLI through `npx`; a permanent global installation is not required:

```powershell
npx eas-cli@latest login
npx eas-cli@latest build --profile development --platform android
```

For **iPhone development from Windows**, use a cloud iOS build or a Mac with Xcode.
Windows cannot compile the iOS app locally. Physical iPhone distribution requires
appropriate Apple developer/signing access and device registration. Check the
team's account before creating a build. Xcode cannot be installed on Windows.

**Expo Go is not enough for this app's native BLE integration.** The phone needs
the custom TIBBY development build. A browser/Expo Go can preview supported UI
features, but cannot validate this wearable connection. The development build is
installed on the phone, not on the ESP32.

## For backend deployment

**Render:** no additional desktop software is required for dashboard deployment.
You need a Render account with access to the GitHub repository, then use the
included `render.yaml`. A hosting account and deployment are separate from cloning
the code. The shared demo service is now at
`https://tibby-backend-9le6.onrender.com`; the app uses that address by default.

**Docker Desktop:** optional on Windows, only if you want to build/run the backend
container locally. Follow Docker's Windows prerequisites, including its supported
WSL 2/virtualization or Hyper-V setup as applicable. Docker is not needed to run
the backend in Python or use Render's native Python service.
[Docker Desktop Windows prerequisites](https://docs.docker.com/desktop/setup/install/windows-install/).

**GitHub CLI (`gh`):** optional convenience for repository login/management. Git
plus your GitHub account/browser is sufficient for ordinary source work.

**Credentials/configuration, not installations:**

- Navigator API key and permitted chat/transcription model names, stored only in
  the backend's ignored `.env` or the hosting dashboard's secrets.
- The shared HTTPS backend address in the app's build configuration. Users do not
  enter it in the interface.
- An Expo account for cloud phone builds, and Apple signing access for the iPhone
  build path. Store-publishing accounts are a later step, not required to preview
  the browser app or run a local Android development build.

## Audit of the current Linux computer

| Item | Found |
| --- | --- |
| Git | 2.55.0 |
| Node / npm | Node 26.9.0 / npm 12.0.2; Node 24 remains the tested project baseline |
| App dependencies / Expo CLI | Installed in `tibby_app/node_modules`; Expo CLI 58.1.17 |
| Backend Python | Project virtual environment uses Python 3.12.14 |
| Backend packages | Installed; FastAPI 0.162.0, Uvicorn 0.54.0, httpx 0.28.1 |
| System Python / uv | Python 3.14.7 / uv 0.12.17; backend uses its separate Python 3.12 environment |
| GitHub CLI / Docker CLI | Installed |
| Java | OpenJDK 27, not the recommended JDK 17 build setup |
| Android Studio / SDK / adb | Not found in PATH/usual install locations; SDK environment variables are unset |

Nothing essential is missing for the current browser preview and Python backend.
Before **local Android builds**, install/configure Android Studio, its SDK tools,
and JDK 17. Alternatively use a cloud development build. Aligning Node with 24 LTS
is recommended for reproducibility; the current browser bundling is working.

## About the messages in the screenshot

- **`Web Bundled`** means the browser bundle built successfully.
- **Expo 58.0.21 -> 58.0.23** is an update recommendation, not proof of a missing
  dependency. Check compatibility with `npx expo install --check`; upgrade the
  project deliberately and commit the resulting lockfile, rather than changing
  package versions independently on each computer.
- **React DevTools** is optional debugging software. It is not required to run the
  app or deploy the backend.

You do not need global Expo/React Native CLI installations, local AI model downloads,
or ESP-IDF for app/backend work. ESP-IDF belongs to the separate board-firmware
build/flash workflow if you also work on the ESP32 code.

## References and next steps

- [Windows step-by-step](WINDOWS_SETUP.md)
- [Deployment instructions](tibby_backend/DEPLOYMENT.md)
- [Expo Android/JDK setup](https://docs.expo.dev/workflow/android-studio-emulator/)
- [React Native environment setup](https://reactnative.dev/docs/set-up-your-environment)
- [Expo cloud build setup](https://docs.expo.dev/build/setup/)
- [Internal iPhone/Android distribution](https://docs.expo.dev/build/internal-distribution/)
- [Render FastAPI deployment](https://render.com/docs/deploy-fastapi)
