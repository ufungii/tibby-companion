import { unknownOutput } from './audioOutputTypes';
import type { AudioOutput } from './audioOutputTypes';

export async function readAudioOutput(): Promise<AudioOutput> { return unknownOutput; }
export async function prepareAudioPlayback(): Promise<void> {}
export async function finishAudioPlayback(): Promise<void> {}
