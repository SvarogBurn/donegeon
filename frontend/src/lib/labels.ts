import type { TaskTreeNode } from "../types";

/** The goals and tags picked in the dashboard's filter. Empty arrays = no filter. */
export interface LabelFilter {
  goalIds: string[];
  tagIds: string[];
}

export const NO_FILTER: LabelFilter = { goalIds: [], tagIds: [] };

export const isFiltering = (filter: LabelFilter) => filter.goalIds.length + filter.tagIds.length > 0;

/** A task matches when it carries every selected goal and every selected tag. */
function matches(node: TaskTreeNode, filter: LabelFilter) {
  return (
    filter.goalIds.every((id) => node.goalIds.includes(id)) && filter.tagIds.every((id) => node.tagIds.includes(id))
  );
}

/**
 * Keeps matching tasks with everything beneath them, plus the ancestors needed
 * to show where a matching subtask lives.
 */
export function filterTree(nodes: TaskTreeNode[], filter: LabelFilter): TaskTreeNode[] {
  if (!isFiltering(filter)) return nodes;
  return nodes.flatMap((node) => {
    if (matches(node, filter)) return [node];
    const children = filterTree(node.children, filter);
    return children.length > 0 ? [{ ...node, children }] : [];
  });
}

/** How many tasks, at any depth, carry each goal (or tag). */
export function countLabels(nodes: TaskTreeNode[], key: "goalIds" | "tagIds", counts = new Map<string, number>()) {
  for (const node of nodes) {
    for (const id of node[key]) counts.set(id, (counts.get(id) ?? 0) + 1);
    countLabels(node.children, key, counts);
  }
  return counts;
}

export function toggleId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id];
}
