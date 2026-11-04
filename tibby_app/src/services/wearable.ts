import { pcmToWav } from './audio';
import { createWebWearable } from './webBluetooth';
import type { WebBluetooth } from './webBluetooth';

export function createWearable() {
  const bluetooth = typeof navigator !== 'undefined' && globalThis.isSecureContext
    ? (navigator as Navigator & { bluetooth?: WebBluetooth }).bluetooth : undefined;
  return createWebWearable(bluetooth, pcmToWav);
}
