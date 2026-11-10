import { setAudioModeAsync } from 'expo-audio';
import { requireOptionalNativeModule } from 'expo';
import { unknownOutput } from './audioOutputTypes';
import type { AudioOutput } from './audioOutputTypes';

const native = requireOptionalNativeModule<{
  getOutput(): Promise<AudioOutput>;
  preparePlayback(): Promise<void>;
  finishPlayback(): Promise<void>;
}>('TibbyAudioOutput');

export async function readAudioOutput(): Promise<AudioOutput> {
  return native ? native.getOutput() : unknownOutput;
}
export async function prepareAudioPlayback(): Promise<void> {
  await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
  await native?.preparePlayback();
}
export async function finishAudioPlayback(): Promise<void> { await native?.finishPlayback(); }
