/**
 * Whether the server answers. The host puts it to sleep when nobody has asked
 * it anything for a while, and waking it takes about a minute: a page left
 * open would send its next change at a server that isn't there. So nothing is
 * sent before the server is known to be awake (see `api` in api/client).
 */
export type ServerState = "up" | "waking" | "down";

export interface ServerStatus {
  state: ServerState;
  /** A change that was lost on the way, in words for the user; null when there is none to tell of. */
  failure: string | null;
}

/** An answer this recent means the server is awake; well under the time the host waits before putting it to sleep. */
const FRESH_MS = 5 * 60_000;
const PING_TIMEOUT_MS = 10_000;
/** A check quicker than this shows nothing. */
const NOTICE_AFTER_MS = 1500;
const GIVE_UP_MS = 2 * 60_000;
/** A page hidden for this long asks again when it is back: the connection may have died with the laptop's sleep. */
const AWAY_MS = 60_000;
const WAITS_MS = [1000, 2000, 3000, 5000];

let current: ServerStatus = { state: "up", failure: null };
// The page itself came from this server, unless the service worker kept it on the device: then the server may well
// be asleep, and the first request asks first, so the wait shows as "Waking the server up…" instead of a page that hangs.
let lastOk = typeof navigator !== "undefined" && navigator.serviceWorker?.controller ? 0 : Date.now();
let check: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(changes: Partial<ServerStatus>) {
  const next = { ...current, ...changes };
  if (next.state === current.state && next.failure === current.failure) return;
  current = next;
  listeners.forEach((listener) => listener());
}

/** The app itself answered just now (whatever it said). */
export function markOk() {
  lastOk = Date.now();
  // While a check runs, it is the check that says when the server is up.
  if (!check) set({ state: "up" });
}

/** The last request got no answer from the app: the next one asks first. */
export function markStale() {
  lastOk = 0;
}

/** Ends the wait between two asks early. */
let skipWait: (() => void) | null = null;
const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    skipWait = () => {
      clearTimeout(timer);
      resolve();
    };
  });

/** The app's own answer only: an error page of the host's does not count. */
async function answers() {
  try {
    const res = await fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
    if (!res.ok) return false;
    const body = await res.json().catch(() => null);
    return body?.ok === true;
  } catch {
    return false;
  }
}

async function wake() {
  const started = Date.now();
  // Until it answers, nothing before this counts: giving up must not leave the server looking awake.
  lastOk = 0;
  // After giving up, the page goes on saying so while it asks again by itself (see tryAgain for when the user asks).
  const notice = setTimeout(() => current.state === "up" && set({ state: "waking" }), NOTICE_AFTER_MS);
  try {
    for (let attempt = 0; ; attempt++) {
      if (await answers()) {
        lastOk = Date.now();
        set({ state: "up" });
        return;
      }
      const wait = WAITS_MS[Math.min(attempt, WAITS_MS.length - 1)];
      if (Date.now() - started + wait > GIVE_UP_MS) break;
      await sleep(wait);
    }
    set({ state: "down" });
    throw new Error("Can't reach the server");
  } finally {
    clearTimeout(notice);
  }
}

/**
 * Resolves once the server is awake, waking it if need be; rejects when it stays away for minutes.
 * Everyone waiting shares the one check. `force`: ask even if it answered a moment ago.
 */
export function ensureAwake(force = false): Promise<void> {
  if (check) return check;
  if (!force && Date.now() - lastOk < FRESH_MS) return Promise.resolve();
  const running = wake().finally(() => {
    if (check === running) check = null;
  });
  check = running;
  return running;
}

/** The user asking after the page gave up: that shows at once. */
export function tryAgain() {
  set({ state: "waking" });
  // A check already under way asks now, not when its wait is over.
  skipWait?.();
  void ensureAwake(true).catch(() => {});
}

export const reportFailure = (message: string) => set({ failure: message });
export const dismissFailure = () => set({ failure: null });
export const getServerStatus = () => current;
export function onServerStatus(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

if (typeof document !== "undefined") {
  // Those who wait for the check hear of its failure themselves.
  const recheck = () => void ensureAwake(true).catch(() => {});
  let hiddenAt: number | null = null;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    // Back on the page: the waking starts now, not at the first click.
    if (hiddenAt !== null && Date.now() - hiddenAt >= AWAY_MS) recheck();
    hiddenAt = null;
  });
  window.addEventListener("online", recheck);
}
