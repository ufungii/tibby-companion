# iPhone demo setup

The Android APK does not install on iPhone. TIBBY's native BLE and audio-output
modules require a custom iOS build; Expo Go does not contain them.

The project has iOS code and a bundle identifier (`org.tibby.companion`), but no
signed iPhone build has been produced or tested. Confirm the identifier with the
team before its first registration. iPhone BLE/audio behavior is still unverified.

## Current next step

The team has not confirmed Apple Developer Program membership, and has no Mac
available. Ask the professor/lab whether an existing university developer team
can provide membership access, signing permissions and App Store Connect access.
The normal program fee is 99 USD per year (local pricing can vary). Eligible
educational institutions can request a fee waiver; eligibility/enrollment belongs
to the organization. Do not assume university access or waiver approval exists.

An Apple Developer Program account enables cloud signing/distribution; a Mac is
not needed for the Expo cloud-build and submission route below. No Apple account
was created or enrolled and no membership was purchased as part of this work.

## Recommended: TestFlight for the professor and partner

Once the team has the required Apple access:

1. The account owner prepares the app identifier, signing access and an App Store
   Connect app record for TIBBY. Verify `org.tibby.companion` is appropriate and
   available for that team before building.
2. From `tibby_app`, sign into the Expo account that owns the linked project and
   build with the dedicated store-distribution profile:

   ```sh
   npx eas-cli@latest build --platform ios --profile testflight
   ```

   Complete the Apple signing prompts with the team account. Store distribution
   is needed for TestFlight; the ad hoc `preview` profile is a different route.
3. After the store build succeeds, submit that iOS build:

   ```sh
   npx eas-cli@latest submit --platform ios
   ```

   Select the completed store build and supply the actual App Store Connect app
   ID when prompted. The numeric App Store Connect ID is not the bundle ID.
4. In App Store Connect, configure TestFlight test information and tester groups.
   External testers may require beta review. This is beta distribution; it does
   not require a public App Store release.
5. Each tester installs Apple's **TestFlight** app on their iPhone, accepts the
   invitation and installs TIBBY. The phone then contacts the existing Render API;
   neither a developer laptop nor Expo Go is needed during the demo.
6. Verify Bluetooth permissions, PCB discovery/capture, Test audio and headphone
   playback on a physical iPhone before claiming hardware support is validated.

`eas.json` contains the `testflight` profile. It prepares the build configuration;
it does not create Apple credentials, an app record or an invitation automatically.
Submission still needs the team's signing/App Store Connect access.

## Alternative: direct install for a fixed group

With Apple Developer membership, the existing internal `preview` profile can
produce an ad hoc iOS build for registered test devices:

```sh
npx eas-cli@latest device:create
npx eas-cli@latest build --platform ios --profile preview
```

Register each iPhone using Expo's registration flow before creating its provisioning
profile/build. Only devices included in that profile can install it. New devices
require updating provisioning and a new/re-signed artifact. This route can suit a
small fixed demo group; TestFlight avoids collecting device identifiers from testers.

## What works without those accounts today?

Open **https://tibby-app.onrender.com** in Safari for the hosted interface, typed
demo responses and playback controls. Adding the website to the Home Screen does
not add TIBBY's native BLE adapter. It cannot test the PCB connection.

If a Mac becomes available, Xcode's free Personal Team signing supports limited
personal-device testing, with provisioning expiring after seven days. That is a
temporary direct-install option rather than remote TestFlight distribution.

Sources: [Apple account and Personal Team overview](https://developer.apple.com/help/account/basics/about-your-developer-account),
[Apple enrollment](https://developer.apple.com/help/account/membership/program-enrollment/),
[Educational institution fee-waiver requirements](https://developer.apple.com/help/account/membership/fee-waivers/),
[Expo iOS submission](https://docs.expo.dev/submit/ios/),
[Expo internal distribution](https://docs.expo.dev/build/internal-distribution/),
[Apple TestFlight](https://developer.apple.com/testflight/).
