import { useLists } from "../../hooks/useTasks";
import { formatValue } from "../../lib/points";
import type { TaskTreeNode } from "../../types";

/** What a main task adds (task list) or costs (reward list) when done. Nothing for subtasks or a value of 0. */
export function ValueChip({ node }: { node: Pick<TaskTreeNode, "listId" | "value" | "points"> }) {
  const { data: lists = [] } = useLists();
  const list = lists.find((l) => l.id === node.listId);
  if (!list || !node.value) return null;
  const isReward = list.kind === "reward";

  return (
    <span
      data-value-chip
      title={`${isReward ? "Costs" : "Earns"} ${node.value} ${node.value === 1 ? "point" : "points"}${node.points === null ? " (the list's amount)" : " (its own amount)"}`}
      className={`pixel-chip px-2 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums ${isReward ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"}`}
    >
      {formatValue(node.value, list.kind)}
    </span>
  );
}
