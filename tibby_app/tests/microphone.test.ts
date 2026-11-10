import assert from 'node:assert/strict';
import test from 'node:test';
import { microphoneWav } from '../src/services/microphonePcm.ts';
import { parsePcbControl } from '../src/services/pcbControls.ts';

test('phone 48 kHz microphone becomes exact-duration backend PCM with bounded samples', () => {
  const wav = microphoneWav([new Float32Array(24000).fill(-2), new Float32Array(24000).fill(2)], 48000);
  const view = new DataView(wav.buffer);
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(wav.length, 32044);
  assert.equal(view.getInt16(44, true), -32768);
  assert.equal(view.getInt16(wav.length - 2, true), 32767);
});
test('empty microphone audio is rejected and recording is capped at 30 seconds', () => {
  assert.throws(() => microphoneWav([], 16000));
  assert.equal(microphoneWav([new Float32Array(16000 * 31)], 16000).length, 960044);
});
test('button parser does not mistake PCM or arbitrary text for commands', () => {
  assert.equal(parsePcbControl(new Uint8Array([1, 0])), null);
  assert.equal(parsePcbControl(new TextEncoder().encode(' start\r\n')), 'start');
  assert.equal(parsePcbControl(new TextEncoder().encode('STOP')), 'stop');
  assert.equal(parsePcbControl(new TextEncoder().encode('TOGGLE')), null);
});
