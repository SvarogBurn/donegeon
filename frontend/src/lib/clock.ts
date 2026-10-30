import { localDay } from "./dates";
import { readStored, writeStored } from "./storage";

const DEV_DATE_KEY = "donegeon.devDate";
const TIME_OFFSET_KEY = "donegeon.devTimeOffset";

/** "Pretend it's this day": set with the dev clock (components/layout/DevClock) or by the browser checks. Stays put until reset; it does not roll over at midnight. */
export function getDevDate(): string | null {
  return readStored(DEV_DATE_KEY);
}

export function setDevDate(date: string | null) {
  writeStored(DEV_DATE_KEY, date || null);
}

/** Minutes the app's clock runs ahead of (or behind) the device's; 0 unless the dev clock or a browser check changed the time. */
export function getTimeOffset(): number {
  return Number(readStored(TIME_OFFSET_KEY)) || 0;
}

export function setTimeOffset(minutes: number) {
  writeStored(TIME_OFFSET_KEY, minutes ? String(minutes) : null);
}

/** The device's own day and time again. */
export function backToRealTime() {
  setDevDate(null);
  setTimeOffset(0);
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

/** The day the app treats as "today", sent to the backend with every request. */
export function localDate(): string {
  return getDevDate() ?? localDay(clockNow());
}

/**
 * When a change was made: the app's day and the moment. Sent with it, so a change made offline and sent later
 * counts on the day it was made (see lib/offline/changes).
 */
export interface When {
  day: string;
  at: string;
}

export const whenNow = (): When => ({ day: localDate(), at: clockNow().toISOString() });
