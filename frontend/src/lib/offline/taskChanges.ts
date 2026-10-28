import { DEFAULT_TODAY_POINTS } from "../../../../shared/constants";
import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import * as goalsApi from "../../api/goals";
import * as tagsApi from "../../api/tags";
import * as tasksApi from "../../api/tasks";
import { COUNTDOWN, DONE, GOALS, LISTS, POINTS, PRESSURE, TAGS, TASK_DATA, TASKS } from "../../hooks/queryKeys";
import { ME } from "../../hooks/useAuth";
import type { Countdown, DonePage, Goal, List, PointsSummary, Tag, TaskPress, TaskTreeNode, User } from "../../types";
import { taskDone } from "../breakReminder";
import {
  draftNode,
  editedInTrees,
  insertedInTrees,
  mapNodes,
  movedInTrees,
  patchFor,
  placedInWeek,
  pressedInTrees,
  removedFromTrees,
  type Spot,
} from "../optimisticTasks";
import { findNode, toggleInCountdown, toggleInTrees, type CompletionChange } from "../optimisticToggle";
import { quoted, type Change, type Saved, type Specs } from "./changeSpec";

/** The everyday changes to tasks, which work offline: how each is sent, shown at once and refreshed. */

export interface NewLabel {
  id: string;
  name: string;
}
export interface AddChange {
  /** Tags and goals typed into it for the first time: made first. */
  tags: NewLabel[];
  goals: NewLabel[];
  task: tasksApi.NewTask & { id: string };
}
export interface EditChange {
  id: string;
  tags: NewLabel[];
  goals: NewLabel[];
  changes: tasksApi.TaskChanges;
  /** Typed /list: to the end of that list. */
  move: tasksApi.TaskPlacement | null;
}
export interface PressChange {
  id: string;
  completionId: string;
}

/** What each kind of task change carries. */
export interface TaskChangeVars {
  add: AddChange;
  edit: EditChange;
  update: { id: string; changes: tasksApi.TaskChanges };
  toggle: { id: string; done: boolean };
  press: PressChange;
  undoPress: PressChange;
  /** A day: in Today on that day. */
  today: { id: string; today: boolean | string };
  week: { id: string; week: boolean };
  round: { id: string; from: string; to: string };
  placeInWeek: { id: string; day: string; after?: string | null };
  move: { id: string; placement: tasksApi.TaskPlacement };
  delete: { id: string };
  restore: { id: string };
}

const trees = (queryClient: QueryClient) => queryClient.getQueryData<TaskTreeNode[]>(TASKS);

/** Saves what the trees hold now and applies `change` to them. */
async function changeTrees(queryClient: QueryClient, change: (trees: TaskTreeNode[]) => TaskTreeNode[]): Promise<Saved> {
  await queryClient.cancelQueries({ queryKey: TASKS });
  const before = trees(queryClient);
  if (!before) return [];
  queryClient.setQueryData(TASKS, change(before));
  return [[TASKS, before]];
}

/** Tags and goals typed in for the first time, added to their lists before the server makes them. */
function showLabels(queryClient: QueryClient, tags: NewLabel[], goals: NewLabel[], at: string): Saved {
  const saved: Saved = [];
  if (tags.length > 0) {
    saved.push([TAGS, queryClient.getQueryData(TAGS)]);
    queryClient.setQueryData<Tag[]>(TAGS, (all = []) => [...all, ...tags]);
  }
  if (goals.length > 0) {
    saved.push([GOALS, queryClient.getQueryData(GOALS)]);
    queryClient.setQueryData<Goal[]>(GOALS, (all = []) => [...all, ...goals.map((g) => ({ ...g, description: null, isArchived: false, createdAt: at }))]);
  }
  return saved;
}

async function sendLabels({ tags, goals, when }: Change<{ tags: NewLabel[]; goals: NewLabel[] }>) {
  for (const tag of tags) await tagsApi.createTag(tag.name, tag.id, when);
  for (const goal of goals) await goalsApi.createGoal({ name: goal.name, id: goal.id }, when);
}

/** Where deleted tasks were, so an undo made offline can put them back; and pressed tasks as they were before the press. */
const deletedSpots = new Map<string, Spot>();
const beforePress = new Map<string, TaskTreeNode>();

/** After how many tasks done in a day the user wants to be reminded to take a break; null = never. */
const breakEvery = (queryClient: QueryClient) => queryClient.getQueryData<User | null>(ME)?.breakEvery ?? null;

/** A task's title for the notice, from the trees as they are, or as they were before the change. */
export function taskTitle(queryClient: QueryClient, id: string, saved: Saved | undefined) {
  const before = saved?.find(([key]) => key === TASKS)?.[1] as TaskTreeNode[] | undefined;
  return findNode(trees(queryClient) ?? [], id)?.title ?? findNode(before ?? [], id)?.title ?? "a task";
}

export const taskSpecs: Specs<TaskChangeVars> = {
  add: {
    send: async (change) => {
      await sendLabels(change);
      return tasksApi.createTask(change.task, change.when);
    },
    show: async (queryClient, { task, tags, goals, when }) => {
      const labels = showLabels(queryClient, tags, goals, when.at);
      const saved = await changeTrees(queryClient, (all) => {
        const node = draftNode(task, {
          ...when,
          lists: queryClient.getQueryData<List[]>(LISTS) ?? [],
          todayPoints: queryClient.getQueryData<PointsSummary>(POINTS)?.todayPoints ?? DEFAULT_TODAY_POINTS,
          parent: task.parentId ? findNode(all, task.parentId) : null,
        });
        const placed = insertedInTrees(all, node, { parentId: node.parentId, listId: node.listId, index: task.index });
        return task.weekDay ? placedInWeek(placed, task.id, task.weekDay, task.weekAfter, when.day) : placed;
      });
      return [...labels, ...saved];
    },
    refresh: [...TASK_DATA, TAGS, GOALS],
    name: ({ task }) => `the new task ${quoted(task.title)}`,
  },
  edit: {
    send: async (change) => {
      await sendLabels(change);
      await tasksApi.updateTask(change.id, change.changes, change.when);
      if (change.move) await tasksApi.moveTask(change.id, change.move, change.when);
    },
    show: async (queryClient, { id, tags, goals, changes, move, when }) => {
      const labels = showLabels(queryClient, tags, goals, when.at);
      const saved = await changeTrees(queryClient, (all) => {
        const node = findNode(all, id);
        if (!node) return all;
        const edited = editedInTrees(all, id, patchFor(node, changes, when.day));
        return move ? movedInTrees(edited, id, move) : edited;
      });
      return [...labels, ...saved];
    },
    refresh: [...TASK_DATA, TAGS, GOALS],
    name: (_change, title) => `the change to ${quoted(title)}`,
  },
  update: {
    send: ({ id, changes, when }) => tasksApi.updateTask(id, changes, when),
    show: (queryClient, { id, changes, when }) =>
      changeTrees(queryClient, (all) => {
        const node = findNode(all, id);
        if (!node) return all;
        const edited = editedInTrees(all, id, patchFor(node, changes, when.day));
        return changes.week && !node.weekDay ? placedInWeek(edited, id, when.day, undefined, when.day) : edited;
      }),
    refresh: TASK_DATA,
    name: (_change, title) => `the change to ${quoted(title)}`,
  },
  toggle: {
    send: ({ id, done, when }) =>
      tasksApi.toggleTask(id, done, when),
    // Ticking shows at once: the row, its parents' "x/y done", deadline pills and any open countdown table.
    show: async (queryClient, { id, done: ticks, when }) => {
      await Promise.all([TASKS, COUNTDOWN, PRESSURE].map((queryKey) => queryClient.cancelQueries({ queryKey })));
      const all = trees(queryClient);
      // The Done page unticks tasks finished long ago, which only its own pages hold.
      const done = queryClient.getQueryData<InfiniteData<DonePage>>(DONE);
      const node = findNode(all ?? [], id) ?? findNode(done?.pages.flatMap((page) => page.tasks) ?? [], id);
      // Already so: the server changes nothing either.
      if (!node || node.isComplete === ticks) return [];
      const change: CompletionChange = { id, was: node.completedOn, now: ticks ? when.day : null };
      const countdowns = queryClient.getQueriesData<Countdown>({ queryKey: COUNTDOWN });
      const saved: Saved = [];
      if (all) {
        saved.push([TASKS, all]);
        queryClient.setQueryData(TASKS, toggleInTrees(all, change, when.day));
      }
      if (done) {
        saved.push([DONE, done]);
        const pages = done.pages.map((page) => ({ ...page, tasks: toggleInTrees(page.tasks, change, when.day) }));
        queryClient.setQueryData(DONE, { ...done, pages });
      }
      for (const [queryKey, countdown] of countdowns) {
        const owner = findNode(all ?? [], String(queryKey[1]));
        if (!countdown || !owner || !findNode([owner], id)) continue;
        saved.push([queryKey, countdown]);
        queryClient.setQueryData(queryKey, toggleInCountdown(countdown, change));
      }
      return saved;
    },
    refresh: TASK_DATA,
    name: ({ done }, title) => `${done ? "the tick on" : "unticking"} ${quoted(title)}`,
    popup: true,
    // An untick is not a task done.
    onSaved: (queryClient, task) => {
      const { isComplete, doneToday } = task as { isComplete: boolean; doneToday: number };
      if (isComplete) taskDone(doneToday, breakEvery(queryClient));
    },
  },
  press: {
    send: ({ id, completionId, when }) => tasksApi.pressTask(id, completionId, when),
    show: (queryClient, { id, completionId, when }) =>
      changeTrees(queryClient, (all) => {
        const node = findNode(all, id);
        if (node) beforePress.set(completionId, node);
        const press: TaskPress = { id: completionId, day: when.day, createdAt: when.at };
        return pressedInTrees(all, id, press);
      }),
    refresh: TASK_DATA,
    name: (_change, title) => `“done it” on ${quoted(title)}`,
    popup: true,
    onSaved: (queryClient, press) => taskDone((press as { doneToday: number }).doneToday, breakEvery(queryClient)),
  },
  undoPress: {
    send: ({ id, completionId, when }) => tasksApi.undoPress(id, completionId, when),
    show: (queryClient, { id, completionId }) =>
      changeTrees(queryClient, (all) => {
        const before = beforePress.get(completionId);
        return mapNodes(all, (node) =>
          node.id !== id ? node : before ? { ...before, completions: node.completions.filter((c) => c.id !== completionId) } : { ...node, completions: node.completions.filter((c) => c.id !== completionId) },
        );
      }),
    refresh: TASK_DATA,
    name: (_change, title) => `taking back “done it” on ${quoted(title)}`,
    popup: true,
  },
  today: {
    send: ({ id, today, when }) => tasksApi.updateTask(id, { today }, when),
    show: (queryClient, { id, today, when }) =>
      changeTrees(queryClient, (all) => {
        const node = findNode(all, id);
        return node ? editedInTrees(all, id, patchFor(node, { today }, when.day)) : all;
      }),
    refresh: [TASKS],
    name: ({ today }, title) => `${quoted(title)} ${today === false ? "out of Today" : typeof today === "string" ? `into Today on ${today}` : "into Today"}`,
  },
  week: {
    send: ({ id, week, when }) => tasksApi.updateTask(id, { week }, when),
    // One coming in goes last on today.
    show: (queryClient, { id, week, when }) =>
      changeTrees(queryClient, (all) =>
        !week
          ? mapNodes(all, (node) => (node.id === id ? { ...node, weekDay: null } : node))
          : findNode(all, id)?.weekDay
            ? all
            : placedInWeek(all, id, when.day, undefined, when.day),
      ),
    refresh: [TASKS],
    name: ({ week }, title) => `${quoted(title)} ${week ? "into" : "out of"} the Week box`,
  },
  round: {
    send: ({ id, from, to, when }) => tasksApi.moveRound(id, from, to, when),
    show: (queryClient, { id, from, to }) =>
      changeTrees(queryClient, (all) =>
        mapNodes(all, (node) => {
          if (node.id !== id) return node;
          const { [from]: _, ...others } = node.roundMoves ?? {};
          const moves = from === to ? others : { ...others, [from]: to };
          return { ...node, roundMoves: Object.keys(moves).length > 0 ? moves : null };
        }),
      ),
    refresh: [TASKS],
    name: (_change, title) => `moving the round of ${quoted(title)}`,
  },
  placeInWeek: {
    send: ({ id, day, after, when }) => tasksApi.placeInWeek(id, day, after, when),
    show: (queryClient, { id, day, after, when }) =>
      changeTrees(queryClient, (all) => placedInWeek(all, id, day, after, when.day)),
    refresh: [TASKS],
    name: (_change, title) => `${quoted(title)} in the Week box`,
  },
  move: {
    send: ({ id, placement, when }) => tasksApi.moveTask(id, placement, when),
    show: (queryClient, { id, placement }) =>
      changeTrees(queryClient, (all) => movedInTrees(all, id, placement)),
    refresh: TASK_DATA,
    name: (_change, title) => `moving ${quoted(title)}`,
  },
  delete: {
    send: ({ id, when }) => tasksApi.deleteTask(id, when),
    show: (queryClient, { id }) =>
      changeTrees(queryClient, (all) => {
        const { trees: without, spot } = removedFromTrees(all, id);
        if (spot) deletedSpots.set(id, spot);
        return without;
      }),
    refresh: TASK_DATA,
    name: (_change, title) => `deleting ${quoted(title)}`,
  },
  restore: {
    send: ({ id, when }) => tasksApi.restoreTask(id, when),
    show: (queryClient, { id }) =>
      changeTrees(queryClient, (all) => {
        const spot = deletedSpots.get(id);
        if (!spot || findNode(all, id)) return all;
        deletedSpots.delete(id);
        return insertedInTrees(all, spot.node, spot);
      }),
    refresh: TASK_DATA,
    name: (_change, title) => `bringing back ${quoted(title)}`,
  },
};
