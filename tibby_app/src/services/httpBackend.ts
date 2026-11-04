import type { Answer, Encounter, RequestContext, Turn } from '../domain';
import type { TibbyBackend } from './backend';
import { fromByteArray } from 'base64-js';

type Fetch = typeof fetch;
type Json = Record<string, unknown>;

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid response from backend.');
  }
  return value as Json;
}

function string(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Invalid response from backend.');
  return value;
}

export function createHttpBackend(url: string, fetcher: Fetch = fetch): TibbyBackend {
  const baseUrl = url.replace(/\/+$/, '');
  let sessionToken: string | null = null;
  let generation = 0;
  let selectionVersion = 0;
  let modelLabel = 'Not checked';
  let supportsAudio = false;
  let audioMode: 'check' | 'transcription' = 'check';

  async function request(path: string, method: string, body?: unknown,
    signal?: AbortSignal, token: string | null = sessionToken, dispatched?: () => void): Promise<unknown> {
    const abort = new AbortController();
    const forwardAbort = () => abort.abort();
    signal?.addEventListener('abort', forwardAbort, { once: true });
    if (signal?.aborted) abort.abort();
    const timer = setTimeout(() => abort.abort(), path.includes('/audio') ? 120000 : 60000);
    try {
      const pending = fetcher(`${baseUrl}${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: abort.signal,
      });
      dispatched?.();
      const response = await pending;
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const detail = object(payload).detail;
        throw new HttpError(response.status, typeof detail === 'string' ? detail : `Backend rejected the request (${response.status}).`);
      }
      return response.status === 204 ? undefined : await response.json();
    } catch (error) {
      if (abort.signal.aborted) throw new Error(signal?.aborted ? 'Request cancelled.' : 'Backend request timed out.');
      if (error instanceof TypeError) throw new Error('Cannot reach backend. Check its address and your network connection.');
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', forwardAbort);
    }
  }

  async function submit(context: RequestContext, signal: AbortSignal, path: string, body: unknown,
    progress?: (phase: 'sending' | 'waiting') => void): Promise<Answer> {
    if (!sessionToken) throw new Error('Start a new session.');
    const currentGeneration = generation;
    const value = object(await request(path, 'POST', body, signal, sessionToken, () => progress?.('waiting')));
    const received = object(value.context);
    if (currentGeneration !== generation || signal.aborted || value.synthetic !== true ||
      received.requestId !== context.requestId || received.encounterId !== context.encounterId ||
      received.contextVersion !== context.contextVersion || received.encounterToken !== context.encounterToken ||
      !Array.isArray(value.sources)) {
      throw new Error('Response does not match the active request.');
    }
    return { context: { ...context }, text: string(value.text),
      transcript: value.transcript == null ? null : string(value.transcript),
      provider: typeof value.provider === 'string' ? value.provider : undefined,
      sources: value.sources.map((item) => {
        const source = object(item);
        return { title: string(source.title), detail: string(source.detail) };
      }) };
  }

  return {
    label: baseUrl,
    get modelLabel() { return modelLabel; },
    get supportsAudio() { return supportsAudio; },
    get audioMode() { return audioMode; },
    async start(signal) {
      if (!baseUrl) throw new Error('Service unavailable. This build has not been configured for the hosted service yet.');
      const parsed = new URL(baseUrl);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw new Error('Set EXPO_PUBLIC_BACKEND_URL to an HTTP(S) server address without credentials.');
      }
      const currentGeneration = ++generation;
      const old = sessionToken;
      sessionToken = null;
      selectionVersion = 0;
      if (old) void request('/v1/sessions/current', 'DELETE', undefined, undefined, old).catch(() => undefined);
      const result = object(await request('/v1/sessions', 'POST', undefined, signal, null));
      const token = string(result.sessionToken);
      if (result.mode !== 'synthetic') throw new Error('This prototype requires a synthetic-data backend.');
      try {
        const roster = await request('/v1/encounters', 'GET', undefined, signal, token);
        if (!Array.isArray(roster)) throw new Error('Invalid roster from backend.');
        const encounters: Encounter[] = roster.map((item) => {
          const value = object(item);
          return { id: string(value.id), patientName: string(value.patientName),
            patientId: string(value.patientId), dateOfBirth: string(value.dateOfBirth), room: string(value.room) };
        });
        if (currentGeneration !== generation || signal.aborted) throw new Error('Session was cancelled.');
        sessionToken = token;
        modelLabel = result.provider === 'navigator'
          ? `Navigator: ${typeof result.model === 'string' ? result.model : 'configured'} (configured; not yet verified)`
          : result.provider === 'demo' ? 'Demo provider — no LLM calls' : 'Model status unavailable';
        audioMode = result.audioMode === 'check' ? 'check' : 'transcription';
        supportsAudio = result.audioMode === 'check' || result.provider === 'navigator';
        return encounters;
      } catch (error) {
        void request('/v1/sessions/current', 'DELETE', undefined, undefined, token).catch(() => undefined);
        throw error;
      }
    },
    async selectEncounter(id, signal) {
      if (!sessionToken) throw new Error('Start a new session.');
      const currentGeneration = generation;
      const version = ++selectionVersion;
      const selection = object(await request('/v1/encounters/active', 'PUT', {
        encounterId: id, selectionVersion: version,
      }, signal));
      if (currentGeneration !== generation || selection.selectionVersion !== version || version !== selectionVersion) {
        throw new Error('Patient selection changed. Confirm again.');
      }
      return id === null ? undefined : string(selection.encounterToken);
    },
    async end() {
      const old = sessionToken;
      sessionToken = null;
      generation += 1;
      if (old) {
        try {
          await request('/v1/sessions/current', 'DELETE', undefined, undefined, old);
        } catch (error) {
          // Already-expired sessions need no further revocation.
          if (!(error instanceof HttpError) || error.status !== 401) throw error;
        }
      }
    },
    async ask(context: RequestContext, question, signal, progress) {
      progress?.('sending');
      return submit(context, signal, '/v1/ask', { context, question, scope: 'conversation' }, progress);
    },
    async askAudio(context, audio, signal, progress) {
      progress?.('sending');
      return submit(context, signal, audioMode === 'check' ? '/v1/audio/check' : '/v1/ask/audio/base64',
        { context, audioBase64: fromByteArray(audio) }, progress);
    },
    async history(encounterId, signal) {
      if (!sessionToken) throw new Error('Start a new session.');
      const currentGeneration = generation;
      const value = object(await request('/v1/conversation', 'GET', undefined, signal));
      if (currentGeneration !== generation || value.encounterId !== encounterId || !Array.isArray(value.messages)) {
        throw new Error('Conversation does not match the active patient.');
      }
      return value.messages.map((item): Turn => {
        const turn = object(item);
        if (!['user', 'assistant'].includes(String(turn.role)) || !['typed', 'wearable', 'wearable-check'].includes(String(turn.inputKind))) {
          throw new Error('Invalid conversation history.');
        }
        return { id: string(turn.id), role: turn.role as Turn['role'],
          inputKind: turn.inputKind as Turn['inputKind'], text: string(turn.text) };
      });
    },
  };
}
