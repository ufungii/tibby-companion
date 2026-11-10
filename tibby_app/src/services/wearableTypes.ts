export type WearableDevice = { id: string; name: string };
export type Capture = { stop(): void; cancel(): void };
export type CaptureCallbacks = {
  progress(seconds: number): void;
  complete(wav: Uint8Array): void;
  error(error: Error): void;
};
export interface Wearable {
  available: boolean;
  scan(): Promise<WearableDevice[]>;
  connect(id: string, onDisconnect: () => void): Promise<void>;
  disconnect(): Promise<void>;
  capture(callbacks: CaptureCallbacks): Capture;
  listenControls(onCommand: (command: "start" | "stop") => void, onError: (error: Error) => void): () => void;
  destroy(): Promise<void>;
}
