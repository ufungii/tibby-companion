import assert from 'node:assert/strict';
import test from 'node:test';
import { pcmToWav } from '../src/services/audio.ts';

test('received PCM becomes a valid 16 kHz mono 16-bit WAV without changing sample bytes', () => {
  const pcm = new Uint8Array([0x00, 0x80, 0xff, 0x7f]);
  const wav = pcmToWav(pcm);
  const header = new DataView(wav.buffer);
  assert.equal(new TextDecoder().decode(wav.slice(0, 4)), 'RIFF');
  assert.equal(header.getUint32(4, true), 40);
  assert.equal(header.getUint16(22, true), 1);
  assert.equal(header.getUint32(24, true), 16000);
  assert.equal(header.getUint16(34, true), 16);
  assert.equal(header.getUint32(40, true), pcm.length);
  assert.deepEqual(wav.slice(44), pcm);
});

test('empty, partial-sample and over-limit recordings are rejected', () => {
  assert.throws(() => pcmToWav(new Uint8Array()));
  assert.throws(() => pcmToWav(new Uint8Array(3)));
  assert.throws(() => pcmToWav(new Uint8Array(960002)));
});
