import type { Pace } from "../../types";

// The spreadsheet's colour scale on tasks per day: green at 0, yellow at 5,
// red from 10 up, blended in between. Retune here; nothing else knows the numbers.
const STOPS: [perDay: number, rgb: [number, number, number]][] = [
  [0, [0x57, 0xbb, 0x8a]],
  [5, [0xff, 0xd6, 0x66]],
  [10, [0xff, 0x00, 0x00]],
];
export const OVERDUE_COLOR = "#FF0000";

const hex = (rgb: number[]) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

/**
 * The fill for a "Per day" value: null when nothing is left (no colour), full
 * red when work is left with no days to do it in.
 */
export function pressureColor({ remaining, perDay }: Pick<Pace, "remaining" | "perDay">): string | null {
  if (remaining === 0) return null;
  if (perDay === null) return OVERDUE_COLOR;
  const upper = STOPS.findIndex(([at]) => perDay <= at);
  if (upper === 0) return hex(STOPS[0][1]);
  if (upper === -1) return hex(STOPS.at(-1)![1]);
  const [fromAt, from] = STOPS[upper - 1];
  const [toAt, to] = STOPS[upper];
  const t = (perDay - fromAt) / (toAt - fromAt);
  return hex(from.map((c, i) => c + (to[i] - c) * t));
}
