import { pcmToWav } from './audio.ts';

/** Convert the actual device sample rate to the backend's 16 kHz mono PCM. */
export function microphoneWav(chunks: Float32Array[], sampleRate: number): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const samples = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) { samples.set(chunk, offset); offset += chunk.length; }
  const count = Math.min(480000, Math.floor(length * 16000 / sampleRate));
  const pcm = new Uint8Array(count * 2);
  const view = new DataView(pcm.buffer);
  // Average each input interval when downsampling to reduce aliasing.
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * sampleRate / 16000);
    const end = Math.min(length, Math.max(start + 1, Math.floor((i + 1) * sampleRate / 16000)));
    let value = 0;
    for (let j = start; j < end; j++) value += samples[j];
    value = Math.max(-1, Math.min(1, value / (end - start)));
    view.setInt16(i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return pcmToWav(pcm);
}
