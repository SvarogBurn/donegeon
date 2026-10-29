import { useSyncExternalStore } from "react";
import type { Feature } from "./news";
import { FEATURES } from "./newsContent";
import { readStored, writeStored } from "./storage";

// The News articles read (or dismissed from the bell) on this device, by their file's name; kept per device, as the bell's dismissals are.
const SEEN_KEY = "donegeon.newsSeen";

function readSeen(): Set<string> | null {
  try {
    const saved: unknown = JSON.parse(readStored(SEEN_KEY) ?? "null");
    return Array.isArray(saved) ? new Set(saved.filter((slug): slug is string => typeof slug === "string")) : null;
  } catch {
    return null;
  }
}

let seen = readSeen();
// The first time on a device, the articles already out are not news: only the ones that come after them are.
if (seen === null) {
  seen = new Set(FEATURES.map((feature) => feature.slug));
  writeStored(SEEN_KEY, JSON.stringify([...seen]));
}
let unseen: Feature[] = FEATURES.filter((feature) => !seen!.has(feature.slug));
const listeners = new Set<() => void>();

/** The articles not yet read on this device, the newest first: what the bell and the paper's NEW stamp tell of. */
export function useUnseenNews(): Feature[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => unseen,
  );
}

/** Marks articles read (`slugs`; all of them when left out): the News page does on opening, the bell's × for one. */
export function markNewsSeen(slugs: string[] = FEATURES.map((feature) => feature.slug)) {
  const next = new Set([...seen!, ...slugs]);
  if (next.size === seen!.size) return;
  seen = next;
  // Only the articles still out are kept.
  writeStored(SEEN_KEY, JSON.stringify(FEATURES.map((feature) => feature.slug).filter((slug) => next.has(slug))));
  unseen = FEATURES.filter((feature) => !next.has(feature.slug));
  listeners.forEach((listener) => listener());
}
