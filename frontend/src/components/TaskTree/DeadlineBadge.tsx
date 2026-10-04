import { formatDay, formatPace } from "../../lib/dates";
import type { TaskTreeNode } from "../../types";
import { pressureColor } from "../Countdown/pressureColor";

/**
 * A dd/mm pill filled with today's pressure colour. Soft deadlines are coloured
 * the same way; they just don't count toward the dashboard totals.
 */
export function DeadlineBadge({ task }: { task: Pick<TaskTreeNode, "deadlineDate" | "deadlineType" | "pace"> }) {
  if (!task.deadlineDate) return null;
  const fill = task.pace && pressureColor(task.pace);
  const kind = task.deadlineType === "soft" ? "Soft deadline" : "Hard deadline";
  const pace = !task.pace || task.pace.remaining === 0 ? "all done" : task.pace.perDay === null ? "overdue" : `${formatPace(task.pace.perDay)} per day`;

  return (
    <span
      title={`${kind} · ${pace}`}
      style={fill ? { backgroundColor: fill } : undefined}
      className={`pixel-chip px-2 py-0.5 text-xs whitespace-nowrap tabular-nums ${fill ? "text-stone-900" : "bg-stone-200 text-stone-600 dark:bg-stone-700 dark:text-stone-300"}`}
    >
      {formatDay(task.deadlineDate)}
    </span>
  );
}
