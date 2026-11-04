import assert from 'node:assert/strict';
import test from 'node:test';
import { createWebWearable } from '../src/services/webBluetooth.ts';
import type { WebDevice } from '../src/services/webBluetooth.ts';
import { pcmToWav } from '../src/services/audio.ts';

function setup() {
  let starts = 0; let stops = 0;
  const microphone = Object.assign(new EventTarget(), {
    properties: { notify: true }, value: undefined as DataView | undefined,
    async startNotifications() { starts++; return this; },
    async stopNotifications() { stops++; return this; },
  });
  const device = Object.assign(new EventTarget(), {
    id: 'test-board', name: 'TIBBY_peripheral',
    gatt: {
      connected: false,
      async connect() { this.connected = true; return {
        async getPrimaryService(uuid: string) {
          assert.equal(uuid, '0000180d-0000-1000-8000-00805f9b34fb');
          return { async getCharacteristic(uuid: string) {
            assert.equal(uuid, '00002a37-0000-1000-8000-00805f9b34fb');return microphone;
          } };
        },
      }; },
      disconnect() { this.connected = false; device.dispatchEvent(new Event('gattserverdisconnected')); },
    },
  });
  const wearable = createWebWearable({ async requestDevice(options) {
    assert.deepEqual(options.filters, [{ name: 'TIBBY_peripheral' }]);
    assert.deepEqual(options.optionalServices, ['0000180d-0000-1000-8000-00805f9b34fb']);
    return device;
  } }, pcmToWav);
  const send = (value: DataView) => { microphone.value = value;microphone.dispatchEvent(new Event('characteristicvaluechanged')); };
  return { wearable, microphone, device, send, starts: () => starts, stops: () => stops };
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test('web chooser uses firmware identity; notification copies preserve DataView offset and PCM', async () => {
  const f = setup();assert.equal(f.wearable.available, true);
  const [device] = await f.wearable.scan();await f.wearable.connect(device.id, () => assert.fail('Unexpected disconnect'));
  let wav: Uint8Array | undefined;const progress: number[] = [];
  const recording = f.wearable.capture({ complete: (value) => { wav = value; }, error: assert.ifError, progress: (value) => progress.push(value) });
  await flush();assert.equal(f.starts(), 1);
  const buffer = new Uint8Array([99, 99, 0, 128, 255, 127, 99]);
  f.send(new DataView(buffer.buffer, 2, 4));buffer.fill(0);
  recording.stop();await flush();assert.equal(f.stops(), 1);
  assert.ok(wav);assert.deepEqual(wav.slice(44), new Uint8Array([0, 128, 255, 127]));
  assert.deepEqual(progress, [4 / 32000]);await f.wearable.destroy();
});

test('cancel before notifications start prevents late callbacks', async () => {
  const f = setup();await f.wearable.scan();await f.wearable.connect(f.device.id, () => {});
  const capture = f.wearable.capture({ complete: () => assert.fail('Cancelled capture completed'), error: () => assert.fail('Cancelled capture failed'), progress: () => assert.fail('Late sample accepted') });
  capture.cancel();await flush();assert.equal(f.starts(), 0);
  f.send(new DataView(new ArrayBuffer(4)));await f.wearable.destroy();
});

test('disconnect cancels recording and notifies once; malformed notification is rejected', async () => {
  const f = setup();let disconnects = 0;await f.wearable.scan();await f.wearable.connect(f.device.id, () => disconnects++);
  let errors = 0;
  f.wearable.capture({ complete: () => assert.fail('Malformed capture completed'), error: () => errors++, progress() {} });
  await flush();f.send(new DataView(new ArrayBuffer(3)));assert.equal(errors, 1);
  f.wearable.capture({ complete: () => assert.fail('Disconnected capture completed'), error: assert.ifError, progress() {} });
  await flush();f.device.gatt.disconnect();assert.equal(disconnects, 1);
  assert.throws(() => f.wearable.capture({ complete() {}, error() {}, progress() {} }), /Connect/);
  await f.wearable.destroy();assert.equal(disconnects, 1);
});

test('pending chooser cannot resurrect a destroyed connection', async () => {
  const f = setup();let choose!: (value: WebDevice) => void;
  const wearable = createWebWearable({ requestDevice: () => new Promise((resolve) => { choose = resolve; }) }, pcmToWav);
  const selection = wearable.scan();await wearable.destroy();choose(f.device);
  await assert.rejects(selection, /cancelled/);
  await assert.rejects(wearable.connect(f.device.id, () => {}), /Choose/);
});

test('unsupported browser reports unavailable rather than simulating discovery', async () => {
  const wearable = createWebWearable(undefined, pcmToWav);
  assert.equal(wearable.available, false);await assert.rejects(wearable.scan(), /Bluefy/);
});
