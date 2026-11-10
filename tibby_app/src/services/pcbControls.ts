/** Explicit button protocol; never infer button presses from PCM or silence. */
export function parsePcbControl(bytes: Uint8Array): 'start' | 'stop' | null {
  const text = String.fromCharCode(...bytes).trim().toUpperCase();
  return text === 'START' ? 'start' : text === 'STOP' ? 'stop' : null;
}
