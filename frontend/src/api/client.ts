const DEV_DATE_KEY = "donegeon.devDate";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const TIME_OFFSET_KEY = "donegeon.devTimeOffset";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** "Pretend it's this day": set from the clock in the task bar, by anyone. Stays put until reset; it does not roll over at midnight. */
export function getDevDate(): string | null {
  return read(DEV_DATE_KEY);
}

export function setDevDate(date: string | null) {
  if (date) localStorage.setItem(DEV_DATE_KEY, date);
  else localStorage.removeItem(DEV_DATE_KEY);
}

/** Minutes the app's clock runs ahead of (or behind) the device's; 0 unless the time was changed from the task bar. */
export function getTimeOffset(): number {
  return Number(read(TIME_OFFSET_KEY)) || 0;
}

export function setTimeOffset(minutes: number) {
  if (minutes) localStorage.setItem(TIME_OFFSET_KEY, String(minutes));
  else localStorage.removeItem(TIME_OFFSET_KEY);
}

/** The moment the app treats as "now": the device's clock plus the chosen offset. */
export function clockNow(): Date {
  return new Date(Date.now() + getTimeOffset() * 60_000);
}

/**
 * "Now" on the day the app treats as today: the clock's time of day, on the
 * pretended date if there is one. For "how long ago was this".
 */
export function appNow(): Date {
  const now = clockNow();
  const day = getDevDate();
  if (!day) return now;
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date, now.getHours(), now.getMinutes(), now.getSeconds());
}

function clockDate(): string {
  const now = clockNow();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

/** The day the app treats as "today", sent to the backend with every request. */
export function localDate(): string {
  return getDevDate() ?? clockDate();
}

export async function api<T = void>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers: {
      "X-Local-Date": localDate(),
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  return data as T;
}
