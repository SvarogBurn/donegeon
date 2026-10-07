/** How many tasks were done today when the reminder to take a break came up; null while it is not showing. */
let current: number | null = null;
const listeners = new Set<() => void>();

function set(next: number | null) {
  current = next;
  listeners.forEach((listener) => listener());
}

/**
 * Called after every tick and "done it" press with the day's count so far:
 * reminds at each multiple of `every` (the user's setting; null = no reminders).
 */
export function taskDone(doneToday: number, every: number | null) {
  if (every && doneToday > 0 && doneToday % every === 0) set(doneToday);
}

export const dismissBreak = () => set(null);
export const getBreak = () => current;
export function onBreak(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
