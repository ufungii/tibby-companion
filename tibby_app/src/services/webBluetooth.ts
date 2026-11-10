import { parsePcbControl } from './pcbControls.ts';
import type { Capture, CaptureCallbacks, Wearable } from './wearableTypes';

const SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
const AUDIO = '00002a37-0000-1000-8000-00805f9b34fb';
// The browser owns the chooser and Bluetooth permission. These minimal interfaces
// also allow protocol/lifecycle tests without pretending to test a physical radio.
export interface WebCharacteristic extends EventTarget {
  value?: DataView;
  properties: { notify?: boolean };
  startNotifications(): Promise<WebCharacteristic>;
  stopNotifications(): Promise<WebCharacteristic>;
}
export interface WebDevice extends EventTarget {
  id: string;
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<{ getPrimaryService(uuid: string): Promise<{
      getCharacteristic(uuid: string): Promise<WebCharacteristic>;
    }> }>;
    disconnect(): void;
  };
}
export interface WebBluetooth {
  requestDevice(options: { filters: { name: string }[]; optionalServices: string[] }): Promise<WebDevice>;
}

export function createWebWearable(bluetooth: WebBluetooth | undefined,
  makeWav: (pcm: Uint8Array) => Uint8Array): Wearable {
  let selected: WebDevice | undefined;
  let microphone: WebCharacteristic | undefined;
  let capture: Capture | undefined;
  let disconnected: (() => void) | undefined;
  let stopControls: (() => void) | undefined;
  let generation = 0;
  let notifications: Promise<unknown> = Promise.resolve();
  const queue = (operation: () => Promise<unknown>) => {
    notifications = notifications.catch(() => undefined).then(operation);
    return notifications;
  };
  function release() {
    stopControls?.(); stopControls = undefined;
    capture?.cancel(); capture = undefined;
    if (selected && disconnected) selected.removeEventListener('gattserverdisconnected', disconnected);
    disconnected = undefined; microphone = undefined;
    selected?.gatt?.disconnect(); selected = undefined;
  }
  return {
    available: !!bluetooth,
    async scan() {
      if (!bluetooth) throw new Error('Open this website in Bluefy on iPhone, or a browser supporting Web Bluetooth.');
      const current = ++generation;
      release();
      // Call synchronously from the Scan button: requestDevice needs a user gesture.
      const result = await bluetooth.requestDevice({
        filters: [{ name: 'TIBBY_peripheral' }], optionalServices: [SERVICE],
      });
      if (current !== generation) throw new Error('Device selection cancelled.');
      selected = result;
      return [{ id: result.id, name: result.name ?? 'TIBBY_peripheral' }];
    },
    async connect(id, onDisconnect) {
      const target = selected;
      if (!target?.gatt || target.id !== id) throw new Error('Choose the TIBBY wearable again.');
      const current = ++generation;
      try {
        const server = await target.gatt.connect();
        const service = await server.getPrimaryService(SERVICE);
        const characteristic = await service.getCharacteristic(AUDIO);
        if (!characteristic.properties.notify) throw new Error('The wearable does not expose microphone notifications.');
        if (current !== generation) throw new Error('Connection cancelled.');
        microphone = characteristic;
        disconnected = () => {
          if (selected !== target) return;
          stopControls?.(); stopControls = undefined;
          generation += 1; capture?.cancel(); capture = undefined; microphone = undefined;
          target.removeEventListener('gattserverdisconnected', disconnected!);
          disconnected = undefined; selected = undefined; onDisconnect();
        };
        target.addEventListener('gattserverdisconnected', disconnected);
        if (!target.gatt.connected) { disconnected(); throw new Error('Wearable disconnected while connecting.'); }
      } catch (cause) {
        if (current === generation) release();
        else if (selected !== target) target.gatt.disconnect();
        throw cause;
      }
    },
    async disconnect() { generation += 1; release(); },
    capture(callbacks: CaptureCallbacks) {
      const characteristic = microphone;
      if (!characteristic || !selected?.gatt?.connected) throw new Error('Connect to the wearable first.');
      capture?.cancel();
      const chunks: Uint8Array[] = [];
      let bytes = 0; let ended = false;
      const finish = (cancelled = false, error?: Error) => {
        if (ended) return;
        ended = true; clearTimeout(timer);
        characteristic.removeEventListener('characteristicvaluechanged', receive);
        capture = undefined;
        void queue(() => characteristic.stopNotifications()).catch(() => undefined);
        if (cancelled) return;
        if (error) { callbacks.error(error); return; }
        try {
          const pcm = new Uint8Array(bytes); let offset = 0;
          for (const chunk of chunks) { pcm.set(chunk, offset); offset += chunk.length; }
          callbacks.complete(makeWav(pcm));
        } catch (cause) { callbacks.error(cause instanceof Error ? cause : new Error('Invalid audio.')); }
      };
      const receive = () => {
        if (ended || !characteristic.value) return;
        const value = characteristic.value;
        if (value.byteLength % 2) { finish(false, new Error('Received an incomplete PCM sample.')); return; }
        // Copy the exact DataView range: browser notification buffers may be reused.
        const count = Math.min(value.byteLength, 960000 - bytes);
        if (!count) return;
        chunks.push(new Uint8Array(value.buffer, value.byteOffset, count).slice()); bytes += count;
        callbacks.progress(bytes / 32000);
        if (bytes >= 960000) finish();
      };
      const timer = setTimeout(() => finish(false, new Error('Recording timed out. Check the wearable microphone.')), 35000);
      const result = { stop: () => finish(), cancel: () => finish(true) };
      capture = result;
      characteristic.addEventListener('characteristicvaluechanged', receive);
      void queue(async () => { if (!ended) await characteristic.startNotifications(); })
        .catch(() => finish(false, new Error('Could not start microphone notifications. Reconnect and try again.')));
      return result;
    },
    listenControls(onCommand, onError) {
      const characteristic = microphone;
      if (!characteristic || !selected?.gatt?.connected) throw new Error('Connect to the PCB first.');
      stopControls?.();
      let active = true;
      const receive = () => {
        const value = characteristic.value;
        if (!active || !value) return;
        const command = parsePcbControl(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
        if (command) onCommand(command);
      };
      characteristic.addEventListener('characteristicvaluechanged', receive);
      void queue(async () => { if (active) await characteristic.startNotifications(); })
        .catch(() => { if (active) onError(new Error('Could not listen for PCB buttons. Reconnect.')); });
      const stop = () => {
        active = false; characteristic.removeEventListener('characteristicvaluechanged', receive);
        void queue(() => characteristic.stopNotifications()).catch(() => undefined);
      };
      stopControls = stop;
      return stop;
    },
    async destroy() { generation += 1; release(); },
  };
}
