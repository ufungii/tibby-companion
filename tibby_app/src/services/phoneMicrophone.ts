import { microphoneWav } from './microphonePcm';
import type { PhoneMicrophone } from './microphoneTypes';

export function createPhoneMicrophone(): PhoneMicrophone {
  async function open() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone requires HTTPS and a supported browser.');
    return navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true } });
  }
  return {
    async authorize() {
      const stream = await open(); stream.getTracks().forEach((track) => track.stop());
      // Unlock Web Audio during the app button gesture, before PCB commands arrive.
      const context = new AudioContext(); await context.resume(); await context.close();
    },
    async start(callbacks) {
      const stream = await open();
      const context = new AudioContext();
      const chunks: Float32Array[] = [];
      let samples = 0; let ended = false;
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const mute = context.createGain(); mute.gain.value = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (cancelled = false, error?: Error) => {
        if (ended) return;
        ended = true; clearTimeout(timer); processor.onaudioprocess = null;
        source.disconnect(); processor.disconnect(); mute.disconnect();
        stream.getTracks().forEach((track) => track.stop()); void context.close();
        if (cancelled) return;
        if (error) { callbacks.error(error); return; }
        try { callbacks.complete(microphoneWav(chunks, context.sampleRate)); }
        catch (cause) { callbacks.error(cause instanceof Error ? cause : new Error('Microphone recording failed.')); }
      };
      processor.onaudioprocess = (event) => {
        if (ended) return;
        const chunk = event.inputBuffer.getChannelData(0).slice(0, Math.max(0, context.sampleRate * 30 - samples));
        chunks.push(chunk); samples += chunk.length; callbacks.progress(samples / context.sampleRate);
        if (samples >= context.sampleRate * 30) finish();
      };
      stream.getAudioTracks().forEach((track) => { track.onended = () => finish(false, new Error('Microphone disconnected.')); });
      source.connect(processor); processor.connect(mute); mute.connect(context.destination);
      try { await context.resume(); if (context.state !== 'running') throw new Error('Browser blocked microphone capture. Re-arm using the app button.'); }
      catch (cause) { finish(true); throw cause; }
      timer = setTimeout(() => finish(), 30000);
      return { stop: () => finish(), cancel: () => finish(true) };
    },
  };
}
