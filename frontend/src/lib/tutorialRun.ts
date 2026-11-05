import { useSyncExternalStore } from "react";

/**
 * Which run of the tutorial is on, kept on this device with its progress (Tutorial.tsx): "core", the short one every
 * account gets first (until User.tutorialSeen), or a chapter of "Learn Donegeon" picked from its box (steps.tsx
 * CHAPTERS). And the task the core had the user make, which the chapters go on with while it is there.
 */
export const RUN_STORE = "donegeon.tutorial";
const TASK_STORE = "donegeon.tutorialTask";
const CHANGED = "donegeon:tutorial-run";

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Without storage the run lasts as long as the page does.
  }
}

/** The progress as saved: whose, and which run (older saves have none: the core). */
export interface SavedRun {
  userId: string;
  run?: string;
}

/** The chapter running for this account, or null (none, or the core). */
export function runningChapter(userId: string): string | null {
  const saved = read<SavedRun>(RUN_STORE);
  return saved?.userId === userId && saved.run && saved.run !== "core" ? saved.run : null;
}

/** Starts a chapter from its first step, with the core's task if it is still kept. */
export function startChapter(userId: string, chapter: string) {
  const task = read<{ userId: string; taskId: string }>(TASK_STORE);
  write(RUN_STORE, { userId, run: chapter, step: 0, entered: -1, taskId: task?.userId === userId ? task.taskId : null, base: {}, known: [] });
  window.dispatchEvent(new Event(CHANGED));
}

/** A run that ended (finished, or skipped): nothing is running any more. */
export function stopRun() {
  write(RUN_STORE, null);
  window.dispatchEvent(new Event(CHANGED));
}

/** Keeps the task the core had made, for the chapters. */
export const keepTutorialTask = (userId: string, taskId: string | null) => write(TASK_STORE, taskId && { userId, taskId });

const subscribe = (onChange: () => void) => {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
};

/** The chapter running for this account, kept up to date. */
export const useRunningChapter = (userId: string | undefined) => useSyncExternalStore(subscribe, () => (userId ? runningChapter(userId) : null));
