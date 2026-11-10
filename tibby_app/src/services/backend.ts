import type { Answer, Encounter, RequestContext, Turn } from '../domain';
import { createHttpBackend } from './httpBackend';
import { SHARED_BACKEND_URL } from '../config';

// Deliberately synthetic. No patient records or model credentials are bundled.
export const demoEncounters: Encounter[] = [
  { id: 'demo-encounter-01', patientName: 'Demo patient 01', patientId: 'DEMO-001', dateOfBirth: '2000-01-01', room: 'Simulation 01' },
  { id: 'demo-encounter-02', patientName: 'Demo patient 02', patientId: 'DEMO-002', dateOfBirth: '2000-02-02', room: 'Simulation 02' },
];

export interface TibbyBackend {
  label: string;
  modelLabel: string;
  supportsAudio: boolean;
  audioMode?: 'check' | 'transcription';
  start(signal: AbortSignal): Promise<Encounter[]>;
  selectEncounter(id: string | null, signal?: AbortSignal): Promise<string | undefined>;
  end(): Promise<void>;
  ask(context: RequestContext, question: string, signal: AbortSignal, progress?: (phase: 'sending' | 'waiting') => void): Promise<Answer>;
  askAudio(context: RequestContext, audio: Uint8Array, signal: AbortSignal, progress?: (phase: 'sending' | 'waiting') => void, scope?: 'record' | 'conversation'): Promise<Answer>;
  history(encounterId: string, signal: AbortSignal): Promise<Turn[]>;
}

const demoHistory = new Map<string, Turn[]>();
let turnId = 0;

/** Replace this adapter with authenticated HTTPS calls when the server exists. */
export const demoBackend: TibbyBackend = {
  label: 'Offline demo',
  modelLabel: 'Demo provider — no LLM calls',
  supportsAudio: false,
  async start(signal) {
    if (signal.aborted) throw new Error('Request cancelled.');
    return demoEncounters;
  },
  async selectEncounter() { return undefined; },
  async end() { demoHistory.clear(); },
  async history(id) { return [...(demoHistory.get(id) ?? [])]; },
  async askAudio() { throw new Error('Wearable transcription requires a Python backend configured with Navigator.'); },
  async ask(context, question, signal, progress) {
    progress?.('waiting');
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        reject(new Error('Request cancelled.'));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort);
        resolve();
      }, 1400);
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    });

    if (!demoEncounters.some((item) => item.id === context.encounterId)) {
      throw new Error('Unknown demo encounter. Select a patient again.');
    }
    const text = 'No wearable transcript has been captured for this patient in this session. This is an offline demo; connect a Navigator backend for LLM follow-up questions.';
    const turns = demoHistory.get(context.encounterId) ?? [];
    turns.push({ id: String(++turnId), role: 'user', inputKind: 'typed', text: question },
      { id: String(++turnId), role: 'assistant', inputKind: 'typed', text });
    demoHistory.set(context.encounterId, turns.slice(-40));
    return {
      context: { ...context },
      text,
      sources: [],
      provider: 'demo',
    };
  },
};

// Team/build configuration, not an end-user setting. Never bundle model keys.
const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.trim() || SHARED_BACKEND_URL;
const demoMode = process.env.EXPO_PUBLIC_DEMO_MODE === 'true';
export const backend: TibbyBackend = demoMode ? demoBackend : createHttpBackend(backendUrl);
