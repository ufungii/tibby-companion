import { PermissionsAndroid, Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { toByteArray } from 'base64-js';
import type { BleManager, Device, Subscription } from 'react-native-ble-plx';
import { pcmToWav } from './audio';
import type { Capture, CaptureCallbacks, Wearable, WearableDevice } from './wearableTypes';

const SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
const AUDIO = '00002a37-0000-1000-8000-00805f9b34fb';

export function createWearable(): Wearable {
  let manager: BleManager | undefined;
  let device: Device | undefined;
  let connection: Subscription | undefined;
  let capture: Capture | undefined;
  let generation = 0;
  let stopScan: (() => void) | undefined;

  async function ensureManager() {
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      throw new Error('BLE is not included in Expo Go. Install the TIBBY development build on this phone.');
    }
    if (Platform.OS === 'android') {
      const permissions = Number(Platform.Version) >= 31
        ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
        : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
      const result = await PermissionsAndroid.requestMultiple(permissions);
      if (permissions.some((permission) => result[permission] !== PermissionsAndroid.RESULTS.GRANTED)) {
        throw new Error('Bluetooth permissions were denied. Allow them in phone settings.');
      }
    }
    if (!manager) {
      const { BleManager } = await import('react-native-ble-plx');
      manager = new BleManager();
    }
    const activeManager = manager;
    await new Promise<void>((resolve, reject) => {
      let subscription: Subscription | undefined;
      let settled = false;
      const timeout = setTimeout(() => { subscription?.remove(); reject(new Error('Bluetooth is unavailable. Enable Bluetooth in settings.')); }, 8000);
      subscription = activeManager.onStateChange((state) => {
        if (state === 'PoweredOn') {
          settled = true; clearTimeout(timeout); subscription?.remove(); resolve();
        } else if (state === 'PoweredOff' || state === 'Unauthorized' || state === 'Unsupported') {
          settled = true; clearTimeout(timeout); subscription?.remove(); reject(new Error(`Bluetooth state: ${state}. Check phone settings.`));
        }
      }, true);
      if (settled) subscription.remove();
    });
    return activeManager;
  }

  return {
    async scan() {
      const current = ++generation;
      const activeManager = await ensureManager();
      if (current !== generation) throw new Error('Scan cancelled.');
      return await new Promise<WearableDevice[]>((resolve, reject) => {
        const found = new Map<string, WearableDevice>();
        let ended = false;
        const finish = (error?: Error) => {
          if (ended) return;
          ended = true;
          clearTimeout(timer);
          stopScan = undefined;
          void activeManager.stopDeviceScan().catch(() => undefined);
          if (error) reject(error); else resolve([...found.values()]);
        };
        const timer = setTimeout(() => finish(), 6000);
        stopScan = () => finish(new Error('Scan cancelled.'));
        void activeManager.startDeviceScan(null, null, (error, peripheral) => {
          if (error) { finish(new Error(error.message)); return; }
          const name = peripheral?.name ?? peripheral?.localName;
          if (peripheral && name === 'TIBBY_peripheral') found.set(peripheral.id, { id: peripheral.id, name });
        }).catch((error: Error) => finish(error));
      });
    },
    async connect(id, onDisconnect) {
      const current = ++generation;
      const activeManager = await ensureManager();
      if (current !== generation) throw new Error('Connection cancelled.');
      let peripheral: Device | undefined;
      try {
        peripheral = await activeManager.connectToDevice(id, { timeout: 12000, requestMTU: 512 });
        peripheral = await peripheral.discoverAllServicesAndCharacteristics();
        const characteristics = await peripheral.characteristicsForService(SERVICE);
        if (!characteristics.some((value) => value.uuid.toLowerCase() === AUDIO && value.isNotifiable)) {
          throw new Error('Device does not expose the expected TIBBY microphone characteristic.');
        }
        if (current !== generation) throw new Error('Connection cancelled.');
        device = peripheral;
        connection = activeManager.onDeviceDisconnected(id, () => {
          if (device?.id !== id) return;
          device = undefined;
          capture?.cancel(); capture = undefined;
          onDisconnect();
        });
      } catch (error) {
        if (peripheral) await peripheral.cancelConnection().catch(() => undefined);
        throw error;
      }
    },
    async disconnect() {
      generation += 1;
      stopScan?.();
      capture?.cancel(); capture = undefined;
      connection?.remove(); connection = undefined;
      const old = device; device = undefined;
      if (old) await old.cancelConnection().catch(() => undefined);
    },
    capture(callbacks: CaptureCallbacks) {
      if (!device) throw new Error('Connect to the wearable first.');
      capture?.cancel();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      let ended = false;
      let subscription: Subscription | undefined;
      const finish = (cancelled = false, error?: Error) => {
        if (ended) return;
        ended = true; clearTimeout(timer); subscription?.remove(); capture = undefined;
        if (cancelled) return;
        if (error) { callbacks.error(error); return; }
        try {
          const pcm = new Uint8Array(bytes);
          let offset = 0;
          for (const chunk of chunks) { pcm.set(chunk, offset); offset += chunk.length; }
          callbacks.complete(pcmToWav(pcm));
        } catch (cause) { callbacks.error(cause instanceof Error ? cause : new Error('Invalid audio.')); }
      };
      const timer = setTimeout(() => finish(false, new Error('Recording timed out. Check microphone/notifications.')), 35000);
      subscription = device.monitorCharacteristicForService(SERVICE, AUDIO, (error, characteristic) => {
        if (ended) return;
        if (error) { finish(false, new Error(error.message)); return; }
        if (!characteristic?.value) return;
        try {
          const chunk = toByteArray(characteristic.value);
          if (chunk.length % 2) throw new Error('Received an incomplete PCM sample.');
          const remaining = 32000 * 30 - bytes;
          const bounded = chunk.subarray(0, remaining);
          chunks.push(bounded); bytes += bounded.length;
          callbacks.progress(bytes / 32000);
          if (bytes >= 32000 * 30) finish();
        } catch (cause) { finish(false, cause instanceof Error ? cause : new Error('Invalid notification.')); }
      });
      if (ended) subscription.remove();
      capture = { stop: () => finish(), cancel: () => finish(true) };
      return capture;
    },
    async destroy() {
      generation += 1; stopScan?.(); capture?.cancel(); connection?.remove();
      const old = device; device = undefined;
      if (old) await old.cancelConnection().catch(() => undefined);
      await manager?.destroy(); manager = undefined;
    },
  };
}
