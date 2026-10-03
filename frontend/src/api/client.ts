const DEV_DATE_KEY = "donegeon.devDate";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function realLocalDate(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

/** Dev-only "pretend it's this day" override, for testing date-driven features. */
export function getDevDate(): string | null {
  if (!import.meta.env.DEV) return null;
  try {
    return localStorage.getItem(DEV_DATE_KEY);
  } catch {
    return null;
  }
}

export function setDevDate(date: string | null) {
  if (date) localStorage.setItem(DEV_DATE_KEY, date);
  else localStorage.removeItem(DEV_DATE_KEY);
}

/** The day the app treats as "today", sent to the backend with every request. */
export function localDate(): string {
  return getDevDate() ?? realLocalDate();
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
