import { formatDay, formatPace } from "../../lib/dates";
import type { TaskTreeNode } from "../../types";
import { pressureColor } from "../Countdown/pressureColor";

/** A hard deadline's flag, before its date: a pole with a pennant, on whole pixels. */
export function DeadlineFlag() {
  return (
    <svg viewBox="0 0 4 6" width="6" height="9" className="mr-1 inline-block flex-none fill-current align-[-1px]" shapeRendering="crispEdges" aria-hidden>
      <rect x="0" y="0" width="1" height="6" />
      <rect x="1" y="0" width="3" height="1" />
      <rect x="1" y="1" width="2" height="1" />
      <rect x="1" y="2" width="3" height="1" />
    </svg>
  );
}

/**
 * A dd/mm pill (or `label` instead of the date) filled with today's pressure colour. A hard deadline has a solid edge
 * and a flag before its date; a soft one a dashed edge, a paler fill and "~" before it, as typed (2026-11-04, playtest 1:
 * the two looked the same everywhere). Soft deadlines don't count toward the dashboard totals. A tap on a touch screen
 * says which it is and its pace (`data-tip`, see TapTips).
 */
export function DeadlineBadge({ task, label }: { task: Pick<TaskTreeNode, "deadlineDate" | "deadlineType" | "pace">; label?: string }) {
  if (!task.deadlineDate) return null;
  const isSoft = task.deadlineType === "soft";
  const fill = task.pace && pressureColor(task.pace);
  const kind = isSoft ? "Soft deadline" : "Hard deadline";
  const pace = !task.pace || task.pace.remaining === 0 ? "all done" : task.pace.perDay === null ? "overdue" : `${formatPace(task.pace.perDay)} per day`;

  return (
    <span
      title={`${kind} · ${pace}`}
      data-tip
      data-deadline-kind={isSoft ? "soft" : "hard"}
      style={fill ? { backgroundColor: isSoft ? `color-mix(in srgb, ${fill} 45%, transparent)` : fill } : undefined}
      className={`pixel-chip ${isSoft ? "pixel-chip-soft" : ""} px-2 py-0.5 text-xs whitespace-nowrap tabular-nums ${fill ? (isSoft ? "text-stone-900 dark:text-stone-100" : "text-stone-900") : "bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-300"}`}
    >
      {isSoft ? "~" : <DeadlineFlag />}
      {label ?? formatDay(task.deadlineDate)}
    </span>
  );
}
