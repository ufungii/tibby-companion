/** Firmware notifications contain little-endian 16 kHz mono signed 16-bit PCM. */
export function pcmToWav(pcm: Uint8Array): Uint8Array {
  if (!pcm.length || pcm.length % 2 || pcm.length > 16000 * 2 * 30) {
    throw new Error('Expected up to 30 seconds of complete 16-bit PCM samples.');
  }
  const result = new Uint8Array(44 + pcm.length);
  const view = new DataView(result.buffer);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) result[offset + i] = value.charCodeAt(i);
  };
  write(0, 'RIFF'); view.setUint32(4, 36 + pcm.length, true); write(8, 'WAVE');
  write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, 'data'); view.setUint32(40, pcm.length, true); result.set(pcm, 44);
  return result;
}
