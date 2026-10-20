/**
 * This device's own small memories: the tab last opened, the list last picked, notifications dismissed. Storage can
 * be full, blocked or missing (a private window): then nothing is kept, a read finds nothing, and the app goes on.
 */
export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Keeps `value` under `key`; null forgets it. */
export function writeStored(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Not kept: it is only remembered until the page is closed, or not at all.
  }
}
