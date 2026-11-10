import assert from 'node:assert/strict';
import test from 'node:test';
import { createHttpBackend } from '../src/services/httpBackend.ts';

const patient = { id: 'demo-encounter-01', patientName: 'Demo patient 01',
  patientId: 'DEMO-001', dateOfBirth: '2000-01-01', room: 'Simulation 01' };

test('HTTP adapter carries session/context tokens and uses the server roster', async () => {
  const requests: { path: string; init: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const path = String(input).replace('http://test', '');
    requests.push({ path, init });
    if (path === '/v1/sessions') return Response.json({ sessionToken: 'session-token', mode: 'synthetic' });
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer session-token');
    if (path === '/v1/encounters') return Response.json([patient]);
    if (path === '/v1/encounters/active') {
      const body = JSON.parse(String(init.body));
      return Response.json({ encounterToken: 'encounter-token', selectionVersion: body.selectionVersion });
    }
    if (path === '/v1/ask') {
      const body = JSON.parse(String(init.body));
      assert.equal(body.question, 'potassium');
      return Response.json({ context: body.context, text: 'Simulated result.', sources: [], synthetic: true });
    }
    return new Response(null, { status: 204 });
  };
  const backend = createHttpBackend('http://test', fetcher);
  const signal = new AbortController().signal;
  assert.deepEqual(await backend.start(signal), [patient]);
  const token = await backend.selectEncounter(patient.id);
  assert.equal(token, 'encounter-token');
  const context = { requestId: 1, encounterId: patient.id, contextVersion: 1, encounterToken: token };
  assert.equal((await backend.ask(context, 'potassium', signal)).text, 'Simulated result.');
  await backend.end();
  assert.equal(requests.at(-1)?.path, '/v1/sessions/current');
  await assert.rejects(backend.ask(context, 'potassium', signal), /Start a new session/);
});

test('server errors are surfaced without falling back to a fabricated answer', async () => {
  const backend = createHttpBackend('http://test', async () =>
    Response.json({ detail: 'Service unavailable' }, { status: 503 }));
  await assert.rejects(backend.start(new AbortController().signal), /Service unavailable/);
});

test('HTTP adapter rejects responses belonging to a different patient context', async () => {
  const backend = createHttpBackend('http://test', async (input, init) => {
    const path = String(input);
    if (path.endsWith('/sessions')) return Response.json({ sessionToken: 'session-token', mode: 'synthetic' });
    if (path.endsWith('/encounters')) return Response.json([patient]);
    const body = JSON.parse(String(init?.body));
    return Response.json({ context: { ...body.context, encounterId: 'different-patient' },
      text: 'Must never display', sources: [], synthetic: true });
  });
  const signal = new AbortController().signal;
  await backend.start(signal);
  await assert.rejects(backend.ask({ requestId: 1, encounterId: patient.id, contextVersion: 1 }, 'potassium', signal),
    /does not match/);
});

test('HTTP adapter aborts an in-flight fetch when the caller cancels', async () => {
  const controller = new AbortController();
  const backend = createHttpBackend('http://test', async (_, init) => {
    return await new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      controller.abort();
    });
  });
  await assert.rejects(backend.start(controller.signal), /cancelled/);
});

test('wearable WAV upload uses base64 JSON and preserves the returned transcript', async () => {
  const backend = createHttpBackend('http://test', async (input, init) => {
    if (String(input).endsWith('/sessions')) return Response.json({ sessionToken: 's', mode: 'synthetic', provider: 'navigator', model: 'test-model' });
    if (String(input).endsWith('/encounters')) return Response.json([patient]);
    assert.ok(String(input).endsWith('/ask/audio/base64'));
    const body = JSON.parse(String(init?.body));
    assert.equal(body.audioBase64, Buffer.from([82, 73, 70, 70]).toString('base64'));
    return Response.json({ context: body.context, text: 'Reply', transcript: 'Captured test speech', provider: 'navigator', sources: [], synthetic: true });
  });
  const signal = new AbortController().signal;
  await backend.start(signal);
  assert.equal(backend.supportsAudio, true);
  const answer = await backend.askAudio({ requestId: 1, encounterId: patient.id, contextVersion: 1 }, new Uint8Array([82, 73, 70, 70]), signal);
  assert.equal(answer.transcript, 'Captured test speech');
});

test('history from a different active encounter is rejected', async () => {
  const backend = createHttpBackend('http://test', async (input) => {
    if (String(input).endsWith('/sessions')) return Response.json({ sessionToken: 's', mode: 'synthetic' });
    if (String(input).endsWith('/encounters')) return Response.json([patient]);
    return Response.json({ encounterId: 'another-patient', messages: [] });
  });
  const signal = new AbortController().signal;
  await backend.start(signal);
  await assert.rejects(backend.history(patient.id, signal), /does not match/);
});

test('an unconfigured build does not invent a server URL or silently enter demo mode', async () => {
  let called = false;
  const backend = createHttpBackend('', async () => { called = true; return Response.json({}); });
  await assert.rejects(backend.start(new AbortController().signal), /not been configured/);
  assert.equal(called, false);
});

test('demo audio check sends real WAV bytes and progress without claiming transcription', async () => {
  const phases: string[] = [];
  const audio = new Uint8Array([82, 73, 70, 70, 1, 2]);
  const backend = createHttpBackend('http://test', async (input, init) => {
    if (String(input).endsWith('/sessions')) return Response.json({ sessionToken: 's', mode: 'synthetic', provider: 'demo', audioMode: 'check' });
    if (String(input).endsWith('/encounters')) return Response.json([patient]);
    assert.ok(String(input).endsWith('/v1/audio/check'));
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(Buffer.from(body.audioBase64, 'base64'), Buffer.from(audio));
    return Response.json({ context: body.context, text: 'Audio received; not transcribed.', transcript: null,
      provider: 'connection-test', sources: [], synthetic: true });
  });
  const signal = new AbortController().signal;
  await backend.start(signal);
  assert.equal(backend.supportsAudio, true);
  assert.equal(backend.audioMode, 'check');
  const answer = await backend.askAudio({ requestId: 1, encounterId: patient.id, contextVersion: 1 }, audio, signal, (phase) => phases.push(phase));
  assert.deepEqual(phases, ['sending', 'waiting']);
  assert.equal(answer.transcript, null);
  assert.equal(answer.provider, 'connection-test');
});


test('audio retrieval scope reaches backend and preserves record evidence', async () => {
  const backend = createHttpBackend('http://test', async (input, init) => {
    if (String(input).endsWith('/sessions')) return Response.json({ sessionToken: 's', mode: 'synthetic', provider: 'navigator' });
    if (String(input).endsWith('/encounters')) return Response.json([patient]);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.scope, 'record');
    return Response.json({ context: body.context, text: '4.2 mmol/L', transcript: 'What is the latest potassium?',
      provider: 'navigator', synthetic: true, sources: [{ title: 'Synthetic lab', detail: 'Fixture evidence' }] });
  });
  const signal = new AbortController().signal; await backend.start(signal);
  const answer = await backend.askAudio({ requestId: 1, encounterId: patient.id, contextVersion: 1 }, new Uint8Array([1, 2]), signal, undefined, 'record');
  assert.equal(answer.sources[0].title, 'Synthetic lab');
  assert.equal(answer.transcript, 'What is the latest potassium?');
});
