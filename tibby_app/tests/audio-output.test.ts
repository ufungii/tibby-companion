import assert from 'node:assert/strict';
import test from 'node:test';
import { describeOutput, outputIdentity, unknownOutput } from '../src/services/audioOutputTypes.ts';

test('available headphones alone never claim speech is routed to them', () => {
  const headphones = { id: 'headphones', name: 'Test headphones', kind: 'bluetooth' };
  const available = { ...unknownOutput, connected: [headphones] };
  assert.equal(describeOutput(available), 'Output not verified');
  assert.match(describeOutput({ ...available, route: [headphones], evidence: 'system-preference' }), /not verified for speech/);
  assert.equal(describeOutput({ ...available, route: [headphones], evidence: 'current-route' }), 'Current output: Test headphones');
});

test('device removal or a route change invalidates a previous listening confirmation', () => {
  const speaker = { id: 'speaker', name: 'Phone speaker', kind: 'speaker' };
  const headphones = { id: 'headphones', name: 'Test headphones', kind: 'bluetooth' };
  const first = { connected: [speaker, headphones], route: [headphones], evidence: 'current-route' as const };
  assert.equal(outputIdentity(first), outputIdentity({ ...first, connected: [headphones, speaker] }));
  assert.notEqual(outputIdentity(first), outputIdentity({ ...first, connected: [speaker], route: [speaker] }));
  assert.notEqual(outputIdentity(first), outputIdentity({ ...first, route: [speaker] }));
});
