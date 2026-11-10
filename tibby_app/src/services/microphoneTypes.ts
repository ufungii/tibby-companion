import type { Capture, CaptureCallbacks } from './wearableTypes';
export interface PhoneMicrophone {
  authorize(): Promise<void>;
  start(callbacks: CaptureCallbacks): Promise<Capture>;
}
