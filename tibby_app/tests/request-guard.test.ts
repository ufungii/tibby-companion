import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequestGuard } from '../src/domain.ts';

test('patient switch rejects an answer that arrives after the switch', () => {
  const guard = createRequestGuard();
  guard.setEncounter('patient-a');
  const oldRequest = guard.begin();
  guard.setEncounter('patient-b');
  const current = guard.begin();
  assert.equal(guard.accepts(oldRequest), false);
  assert.equal(guard.accepts(current), true);
});

test('switching away and back cannot revive a previous encounter response', () => {
  const guard = createRequestGuard();
  guard.setEncounter('patient-a');
  const oldRequest = guard.begin();
  guard.setEncounter('patient-b');
  guard.setEncounter('patient-a');
  guard.begin();
  assert.equal(guard.accepts(oldRequest), false);
});

test('cancel or a newer question invalidates an outstanding response', () => {
  const guard = createRequestGuard();
  guard.setEncounter('patient-a');
  const first = guard.begin();
  const second = guard.begin();
  assert.equal(guard.accepts(first), false);
  assert.equal(guard.accepts(second), true);
  guard.cancel();
  assert.equal(guard.accepts(second), false);
});

test('requests require confirmed context and all response fields must match', () => {
  const guard = createRequestGuard();
  assert.throws(() => guard.begin(), /Confirm a patient/);
  guard.setEncounter('patient-a');
  const current = guard.begin();
  assert.equal(guard.accepts({ ...current, encounterId: 'patient-b' }), false);
  assert.equal(guard.accepts({ ...current, contextVersion: current.contextVersion + 1 }), false);
  guard.setEncounter(null);
  assert.equal(guard.accepts(current), false);
  assert.throws(() => guard.begin());
});

test('a server-issued token must match before displaying or playing an answer', () => {
  const guard = createRequestGuard();
  guard.setEncounter('patient-a', 'token-1');
  const request = guard.begin();
  assert.equal(guard.accepts({ ...request, encounterToken: 'token-2' }), false);
  assert.equal(guard.accepts(request), true);
});
