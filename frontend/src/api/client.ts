import { localDate, type When } from "../lib/clock";
import { ensureAwake, markOk, markStale } from "../lib/serverStatus";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** What the host answers in the server's place; the app itself never sends these. */
const HOST_ERRORS = [502, 503, 504];
const RETRIES = 2;
const UNREACHABLE = "Can't reach the server";
const OFFLINE = "You're offline";
const NOT_SAVED = "The server didn't answer, so this wasn't saved";
const DROPPED = "The connection dropped while saving. Check whether it went through";

/** The request got no answer from the app: the server is asleep or away, or the connection is. */
export function isUnreachable(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 0 || HOST_ERRORS.includes(error.status));
}

/**
 * Waits for the server to be awake before asking (see lib/serverStatus), and asks again when the host
 * answered in its place. A change is sent again only when it certainly never arrived (502, 503): after a
 * dropped connection or a timeout (504) it may have, and a new task sent twice is two tasks.
 */
export async function api<T = void>(path: string, options: { method?: string; body?: unknown; when?: When } = {}): Promise<T> {
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");
  const reads = method === "GET";
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    const again = attempt < RETRIES;
    // No connection at all: no use waking a server that can't be reached.
    if (navigator.onLine === false) throw new ApiError(0, reads ? OFFLINE : NOT_SAVED);
    await ensureAwake(attempt > 0).catch(() => {
      throw new ApiError(0, reads ? UNREACHABLE : NOT_SAVED);
    });
    try {
      res = await fetch(`/api${path}`, {
        method,
        headers: {
          "X-Local-Date": options.when?.day ?? localDate(),
          ...(options.when && { "X-Client-Time": options.when.at }),
          ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch {
      markStale();
      if (reads && again) continue;
      throw new ApiError(0, reads ? UNREACHABLE : DROPPED);
    }
    if (!HOST_ERRORS.includes(res.status)) break;
    markStale();
    const arrived = res.status === 504;
    if ((reads || !arrived) && again) continue;
    throw new ApiError(res.status, reads ? UNREACHABLE : arrived ? DROPPED : NOT_SAVED);
  }
  markOk();

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  return data as T;
}
