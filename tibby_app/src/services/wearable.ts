import type { Wearable } from './wearableTypes';

export function createWearable(): Wearable {
  const unavailable = () => { throw new Error('Wearable BLE requires the Android/iPhone development build on a physical phone. It is unavailable in the browser.'); };
  return { scan: async () => unavailable(), connect: async () => unavailable(),
    disconnect: async () => {}, capture: unavailable, destroy: async () => {} };
}
