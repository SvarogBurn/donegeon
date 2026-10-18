import { onlineManager, type InfiniteData, type Mutation, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { ApiError, clockNow, isUnreachable, type When } from "../../api/client";
import * as goalsApi from "../../api/goals";
import * as notesApi from "../../api/notes";
import * as tagsApi from "../../api/tags";
import * as tasksApi from "../../api/tasks";
import { COUNTDOWN, DONE, GOALS, NOTES, POINTS, TAGS, TASK_DATA, TASKS } from "../../hooks/queryKeys";
import { ME } from "../../hooks/useAuth";
import type { Countdown, DonePage, Goal, List, Note, NoteFolder, PointsSummary, Tag, TaskPress, TaskTreeNode, User } from "../../types";
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
import { refuse } from "../refusal";
import { getServerStatus, reportFailure } from "../serverStatus";

/*
 * Everyday changes to tasks work offline. Each one is shown at once (onMutate), waits in one queue (the "changes"
 * scope: sent one at a time, in the order made), and is kept in IndexedDB with the query cache (main.tsx), so it
 * survives closing the app. When the server can be reached again it is sent; a send the connection lost is sent
 * again, which the server takes as the same change (ids made here, "make it so" requests). Everything a change
 * needs is decided when it is made and kept in its variables, the day and moment included (`when`): registered
 * here by key rather than written in the hooks, so a change read back from IndexedDB still knows how to send itself.
 */

export const CHANGES_SCOPE = "changes";

/** What every change carries besides its own fields. */
export type Change<V> = V & { when: When };

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

export const CHANGE = {
  add: ["change", "add"],
  edit: ["change", "edit"],
  update: ["change", "update"],
  toggle: ["change", "toggle"],
  press: ["change", "press"],
  undoPress: ["change", "undoPress"],
  today: ["change", "today"],
  week: ["change", "week"],
  round: ["change", "round"],
  placeInWeek: ["change", "placeInWeek"],
  move: ["change", "move"],
  delete: ["change", "delete"],
  restore: ["change", "restore"],
  noteAdd: ["change", "noteAdd"],
  noteEdit: ["change", "noteEdit"],
  noteDelete: ["change", "noteDelete"],
} as const;

export interface NoteEditChange {
  id: string;
  changes: notesApi.NoteChanges;
}

/** An id for a row made on the device. crypto.randomUUID is missing on a plain-http page (the dev server opened on a phone). */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Changes that had to wait (offline, or sent again after the connection failed): made a while before their answer. */
const waited = new WeakSet<object>();
/** Nor is a change this old just clicked, waited or not (one read back from IndexedDB). */
const FRESH_MS = 15_000;
/**
 * A change just clicked and answered straight away: a refusal shows next to the click and the page goes back to
 * before it. Others were made a while ago; changes made since build on them.
 */
const isFresh = (change: Change<unknown>) => !waited.has(change) && clockNow().getTime() - Date.parse(change.when.at) < FRESH_MS;

const isChange = (mutation: Mutation<unknown, Error, unknown, unknown>) => mutation.options.scope?.id === CHANGES_SCOPE;

/** How many changes are still to be saved, the one being sent included. */
export const changesWaiting = (queryClient: QueryClient) => queryClient.isMutating({ predicate: isChange });

/** What the query cache held before a change, to put back if the server refuses it at once. */
type Saved = [QueryKey, unknown][];

/** What the page asks again for once every waiting change is saved: refetching earlier would undo the ones still waiting. */
const toRefresh = new Map<string, QueryKey>();

interface Spec<V> {
  send: (change: Change<V>) => Promise<unknown>;
  /** Shows the change at once; returns what it changed, so a refusal can put it back. */
  show?: (queryClient: QueryClient, change: Change<V>) => Promise<Saved> | Saved;
  /** What may look different once the server has it. */
  refresh: QueryKey[];
  /** How the change is named when it couldn't be saved. */
  name: (change: Change<V>, title: string) => string;
  /** Its refusal shows next to the click, not only in the box that made it. */
  popup?: boolean;
  onSaved?: (queryClient: QueryClient, result: unknown, change: Change<V>) => void;
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

const quoted = (title: string) => `“${title}”`;

/** What the Notes page holds: the notes and its folders, in one answer. */
export interface NotesData {
  notes: Note[];
  noteFolders: NoteFolder[];
}

/** Saves what the notes hold now and applies `change` to them. */
async function changeNotes(queryClient: QueryClient, change: (notes: Note[]) => Note[]): Promise<Saved> {
  await queryClient.cancelQueries({ queryKey: NOTES });
  const before = queryClient.getQueryData<NotesData>(NOTES);
  if (!before) return [];
  queryClient.setQueryData<NotesData>(NOTES, { ...before, notes: change(before.notes) });
  return [[NOTES, before]];
}

const noteName = (title: string | undefined) => (title ? `the note ${quoted(title)}` : "a note");

const specs: Record<keyof typeof CHANGE, Spec<any>> = {
  add: {
    send: async (change: Change<AddChange>) => {
      await sendLabels(change);
      return tasksApi.createTask(change.task, change.when);
    },
    show: async (queryClient, { task, tags, goals, when }: Change<AddChange>) => {
      const labels = showLabels(queryClient, tags, goals, when.at);
      const saved = await changeTrees(queryClient, (all) => {
        const node = draftNode(task, {
          ...when,
          lists: queryClient.getQueryData<List[]>(["lists"]) ?? [],
          todayPoints: queryClient.getQueryData<PointsSummary>(POINTS)?.todayPoints ?? 2,
          parent: task.parentId ? findNode(all, task.parentId) : null,
        });
        const placed = insertedInTrees(all, node, { parentId: node.parentId, listId: node.listId, index: task.index });
        return task.weekDay ? placedInWeek(placed, task.id, task.weekDay, task.weekAfter, when.day) : placed;
      });
      return [...labels, ...saved];
    },
    refresh: [...TASK_DATA, TAGS, GOALS],
    name: ({ task }: Change<AddChange>) => `the new task ${quoted(task.title)}`,
  },
  edit: {
    send: async (change: Change<EditChange>) => {
      await sendLabels(change);
      await tasksApi.updateTask(change.id, change.changes, change.when);
      if (change.move) await tasksApi.moveTask(change.id, change.move, change.when);
    },
    show: async (queryClient, { id, tags, goals, changes, move, when }: Change<EditChange>) => {
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
    send: ({ id, changes, when }: Change<{ id: string; changes: tasksApi.TaskChanges }>) => tasksApi.updateTask(id, changes, when),
    show: (queryClient, { id, changes, when }: Change<{ id: string; changes: tasksApi.TaskChanges }>) =>
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
    send: ({ id, done, when }: Change<{ id: string; done: boolean }>) =>
      tasksApi.toggleTask(id, done, when),
    // Ticking shows at once: the row, its parents' "x/y done", deadline pills and any open countdown table.
    show: async (queryClient, { id, done: ticks, when }: Change<{ id: string; done: boolean }>) => {
      await Promise.all([TASKS, COUNTDOWN, ["pressure"]].map((queryKey) => queryClient.cancelQueries({ queryKey })));
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
    name: ({ done }: Change<{ done: boolean }>, title) => `${done ? "the tick on" : "unticking"} ${quoted(title)}`,
    popup: true,
    // An untick is not a task done.
    onSaved: (queryClient, task) => {
      const { isComplete, doneToday } = task as { isComplete: boolean; doneToday: number };
      if (isComplete) taskDone(doneToday, breakEvery(queryClient));
    },
  },
  press: {
    send: ({ id, completionId, when }: Change<PressChange>) => tasksApi.pressTask(id, completionId, when),
    show: (queryClient, { id, completionId, when }: Change<PressChange>) =>
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
    send: ({ id, completionId, when }: Change<PressChange>) => tasksApi.undoPress(id, completionId, when),
    show: (queryClient, { id, completionId }: Change<PressChange>) =>
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
    send: ({ id, today, when }: Change<{ id: string; today: boolean }>) => tasksApi.updateTask(id, { today }, when),
    show: (queryClient, { id, today, when }: Change<{ id: string; today: boolean }>) =>
      changeTrees(queryClient, (all) => {
        const node = findNode(all, id);
        return node ? editedInTrees(all, id, patchFor(node, { today }, when.day)) : all;
      }),
    refresh: [TASKS],
    name: ({ today }: Change<{ today: boolean }>, title) => `${quoted(title)} ${today ? "into" : "out of"} Today`,
  },
  week: {
    send: ({ id, week, when }: Change<{ id: string; week: boolean }>) => tasksApi.updateTask(id, { week }, when),
    // One coming in goes last on today.
    show: (queryClient, { id, week, when }: Change<{ id: string; week: boolean }>) =>
      changeTrees(queryClient, (all) =>
        !week
          ? mapNodes(all, (node) => (node.id === id ? { ...node, weekDay: null } : node))
          : findNode(all, id)?.weekDay
            ? all
            : placedInWeek(all, id, when.day, undefined, when.day),
      ),
    refresh: [TASKS],
    name: ({ week }: Change<{ week: boolean }>, title) => `${quoted(title)} ${week ? "into" : "out of"} the Week box`,
  },
  round: {
    send: ({ id, from, to, when }: Change<{ id: string; from: string; to: string }>) => tasksApi.moveRound(id, from, to, when),
    show: (queryClient, { id, from, to }: Change<{ id: string; from: string; to: string }>) =>
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
    send: ({ id, day, after, when }: Change<{ id: string; day: string; after?: string | null }>) => tasksApi.placeInWeek(id, day, after, when),
    show: (queryClient, { id, day, after, when }: Change<{ id: string; day: string; after?: string | null }>) =>
      changeTrees(queryClient, (all) => placedInWeek(all, id, day, after, when.day)),
    refresh: [TASKS],
    name: (_change, title) => `${quoted(title)} in the Week box`,
  },
  move: {
    send: ({ id, placement, when }: Change<{ id: string; placement: tasksApi.TaskPlacement }>) => tasksApi.moveTask(id, placement, when),
    show: (queryClient, { id, placement }: Change<{ id: string; placement: tasksApi.TaskPlacement }>) =>
      changeTrees(queryClient, (all) => movedInTrees(all, id, placement)),
    refresh: TASK_DATA,
    name: (_change, title) => `moving ${quoted(title)}`,
  },
  delete: {
    send: ({ id, when }: Change<{ id: string }>) => tasksApi.deleteTask(id, when),
    show: (queryClient, { id }: Change<{ id: string }>) =>
      changeTrees(queryClient, (all) => {
        const { trees: without, spot } = removedFromTrees(all, id);
        if (spot) deletedSpots.set(id, spot);
        return without;
      }),
    refresh: TASK_DATA,
    name: (_change, title) => `deleting ${quoted(title)}`,
  },
  restore: {
    send: ({ id, when }: Change<{ id: string }>) => tasksApi.restoreTask(id, when),
    show: (queryClient, { id }: Change<{ id: string }>) =>
      changeTrees(queryClient, (all) => {
        const spot = deletedSpots.get(id);
        if (!spot || findNode(all, id)) return all;
        deletedSpots.delete(id);
        return insertedInTrees(all, spot.node, spot);
      }),
    refresh: TASK_DATA,
    name: (_change, title) => `bringing back ${quoted(title)}`,
  },
  // A new note goes first, as the server puts it.
  noteAdd: {
    send: ({ when, ...note }: Change<notesApi.NewNote>) => notesApi.createNote(note, when),
    show: (queryClient, { when, ...note }: Change<notesApi.NewNote>) =>
      changeNotes(queryClient, (all) => [
        { title: "", text: "", noteFolderId: null, ...note, position: Math.min(1, ...all.map((n) => n.position)) - 1, createdAt: when.at, updatedAt: when.at },
        ...all,
      ]),
    refresh: [NOTES],
    name: ({ title }: Change<notesApi.NewNote>) => `the new note${title ? ` ${quoted(title)}` : ""}`,
  },
  noteEdit: {
    send: ({ id, changes, when }: Change<NoteEditChange>) => notesApi.updateNote(id, changes, when),
    show: (queryClient, { id, changes, when }: Change<NoteEditChange>) =>
      changeNotes(queryClient, (all) => all.map((note) => (note.id === id ? { ...note, ...changes, updatedAt: when.at } : note))),
    refresh: [NOTES],
    name: ({ changes }: Change<NoteEditChange>) => `the change to ${noteName(changes.title)}`,
  },
  noteDelete: {
    send: ({ id, when }: Change<{ id: string }>) => notesApi.deleteNote(id, when),
    show: (queryClient, { id }: Change<{ id: string }>) =>
      changeNotes(queryClient, (all) => all.filter((n) => n.id !== id)),
    refresh: [NOTES],
    name: () => "deleting a note",
  },
};

/** After how many tasks done in a day the user wants to be reminded to take a break; null = never. */
const breakEvery = (queryClient: QueryClient) => queryClient.getQueryData<User | null>(ME)?.breakEvery ?? null;

/** A task's title for the notice, from the trees or the change itself. */
function titleOf(queryClient: QueryClient, change: Change<{ id?: string; task?: { title: string } }>, saved: Saved | undefined) {
  if (change.task) return change.task.title;
  const before = saved?.find(([key]) => key === TASKS)?.[1] as TaskTreeNode[] | undefined;
  return findNode(trees(queryClient) ?? [], change.id ?? "")?.title ?? findNode(before ?? [], change.id ?? "")?.title ?? "a task";
}

/** Waits a little longer each time, up to half a minute, while the server can't be reached. */
const retryDelay = (attempt: number) => Math.min(30_000, 1000 * 2 ** attempt);

/** Registers how each change is sent, shown and refreshed; once, before anything is rendered or read back. */
export function registerChanges(queryClient: QueryClient) {
  queryClient.getMutationCache().subscribe((event) => {
    if (event.type !== "updated" || !isChange(event.mutation) || !event.mutation.state.variables) return;
    // A pause online is only its turn coming after the change before it.
    const offline = event.action.type === "pause" && !onlineManager.isOnline();
    if (offline || event.action.type === "failed") waited.add(event.mutation.state.variables);
  });
  for (const [kind, spec] of Object.entries(specs) as [keyof typeof CHANGE, Spec<any>][]) {
    queryClient.setMutationDefaults([...CHANGE[kind]], {
      mutationFn: (change: Change<unknown>) => spec.send(change),
      scope: { id: CHANGES_SCOPE },
      // While the server can't be reached the change waits (paused while offline) and is sent again; a refusal is final.
      // Logged out meanwhile (the session ran out): it waits for the same user to log back in (hooks/useAuth).
      retry: (_count, error) => isUnreachable(error) || (error instanceof ApiError && error.status === 401),
      retryDelay,
      onMutate: (change: Change<unknown>) => spec.show?.(queryClient, change) ?? [],
      onSuccess: (result: unknown, change: Change<unknown>) => {
        if (isFresh(change)) spec.onSaved?.(queryClient, result, change);
      },
      onError: (error: Error, change: Change<any>, saved: Saved | undefined) => {
        if (isFresh(change)) {
          // Just clicked: back to how it was, and why next to the click (or in the box that made it).
          if (spec.popup) refuse(error);
          for (const [queryKey, data] of saved ?? []) queryClient.setQueryData(queryKey, data);
          return;
        }
        // Made a while ago (offline, most likely): changes made after it build on what it showed, so nothing is put
        // back by hand; the refresh once the queue is empty shows the server's own. Said in the notice at the top.
        const what = `${spec.name(change, titleOf(queryClient, change, saved))}: ${error.message}`;
        const earlier = getServerStatus().failure;
        reportFailure(earlier?.startsWith("Couldn't save") ? `${earlier}; ${what}` : `Couldn't save ${what}`);
      },
      onSettled: () => {
        for (const queryKey of spec.refresh) toRefresh.set(JSON.stringify(queryKey), queryKey);
        // This one is still counted until it has settled.
        if (changesWaiting(queryClient) > 1) return;
        const keys = [...toRefresh.values()];
        toRefresh.clear();
        return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      },
    });
  }
}
