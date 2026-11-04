import assert from 'node:assert/strict';
import test from 'node:test';
import { openDemoConversation } from '../src/services/demoSession.ts';

const fixture = { id: 'demo-encounter-01', patientName: 'Synthetic fixture', patientId: 'DEMO-001', dateOfBirth: '2000-01-01', room: 'Demo' };

test('demo startup prepares context/token/history before making chat available', async () => {
  const calls: string[] = [];
  const result = await openDemoConversation({
    async start() { calls.push('start'); return [fixture]; },
    async selectEncounter(id) { assert.equal(id, fixture.id); calls.push('select'); return 'demo-token'; },
    async history(id) { assert.equal(id, fixture.id); calls.push('history'); return []; },
  }, new AbortController().signal);
  assert.deepEqual(calls, ['start', 'select', 'history']);
  assert.deepEqual(result, { id: fixture.id, token: 'demo-token', history: [] });
});

test('demo startup does not automatically choose another patient/fixture', async () => {
  await assert.rejects(openDemoConversation({
    async start() { return [{ ...fixture, id: 'some-other-record' }]; },
    async selectEncounter() { assert.fail('Must not select an arbitrary record'); },
    async history() { assert.fail('Must not fetch another record'); },
  }, new AbortController().signal), /does not provide the demo conversation/);
});

test('cancelling startup stops before selection and history retrieval', async () => {
  const controller = new AbortController();
  await assert.rejects(openDemoConversation({
    async start() { controller.abort(); return [fixture]; },
    async selectEncounter() { assert.fail('Cancelled startup must not select'); },
    async history() { assert.fail('Cancelled startup must not retrieve history'); },
  }, controller.signal), /cancelled/);
});
