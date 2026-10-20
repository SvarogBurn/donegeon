/** Wrong passwords allowed for one username from one address before it has to wait. */
export const MAX_TRIES = 10;
/** How long the wrong tries are remembered, and so how long the wait is at most. */
export const WINDOW_MS = 15 * 60_000;
/** Kept apart from the rest so a flood of usernames can't fill the memory: the oldest are forgotten first. */
const MAX_KEPT = 10_000;

/**
 * Counts wrong passwords per username and address, to slow down guessing. Kept in this process's memory: it starts
 * again when the server does, and each process would count its own, which for one small server is enough.
 */
export class LoginLimit {
  private tries = new Map<string, { count: number; since: number }>();

  /** Minutes to wait before trying again, or 0 when a try is allowed now. */
  waitFor(key: string, now = Date.now()): number {
    const seen = this.tries.get(key);
    if (!seen || now - seen.since >= WINDOW_MS) return 0;
    return seen.count >= MAX_TRIES ? Math.ceil((seen.since + WINDOW_MS - now) / 60_000) : 0;
  }

  failed(key: string, now = Date.now()) {
    const seen = this.tries.get(key);
    if (!seen || now - seen.since >= WINDOW_MS) {
      this.tries.delete(key);
      if (this.tries.size >= MAX_KEPT) this.tries.delete(this.tries.keys().next().value!);
      this.tries.set(key, { count: 1, since: now });
    } else {
      seen.count += 1;
    }
  }

  /** The right password: the slate is clean. */
  succeeded(key: string) {
    this.tries.delete(key);
  }
}
