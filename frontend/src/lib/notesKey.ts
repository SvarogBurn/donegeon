import { del, get, set } from "idb-keyval";

/**
 * The notes key this device opened with the notes passphrase (lib/noteCrypto), kept in IndexedDB so it is asked for
 * once on each device. It can be used but not read back out. Logging out forgets it. Without storage (a private
 * window) it is kept until the page is closed.
 */
export interface DeviceKey {
  /** The sealed key's id (User.notesKey.id): another one there means it is no longer the account's key. */
  id: string;
  key: CryptoKey;
}

const STORE_KEY = "donegeon.notesKey";

let kept: Promise<DeviceKey | null> | undefined;

/** The notes key this device has; null when it has none (the notes aren't encrypted, or it wasn't unlocked here). */
export function deviceKey(): Promise<DeviceKey | null> {
  // Read once, on first use: async, so a browser without IndexedDB answers null too.
  kept ??= (async () => (await get<DeviceKey>(STORE_KEY)) ?? null)().catch(() => null);
  return kept;
}

export function keepDeviceKey(deviceKey: DeviceKey) {
  kept = Promise.resolve(deviceKey);
  // Through a promise: a browser without IndexedDB throws at once.
  Promise.resolve(deviceKey).then((key) => set(STORE_KEY, key)).catch(() => {});
}

export function forgetDeviceKey() {
  kept = Promise.resolve(null);
  Promise.resolve(STORE_KEY).then(del).catch(() => {});
}
