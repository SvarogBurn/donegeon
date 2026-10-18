import type { TaskChanges, NewTask, TaskPlacement } from "../api/tasks";
import type { List, Task, TaskPress, TaskTreeNode } from "../types";
import { dueAfter, movesFrom } from "./repeat";
import { weekColumn } from "./week";

// The task trees as they will be once the server has a change: shown the moment it is made, and for as long as it
// waits to be sent while offline. The refetch after it replaces all of it with the server's own (see lib/offline).
// Points, paces, countdown tables and the stats are the server's to work out; they catch up after it.

/** Every node of the trees through `change`. */
export const mapNodes = (nodes: TaskTreeNode[], change: (node: TaskTreeNode) => TaskTreeNode): TaskTreeNode[] =>
  nodes.map((node) => change({ ...node, children: mapNodes(node.children, change) }));

export const allNodes = (nodes: TaskTreeNode[]): TaskTreeNode[] => nodes.flatMap((node) => [node, ...allNodes(node.children)]);

/** The ids of the tasks above `id`, nearest first. */
function ancestorsOf(nodes: TaskTreeNode[], id: string): string[] {
  for (const node of nodes) {
    if (node.id === id) return [];
    const below = ancestorsOf(node.children, id);
    if (below.length > 0 || node.children.some((child) => child.id === id)) return [...below, node.id];
  }
  return [];
}

/** The trees with the "x/y done" counts of the tasks above `id` changed by so many tasks and done ones. */
function countedAbove(nodes: TaskTreeNode[], id: string, count: number, done: number): TaskTreeNode[] {
  const above = new Set(ancestorsOf(nodes, id));
  if (above.size === 0) return nodes;
  return mapNodes(nodes, (node) =>
    above.has(node.id) ? { ...node, descendantCount: node.descendantCount + count, descendantDoneCount: node.descendantDoneCount + done } : node,
  );
}

/** The order of `day` in the Week box with `id` taken out and put back after `after` (null = first, undefined = last). */
function dayOrderWith(trees: TaskTreeNode[], id: string, day: string, after: string | null | undefined, today: string) {
  const order = allNodes(trees)
    .filter((node) => node.weekDay !== null && node.id !== id && weekColumn(node, today) === day)
    .sort((a, b) => a.weekPosition - b.weekPosition)
    .map((node) => node.id);
  const at = after === undefined || (after !== null && !order.includes(after)) ? order.length : after === null ? 0 : order.indexOf(after) + 1;
  order.splice(at, 0, id);
  return new Map(order.map((taskId, position) => [taskId, position]));
}

/** The trees with `id` on `day` of the Week box after `after`, as the server's placeInWeek does it. */
export function placedInWeek(trees: TaskTreeNode[], id: string, day: string, after: string | null | undefined, today: string) {
  const order = dayOrderWith(trees, id, day, after, today);
  return mapNodes(trees, (node) =>
    node.id === id ? { ...node, weekDay: day, weekPosition: order.get(id)! } : order.has(node.id) ? { ...node, weekPosition: order.get(node.id)! } : node,
  );
}

/** Where a task sits: under which parent, in which list, at which place among its siblings. */
export interface Spot extends TaskPlacement {
  node: TaskTreeNode;
}

/** `node` put in at `place` (index among its siblings, the end if left out), with the counts above it. */
export function insertedInTrees(trees: TaskTreeNode[], node: TaskTreeNode, place: { parentId: string | null; listId: string | null; index?: number }): TaskTreeNode[] {
  const placed = { ...node, parentId: place.parentId, listId: place.parentId ? null : place.listId };
  const putAmong = (siblings: TaskTreeNode[], isSibling: (other: TaskTreeNode) => boolean) => {
    const at = siblings.map((other, i) => (isSibling(other) ? i : -1)).filter((i) => i >= 0);
    const index = place.index === undefined || place.index >= at.length ? (at.length > 0 ? at[at.length - 1] + 1 : siblings.length) : at[place.index];
    return [...siblings.slice(0, index), placed, ...siblings.slice(index)];
  };
  if (!place.parentId) return putAmong(trees, (other) => other.listId === placed.listId);
  let found = false;
  const next = mapNodes(trees, (parent) => {
    if (parent.id !== place.parentId) return parent;
    found = true;
    return { ...parent, children: putAmong(parent.children, () => true) };
  });
  // A parent that isn't loaded: the change shows once the server has it.
  if (!found) return trees;
  const done = (node.isComplete ? 1 : 0) + node.descendantDoneCount;
  return countedAbove(next, placed.id, 1 + node.descendantCount, done);
}

/** The trees without `id` (and what is under it), and where it was, for putting it back. */
export function removedFromTrees(trees: TaskTreeNode[], id: string): { trees: TaskTreeNode[]; spot: Spot | null } {
  const find = (nodes: TaskTreeNode[], parentId: string | null): Spot | null => {
    for (const node of nodes) {
      if (node.id === id) {
        const siblings = parentId ? nodes : nodes.filter((other) => other.listId === node.listId);
        return { node, parentId, listId: node.listId, index: siblings.indexOf(node) };
      }
      const below = find(node.children, node.id);
      if (below) return below;
    }
    return null;
  };
  const spot = find(trees, null);
  if (!spot) return { trees, spot: null };
  const { node } = spot;
  const counted = countedAbove(trees, id, -(1 + node.descendantCount), -((node.isComplete ? 1 : 0) + node.descendantDoneCount));
  const without = (nodes: TaskTreeNode[]): TaskTreeNode[] =>
    nodes.filter((other) => other.id !== id).map((other) => ({ ...other, children: without(other.children) }));
  return { trees: without(counted), spot };
}

/** A task moved (with what is under it) to another place, as the server's move does it. */
export function movedInTrees(trees: TaskTreeNode[], id: string, placement: TaskPlacement): TaskTreeNode[] {
  const { trees: without, spot } = removedFromTrees(trees, id);
  if (!spot) return trees;
  return insertedInTrees(without, spot.node, placement);
}

/** What a new task's row looks like until the server sends the real one. */
export interface DraftContext {
  /** The day and moment it was written. */
  day: string;
  at: string;
  lists: List[];
  /** What a task written straight into Today is worth. */
  todayPoints: number;
  /** The task it is written under, if any. */
  parent: TaskTreeNode | null;
}

export function draftNode(task: NewTask & { id: string }, { day, at, lists, todayPoints, parent }: DraftContext): TaskTreeNode {
  const parentId = task.parentId ?? null;
  const listId = parentId ? null : (task.listId ?? null);
  const list = lists.find((l) => l.id === listId);
  const handedDown = parent?.pointsToSubtasks ? parent.value : 0;
  const scheduled = !parentId && task.repeatEvery !== undefined;
  return {
    id: task.id,
    parentId,
    listId,
    goalIds: task.goalIds ?? [],
    tagIds: task.tagIds ?? [],
    title: task.title,
    notes: task.notes || null,
    startDate: day,
    deadlineDate: task.deadlineDate ?? null,
    deadlineType: task.deadlineDate ? (task.deadlineType ?? "soft") : null,
    isComplete: false,
    completedAt: null,
    completedOn: null,
    points: task.points ?? null,
    pointsToSubtasks: false,
    // Without a list or a parent it was written straight into Today (or Week), as the server makes it.
    todaySince: task.today || (!parentId && !listId && !task.weekDay) ? day : null,
    weekDay: null,
    weekPosition: 0,
    isPersistent: scheduled,
    repeatEvery: scheduled ? task.repeatEvery! : null,
    repeatUnit: task.repeatUnit ?? "day",
    repeatAfterDone: false,
    repeatMakeUp: false,
    roundMoves: null,
    nextDue: scheduled ? (task.nextDue ?? day) : null,
    position: task.index ?? 0,
    createdAt: at,
    children: [],
    descendantCount: 0,
    descendantDoneCount: 0,
    pace: null,
    value: task.points ?? (parentId ? handedDown : list ? list.defaultPoints : todayPoints),
    valueKind: parent?.valueKind ?? list?.kind ?? "task",
    completions: [],
  };
}

/** The fields a change to a task sets, as the server sets them (except a place in Week: see placedInWeek). */
export function patchFor(node: TaskTreeNode, changes: TaskChanges, day: string): Partial<TaskTreeNode> {
  const { today, week, repeatEvery, deadlineDate, points, ...plain } = changes;
  const patch: Partial<TaskTreeNode> = { ...plain };
  if (today !== undefined) patch.todaySince = today ? (node.todaySince ?? day) : null;
  if (week === false) patch.weekDay = null;
  if (deadlineDate !== undefined) {
    patch.deadlineDate = deadlineDate;
    patch.deadlineType = deadlineDate ? (changes.deadlineType ?? node.deadlineType ?? "soft") : null;
  }
  if (points !== undefined) {
    patch.points = points;
    if (points !== null) patch.value = points;
  }
  if (repeatEvery !== undefined) {
    patch.repeatEvery = repeatEvery;
    if (repeatEvery !== null) {
      patch.isPersistent = true;
      patch.nextDue = changes.nextDue ?? node.nextDue ?? day;
    }
  }
  return patch;
}

/** The trees with `id` changed by `patch`. */
export const editedInTrees = (trees: TaskTreeNode[], id: string, patch: Partial<TaskTreeNode>) =>
  mapNodes(trees, (node) => (node.id === id ? { ...node, ...patch } : node));

/**
 * One press of a persistent task's "done it" button: logged, its subtasks unticked for the next round and, on a
 * schedule, due one interval on, as the server's press does it.
 */
export function pressedInTrees(trees: TaskTreeNode[], id: string, press: TaskPress): TaskTreeNode[] {
  const untick = (nodes: TaskTreeNode[]): TaskTreeNode[] =>
    nodes.map((node) => ({ ...node, isComplete: false, completedAt: null, completedOn: null, descendantDoneCount: 0, children: untick(node.children) }));
  return trees.map((node) => {
    if (node.id !== id) return node;
    const scheduled: Partial<Task> =
      node.repeatEvery && node.nextDue
        ? (() => {
            const nextDue = dueAfter({ ...node, repeatEvery: node.repeatEvery, nextDue: node.nextDue }, press.day);
            return { nextDue, roundMoves: movesFrom(node.roundMoves, nextDue) };
          })()
        : {};
    return { ...node, ...scheduled, completions: [...node.completions, press], descendantDoneCount: 0, children: untick(node.children) };
  });
}
