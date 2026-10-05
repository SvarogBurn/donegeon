import { useLists } from "../../hooks/useTasks";
import { formatValue } from "../../lib/points";
import type { TaskTreeNode } from "../../types";

/**
 * What a task adds (task list) or costs (reward list) when done. A task that
 * lives only in Today has no list and earns Today's amount. A subtask is worth
 * its own amount, or its main task's if that one hands it down. Nothing for a value of 0.
 */
export function ValueChip({ node }: { node: Pick<TaskTreeNode, "parentId" | "listId" | "value" | "valueKind" | "points"> }) {
  const { data: lists = [] } = useLists();
  const list = lists.find((l) => l.id === node.listId);
  if (!node.value || (node.listId && !list)) return null;
  const isReward = node.valueKind === "reward";
  const source = node.points !== null ? "its own amount" : node.parentId ? "its main task's amount" : list ? "the list's amount" : "Today's amount";

  return (
    <span
      data-value-chip
      title={`${isReward ? "Costs" : "Earns"} ${node.value} ${node.value === 1 ? "point" : "points"} (${source})`}
      className={`pixel-chip px-2 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums ${isReward ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"}`}
    >
      {formatValue(node.value, node.valueKind)}
    </span>
  );
}
