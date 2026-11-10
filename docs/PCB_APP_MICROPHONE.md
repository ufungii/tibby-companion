# Micless PCB + companion microphone

Firmware inspected: `https://github.com/jdados/tibby`, main commit
`08e1b3a459b9f2dc9beab9d95399f58991c60018`.

The original `tibby_fw_periph/main/main.c` configures an active-low button on
GPIO 6. Its button task only toggles `recording_active` and logs it. No button
state is sent over BLE. The separate audio task ignores that flag and streams
whenever subscribed. Therefore the original firmware cannot remotely start/stop
an app microphone without a firmware change.

## Firmware change

`firmware-app-microphone.patch` is a standalone patch against that original
commit. It is separate from `firmware-compatibility.patch`; the micless mode does
not need PCM packet splitting. Apply this patch to a clean firmware checkout:

```sh
git apply /path/to/tibby-companion/docs/firmware-app-microphone.patch
cd tibby_fw_periph
idf.py menuconfig
idf.py build
idf.py -p YOUR_BOARD_PORT flash monitor
```

Use the chip target and serial port for your actual PCB. In menuconfig,
**TIBBY audio input > Use app microphone with PCB start/stop buttons** defaults
on. This skips I2S initialization, microphone tests and board audio streaming.
No populated PCB microphone is required. The button is debounced and emits
`START\n` on the first press and `STOP` on the next press, using the existing
notify characteristic 0x2A37 under service 0x180D. Both packets fit the default
BLE MTU. Subscribe/unsubscribe/disconnect reset the button toggle to START.
Failed sends leave its state unchanged and log a warning so you can press again.
The local `tibby_backend/tibby` checkout already has the patch applied. Do not
apply it a second time there. No firmware has been flashed by this task.

## App test

1. Rebuild/install the native companion app for its added Expo Audio module and
   microphone permission, or use a compatible HTTPS Web Bluetooth browser.
2. Open the app, connect to `TIBBY_peripheral`, then enable app microphone / PCB
   controls and grant permission. Keep the app open in the foreground.
3. Press the PCB button once. Confirm the app shows recording and elapsed time.
4. Say ?What is the latest potassium?? toward the phone. Press the button again.
5. In Navigator mode with sample record retrieval selected, confirm the app shows
   those transcribed words, synthetic potassium 4.2 mmol/L and its record source.
   The reply plays automatically through the phone's selected audio output.
6. In backend demo mode, expect a labelled upload receipt only; no transcript,
   AI or retrieval runs. Configure the backend's Navigator key/chat/STT models
   to test the complete transcription/retrieval path.

The phone stops automatically at 30 seconds. If it stops or cancels before the
second PCB press, the next STOP press is harmless; press again for a new START,
or disarm/re-arm to reset the board toggle. Incoming board PCM is ignored in
this app-microphone mode. The firmware's original desktop central is not used.

Validation: app lint/typecheck, unit tests, and web/iOS/Android JS bundling.
The firmware patch passes Git whitespace and reverse-application checks.
ESP-IDF is not installed in this environment, so firmware compilation/flashing
and physical phone/PCB tests remain outstanding. Reply playback starts after
the full backend response, not during model generation. Network, transcription,
model and device speech startup latency still apply.
