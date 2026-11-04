export type OutputDevice = { id: string; name: string; kind: string };
export type AudioOutput = {
  // A connected/available device is not proof of where this utterance plays.
  connected: OutputDevice[];
  route: OutputDevice[];
  evidence: 'current-route' | 'system-preference' | 'unavailable';
};
export const unknownOutput: AudioOutput = { connected: [], route: [], evidence: 'unavailable' };

export function outputIdentity(output: AudioOutput): string {
  return JSON.stringify([output.evidence,
    output.connected.map((device) => `${device.id}:${device.kind}`).sort(),
    output.route.map((device) => `${device.id}:${device.kind}`).sort()]);
}

export function describeOutput(output: AudioOutput): string {
  const names = output.route.map((device) => device.name).join(', ');
  if (!names || output.evidence === 'unavailable') return 'Output not verified';
  return output.evidence === 'current-route' ? `Current output: ${names}` : `System media output: ${names} (not verified for speech)`;
}
