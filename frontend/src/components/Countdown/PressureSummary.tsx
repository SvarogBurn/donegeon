import { Link } from "react-router";
import { usePressure, useTaskTrees } from "../../hooks/useTasks";
import { findNode } from "../../lib/optimisticToggle";
import { hasTaskPage } from "../../lib/taskPage";
import type { TaskTreeNode } from "../../types";
import { formatDay, formatPace } from "../../lib/dates";
import { TileFrame } from "../Tiles/TileFrame";
import { pressureColor } from "./pressureColor";

/** Links to the task's page when it has one (big tasks only). */
function ItemTitle({ taskId, title, trees }: { taskId: string; title: string; trees: TaskTreeNode[] }) {
  const node = findNode(trees, taskId);
  if (!node || !hasTaskPage(node)) return <span className="min-w-0 truncate font-medium">{title}</span>;
  return (
    <Link to={`/tasks/${taskId}`} className="min-w-0 truncate font-medium underline-offset-2 hover:underline">
      {title}
    </Link>
  );
}

/** "How much today" across every hard deadline. Hidden until there is one. */
export function PressureSummary() {
  const { data: pressure } = usePressure();
  const { data: trees = [] } = useTaskTrees();
  if (!pressure || pressure.items.length === 0) return null;

  return (
    <TileFrame title="Deadline pressure" aria-label="Deadline pressure">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p>
          <span className="text-2xl font-bold tabular-nums">{formatPace(pressure.perDayToday)}</span>{" "}
          <span className="text-sm text-stone-500">tasks to do today</span>
        </p>
        <p>
          <span className="text-2xl font-bold tabular-nums">{pressure.totalOutstanding}</span>{" "}
          <span className="text-sm text-stone-500">outstanding against hard deadlines</span>
        </p>
      </div>
      <ul className="space-y-1 text-sm">
        {pressure.items.map((item) => (
          <li key={item.taskId} className="flex flex-wrap items-center gap-x-2">
            <span
              className="size-2.5 shrink-0 bg-stone-300 dark:bg-stone-600"
              style={{ backgroundColor: pressureColor(item) ?? undefined }}
            />
            <ItemTitle taskId={item.taskId} title={item.title.split("\n")[0]} trees={trees} />
            <span className="text-stone-500 tabular-nums">
              {formatDay(item.deadlineDate)} · {item.remaining} left ·{" "}
              {item.perDay === null ? "overdue" : `${formatPace(item.perDay)}/day`}
            </span>
          </li>
        ))}
      </ul>
    </TileFrame>
  );
}
