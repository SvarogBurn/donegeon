import { useLists } from "../../hooks/useTasks";
import { formatValue } from "../../lib/points";
import type { TaskTreeNode } from "../../types";

/**
 * What a main task adds (task list) or costs (reward list) when done. A task
 * that lives only in Today has no list and earns Today's amount. Nothing for
 * subtasks or a value of 0.
 */
export function ValueChip({ node }: { node: Pick<TaskTreeNode, "listId" | "value" | "points"> }) {
  const { data: lists = [] } = useLists();
  const list = lists.find((l) => l.id === node.listId);
  if (!node.value || (node.listId && !list)) return null;
  const kind = list?.kind ?? "task";
  const isReward = kind === "reward";
  const source = node.points !== null ? "its own amount" : list ? "the list's amount" : "Today's amount";

  return (
    <span
      data-value-chip
      title={`${isReward ? "Costs" : "Earns"} ${node.value} ${node.value === 1 ? "point" : "points"} (${source})`}
      className={`pixel-chip px-2 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums ${isReward ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"}`}
    >
      {formatValue(node.value, kind)}
    </span>
  );
}
