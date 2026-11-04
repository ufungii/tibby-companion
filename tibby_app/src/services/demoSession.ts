import type { TibbyBackend } from './backend';

// Temporary demo setup. This selects a synthetic fixture required by the existing
// API contract; it is not automatic selection/confirmation of a real patient.
export async function openDemoConversation(
  service: Pick<TibbyBackend, 'start' | 'selectEncounter' | 'history'>,
  signal: AbortSignal,
) {
  const checkCancelled = () => { if (signal.aborted) throw new Error('Session cancelled.'); };
  const contexts = await service.start(signal);
  checkCancelled();
  const context = contexts.find((item) => item.id === 'demo-encounter-01');
  if (!context) throw new Error('The backend does not provide the demo conversation. Try again after updating the service.');
  const token = await service.selectEncounter(context.id, signal);
  checkCancelled();
  const history = await service.history(context.id, signal);
  checkCancelled();
  return { id: context.id, token, history };
}
