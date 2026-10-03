import type { Countdown, Pace, TaskTreeNode } from "../types";

// Shown the moment a box is ticked, before the server answers; the refetch
// that follows replaces all of it with the server's own numbers.

/** Same rule as the backend's countdown: null = work left, no days left. */
function perDayFor(daysLeft: number, remaining: number) {
  return daysLeft > 0 ? remaining / daysLeft : remaining > 0 ? null : 0;
}

function withRemaining(pace: Pace | null, change: number): Pace | null {
  if (!pace || change === 0) return pace;
  const remaining = pace.remaining + change;
  return { ...pace, remaining, perDay: perDayFor(pace.daysLeft, remaining) };
}

export function findNode(nodes: TaskTreeNode[], id: string): TaskTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}

/** A completion moving from day `was` to day `now` (null = not done). */
export interface CompletionChange {
  id: string;
  was: string | null;
  now: string | null;
}

/** The trees with one task's completion flipped, its ancestors' "x/y done" and today's paces adjusted. */
export function toggleInTrees(nodes: TaskTreeNode[], { id, was, now }: CompletionChange, today: string): TaskTreeNode[] {
  const doneChange = (now ? 1 : 0) - (was ? 1 : 0);
  const remainingChange = (was && was <= today ? 1 : 0) - (now && now <= today ? 1 : 0);

  const visit = (list: TaskTreeNode[]): [TaskTreeNode[], boolean] => {
    let hit = false;
    const next = list.map((node) => {
      if (node.id === id) {
        hit = true;
        return { ...node, isComplete: now !== null, completedOn: now, pace: withRemaining(node.pace, remainingChange) };
      }
      const [children, below] = visit(node.children);
      if (!below) return node;
      hit = true;
      return {
        ...node,
        children,
        descendantDoneCount: node.descendantDoneCount + doneChange,
        pace: withRemaining(node.pace, remainingChange),
      };
    });
    return [hit ? next : list, hit];
  };
  return visit(nodes)[0];
}

/** A countdown table with one of its tasks' completion day moved. */
export function toggleInCountdown(countdown: Countdown, { was, now }: CompletionChange): Countdown {
  const rows = countdown.rows.map((row) => {
    let { doneThatDay, remaining } = row;
    if (was) {
      if (row.date === was) doneThatDay--;
      if (row.date >= was) remaining++;
    }
    if (now) {
      if (row.date === now) doneThatDay++;
      if (row.date >= now) remaining--;
    }
    return { ...row, doneThatDay, remaining, perDay: perDayFor(row.daysLeft, remaining) };
  });
  return { ...countdown, rows };
}
