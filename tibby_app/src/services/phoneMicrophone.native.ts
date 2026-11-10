import { requireNativeModule } from 'expo';
import type { NativeAudioModule } from 'expo-audio';
import { requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { microphoneWav } from './microphonePcm';
import type { PhoneMicrophone } from './microphoneTypes';

export function createPhoneMicrophone(): PhoneMicrophone {
  return {
    async authorize() {
      if (!(await requestRecordingPermissionsAsync()).granted) throw new Error('Allow microphone access in phone settings.');
    },
    async start(callbacks) {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      const stream = new (requireNativeModule<NativeAudioModule>('ExpoAudio').AudioStream)({ sampleRate: 16000, channels: 1, encoding: 'float32' });
      const chunks: Float32Array[] = [];
      let rate = 16000; let samples = 0; let ended = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (cancelled = false, error?: Error) => {
        if (ended) return;
        ended = true; clearTimeout(timer); subscription.remove(); stream.stop(); stream.release();
        if (cancelled) return;
        if (error) { callbacks.error(error); return; }
        try { callbacks.complete(microphoneWav(chunks, rate)); }
        catch (cause) { callbacks.error(cause instanceof Error ? cause : new Error('Microphone recording failed.')); }
      };
      const subscription = stream.addListener('audioStreamBuffer', (buffer) => {
        if (ended) return;
        if (buffer.channels !== 1 || (samples && buffer.sampleRate !== rate)) {
          finish(false, new Error('Microphone format changed. Please record again.')); return;
        }
        rate = buffer.sampleRate;
        const chunk = new Float32Array(buffer.data).slice(0, Math.max(0, rate * 30 - samples));
        chunks.push(chunk); samples += chunk.length;
        callbacks.progress(samples / rate);
        if (samples >= rate * 30) finish();
      });
      try { await stream.start(); }
      catch (cause) { finish(true); throw cause; }
      timer = setTimeout(() => finish(), 30000);
      return { stop: () => finish(), cancel: () => finish(true) };
    },
  };
}
