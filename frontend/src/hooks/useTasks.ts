import { keepPreviousData, onlineManager, useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import * as foldersApi from "../api/folders";
import * as goalsApi from "../api/goals";
import * as listsApi from "../api/lists";
import * as notesApi from "../api/notes";
import * as tagsApi from "../api/tags";
import * as tasksApi from "../api/tasks";
import { localDate, whenNow } from "../api/client";
import { NAME_FOLDER_EVENT } from "../lib/folders";
import { CHANGE, newId, type AddChange, type Change, type EditChange, type NoteEditChange, type NotesData, type PressChange } from "../lib/offline/changes";
import { parseShortSyntax, parseTitleEdit, type SyntaxContext } from "../lib/shortSyntax";
import type { DashboardLayout } from "../lib/tileLayout";
import type { Folder, Goal, List, Tag, TaskTreeNode } from "../types";
import { COUNTDOWN, DONE, FOLDERS, GOALS, LAYOUT, LISTS, NOTES, POINTS, PRESSURE, STATS, TAGS, TASK_DATA, TASKS } from "./queryKeys";

export const useTaskTrees = () => useQuery({ queryKey: TASKS, queryFn: tasksApi.listTaskTrees });
/** The Done page: a few days of ticks at a time, newest first; fetchNextPage brings the days before. */
export const useDonePages = () =>
  useInfiniteQuery({
    queryKey: DONE,
    queryFn: ({ pageParam }) => tasksApi.listDone(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
  });
/** What was ticked or pressed on one day; pass `enabled` false for the days the task trees cover. */
export const useDoneOn = (day: string, enabled = true) =>
  useQuery({ queryKey: [...DONE, day], queryFn: () => tasksApi.listDoneOn(day), enabled });
/** Every task, cut down for the stats. */
export const useStatRows = () => useQuery({ queryKey: STATS, queryFn: tasksApi.listStatRows });
/** The tasks of the site's search. Under the tasks' key, so a change to any task asks again; nothing is asked for an empty `q`. */
export const useTaskSearch = (q: string) =>
  useQuery({ queryKey: [...TASKS, "search", q], queryFn: () => tasksApi.searchTasks(q), enabled: q !== "", placeholderData: keepPreviousData });
export const useGoals = () => useQuery({ queryKey: GOALS, queryFn: goalsApi.listGoals });
export const useTags = () => useQuery({ queryKey: TAGS, queryFn: tagsApi.listTags });
export const useLists = () => useQuery({ queryKey: LISTS, queryFn: listsApi.listLists });
export const useFolders = () => useQuery({ queryKey: FOLDERS, queryFn: foldersApi.listFolders });
export const useLayout = (page: tasksApi.LayoutPage = "dashboard") =>
  useQuery({ queryKey: [...LAYOUT, page], queryFn: () => tasksApi.getLayout(page) });
/** The new arrangement shows at once and is saved in the background. */
export function useSaveLayout(page: tasksApi.LayoutPage = "dashboard") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (layout: DashboardLayout) => tasksApi.saveLayout(page, layout),
    onMutate: (layout: DashboardLayout) => {
      queryClient.setQueryData([...LAYOUT, page], layout);
    },
    onError: () => queryClient.invalidateQueries({ queryKey: [...LAYOUT, page] }),
  });
}
export const usePoints = () => useQuery({ queryKey: POINTS, queryFn: tasksApi.getPoints });
// Changes what every Today-only task without its own amount is worth.
export const useSetTodayPoints = () => useInvalidating(tasksApi.setTodayPoints, [POINTS, TASKS]);
export const usePressure = () => useQuery({ queryKey: PRESSURE, queryFn: tasksApi.getPressure });
/** Kept under the countdown key so every task change refreshes it too. */
export const useCombinedCountdown = () => useQuery({ queryKey: [...COUNTDOWN, "all"], queryFn: tasksApi.getCombinedCountdown });

/** Only tasks with a hard deadline have a countdown; pass `enabled` false for the rest. */
export const useCountdown = (taskId: string, enabled = true) =>
  useQuery({ queryKey: [...COUNTDOWN, taskId], queryFn: () => tasksApi.getCountdown(taskId), retry: false, enabled });

/** `onError`: for the mutations whose refusal shows in the popup next to the click. */
function useInvalidating<TArgs, TResult>(mutationFn: (args: TArgs) => Promise<TResult>, keys: string[][], onError?: (error: Error) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: TArgs) => mutationFn(args),
    onError,
    onSettled: () => Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  });
}

/** How deep a task under `parentId` sits: 0 for a main task. A parent that isn't among the loaded trees counts as a main task. */
function depthUnder(trees: TaskTreeNode[], parentId: string | null | undefined) {
  if (!parentId) return 0;
  const find = (nodes: TaskTreeNode[], depth: number): number | null => {
    for (const node of nodes) {
      const found = node.id === parentId ? depth : find(node.children, depth + 1);
      if (found !== null) return found;
    }
    return null;
  };
  return (find(trees, 0) ?? 0) + 1;
}

/** What the shortcuts typed into a new task under `parentId` (none = a main task) are read against. */
export function useSyntaxContext(parentId?: string | null): SyntaxContext {
  const { data: tags } = useTags();
  const { data: goals } = useGoals();
  const { data: lists } = useLists();
  const { data: trees } = useTaskTrees();
  const today = localDate();
  return useMemo(
    () => ({ today, tags: tags ?? [], goals: goals ?? [], lists: lists ?? [], depth: depthUnder(trees ?? [], parentId) }),
    [today, tags, goals, lists, trees, parentId],
  );
}

/**
 * One of the everyday changes to tasks that also work offline (lib/offline/changes: how each is sent and shown at
 * once). `mutate` stamps it with the day and moment it was made. It may wait to be sent, so nothing should wait
 * for it: what it changes is on the page already.
 */
function useChange<V>(key: readonly string[]) {
  const mutation = useMutation<unknown, Error, Change<V>>({ mutationKey: [...key] });
  const { mutate: send } = mutation;
  const mutate = useCallback((change: V, options?: { onError?: (error: Error) => void }) => send({ ...change, when: whenNow() }, options), [send]);
  return { ...mutation, mutate };
}

/** The tags, goals and lists the shortcuts are read against: those kept on the device when offline, rather than waiting for the server. */
async function syntaxLists(queryClient: QueryClient) {
  const get = <T,>(queryKey: string[], queryFn: () => Promise<T[]>) =>
    onlineManager.isOnline() ? queryClient.ensureQueryData<T[]>({ queryKey, queryFn }) : Promise.resolve(queryClient.getQueryData<T[]>(queryKey) ?? []);
  // Asked for if they were never loaded: a name must not be taken for new because its list is missing.
  const [tags, goals, lists] = await Promise.all([get<Tag>(TAGS, tagsApi.listTags), get<Goal>(GOALS, goalsApi.listGoals), get<List>(LISTS, listsApi.listLists)]);
  return { tags, goals, lists, trees: queryClient.getQueryData<TaskTreeNode[]>(TASKS) ?? [] };
}

const labelsNamed = (names: string[]) => names.map((name) => ({ id: newId(), name }));

/** A new task as it was typed, shortcuts and all, and where it goes. */
export interface TypedTask extends Omit<tasksApi.NewTask, "title"> {
  text: string;
}

/**
 * Adds a task from what was typed into an add field: the shortcuts in it (#tag, @date, ... see lib/shortSyntax)
 * are taken out of the title and set on the task, in the one request that makes it. Tags and goals named for the
 * first time are made first. What the caller passes (the filter's labels, the calendar's day, the box's list) is
 * what holds unless a shortcut says otherwise. `add` resolves with the new task's id once it shows.
 */
export function useAddTask() {
  const queryClient = useQueryClient();
  const change = useChange<AddChange>(CHANGE.add);
  const [typo, setTypo] = useState<Error | null>(null);
  const { mutate } = change;

  const add = useCallback(
    async ({ text, ...place }: TypedTask, options?: { onError?: (error: Error) => void }): Promise<string> => {
      try {
        const { tags, goals, lists, trees } = await syntaxLists(queryClient);
        const typed = parseShortSyntax(text, { today: localDate(), tags, goals, lists, depth: depthUnder(trees, place.parentId) });
        if (!typed.title) throw new Error("A task needs a title too, not only shortcuts");
        setTypo(null);
        const newTags = labelsNamed(typed.newTags);
        const newGoals = labelsNamed(typed.newGoals);
        const movesList = typed.listId !== undefined && typed.listId !== place.listId;
        const task = {
          ...place,
          id: newId(),
          title: typed.title,
          // In another list than the one typed in, it goes to the end: the place was counted for this one.
          ...(movesList && { listId: typed.listId, index: undefined }),
          tagIds: [...new Set([...(place.tagIds ?? []), ...typed.tagIds, ...newTags.map((tag) => tag.id)])],
          goalIds: [...new Set([...(place.goalIds ?? []), ...typed.goalIds, ...newGoals.map((goal) => goal.id)])],
          // A persistent task and a deadline don't go together, so a typed schedule (or @persistent) drops the day the caller gave.
          deadlineDate: typed.repeat || typed.persistent ? undefined : (typed.deadlineDate ?? place.deadlineDate),
          deadlineType: typed.deadlineDate ? typed.deadlineType : place.deadlineType,
          points: typed.points,
          today: typed.today || undefined,
          isPersistent: typed.persistent || undefined,
          repeatEvery: typed.repeat?.every,
          repeatUnit: typed.repeat?.unit,
          nextDue: typed.repeat?.nextDue,
          notes: typed.notes,
        };
        mutate({ tags: newTags, goals: newGoals, task }, options);
        return task.id;
      } catch (error) {
        setTypo(error as Error);
        options?.onError?.(error as Error);
        throw error;
      }
    },
    [queryClient, mutate],
  );
  return { add, mutate: (typed: TypedTask, options?: { onError?: (error: Error) => void }) => void add(typed, options).catch(() => {}), error: typo ?? change.error };
}

/**
 * Saves the edited title of a task that exists. Shortcuts typed into it are taken out and set on the task, as when
 * adding one: tags and goals join the ones it has, a typed note goes under the note it has, a deadline, points or a
 * schedule take the place of its own, and /list moves it to the end of that list. What stood in the title already
 * stays text (parseTitleEdit). `onApplied` hears the title as it is saved, shortcuts taken out.
 */
export function useEditTask() {
  const queryClient = useQueryClient();
  const change = useChange<EditChange>(CHANGE.edit);
  const [typo, setTypo] = useState<Error | null>(null);
  const { mutate } = change;

  const edit = useCallback(
    async ({ node, text }: { node: TaskTreeNode; text: string }, options?: { onApplied?: (title: string) => void; onError?: (error: Error) => void }) => {
      try {
        const { tags, goals, lists, trees } = await syntaxLists(queryClient);
        const typed = parseTitleEdit(text, node.title, { today: localDate(), tags, goals, lists, depth: depthUnder(trees, node.parentId) });
        if (!typed.title) throw new Error("A task needs a title too, not only shortcuts");
        setTypo(null);
        const newTags = labelsNamed(typed.newTags);
        const newGoals = labelsNamed(typed.newGoals);
        const tagIds = [...new Set([...node.tagIds, ...typed.tagIds, ...newTags.map((tag) => tag.id)])];
        const goalIds = [...new Set([...node.goalIds, ...typed.goalIds, ...newGoals.map((goal) => goal.id)])];
        const changes: tasksApi.TaskChanges = {
          title: typed.title,
          ...(tagIds.length > node.tagIds.length && { tagIds }),
          ...(goalIds.length > node.goalIds.length && { goalIds }),
          ...(typed.deadlineDate && { deadlineDate: typed.deadlineDate, deadlineType: typed.deadlineType }),
          points: typed.points,
          today: typed.today || undefined,
          ...(typed.persistent && { isPersistent: true }),
          ...(typed.repeat && { repeatEvery: typed.repeat.every, repeatUnit: typed.repeat.unit, nextDue: typed.repeat.nextDue }),
          ...(typed.notes && { notes: node.notes ? `${node.notes}\n${typed.notes}` : typed.notes }),
        };
        const moves = typed.listId !== undefined && typed.listId !== node.listId;
        const last = moves ? trees.filter((tree) => tree.listId === typed.listId && tree.id !== node.id).length : 0;
        mutate({ id: node.id, tags: newTags, goals: newGoals, changes, move: moves ? { parentId: null, listId: typed.listId!, index: last } : null }, options);
        options?.onApplied?.(typed.title);
      } catch (error) {
        setTypo(error as Error);
        options?.onError?.(error as Error);
      }
    },
    [queryClient, mutate],
  );
  return { mutate: (args: { node: TaskTreeNode; text: string }, options?: { onApplied?: (title: string) => void; onError?: (error: Error) => void }) => void edit(args, options), error: typo ?? change.error };
}

/** Ticks (`done`) or unticks a task; shows at once, with its parents' counts, deadline pills and open countdown tables. */
export const useToggleTask = () => useChange<{ id: string; done: boolean }>(CHANGE.toggle);
/** One press of a persistent task's "done it" button; `completionId` is made by the caller (newId), for its undo. */
export const usePressTask = () => useChange<PressChange>(CHANGE.press);
export const useUndoPress = () => useChange<PressChange>(CHANGE.undoPress);
export const useDeleteTask = () => useChange<{ id: string }>(CHANGE.delete);
export const useRestoreTask = () => useChange<{ id: string }>(CHANGE.restore);
export const useUpdateTask = () => useChange<{ id: string; changes: tasksApi.TaskChanges }>(CHANGE.update);
/** In or out of Today. */
export const useSetToday = () => useChange<{ id: string; today: boolean }>(CHANGE.today);
/** In or out of the Week box; one coming in goes last on today. */
export const useSetWeek = () => useChange<{ id: string; week: boolean }>(CHANGE.week);
/** A round of a task on a schedule moved to another day in Week (`to` = `from`: back on its own day). */
export const useMoveRound = () => useChange<{ id: string; from: string; to: string }>(CHANGE.round);
/** A place in the Week box: on `day`, right after `after` (null = first, undefined = last); a task not in it yet comes in. */
export const usePlaceInWeek = () => useChange<{ id: string; day: string; after?: string | null }>(CHANGE.placeInWeek);
export const useMoveTask = () => useChange<{ id: string; placement: tasksApi.TaskPlacement }>(CHANGE.move);

export const useCreateGoal = () => useInvalidating((body: { name: string; description?: string | null }) => goalsApi.createGoal(body), [GOALS]);
// Deleting a goal unlinks it from its tasks.
export const useDeleteGoal = () => useInvalidating(goalsApi.deleteGoal, [GOALS, TASKS]);

export const useCreateTag = () => useInvalidating((name: string) => tagsApi.createTag(name), [TAGS]);
export const useDeleteTag = () => useInvalidating(tagsApi.deleteTag, [TAGS, TASKS]);

// A folder made by dropping a box on "New" shows that box.
export const useCreateFolder = () => useInvalidating(foldersApi.createFolder, [FOLDERS]);
/** Name, colour, arrangement or views: shows at once and is saved in the background. */
export function useUpdateFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: foldersApi.FolderChanges }) => foldersApi.updateFolder(id, changes),
    onMutate: ({ id, changes }) => {
      queryClient.setQueryData<Folder[]>(FOLDERS, (folders) => folders?.map((folder) => (folder.id === id ? { ...folder, ...changes } : folder)));
    },
    onError: () => queryClient.invalidateQueries({ queryKey: FOLDERS }),
  });
}
// Removing a folder removes its tab only.
export const useDeleteFolder = () => useInvalidating(foldersApi.deleteFolder, [FOLDERS]);

/**
 * What a box dropped on a tab of the task bar does (TileGrid's onDropOnTab). On a folder's tab: the folder shows
 * it too, a copy, the box stays where it is. On "New": a folder is made that shows it, and asks for its name.
 * On "Tasks", from a folder's own page (`openFolderId`): that folder stops showing it.
 */
export function useDropOnTab(openFolderId: string | null = null) {
  const { data: folders = [] } = useFolders();
  const createFolder = useCreateFolder();
  const updateFolder = useUpdateFolder();
  function dropOnTab(view: string, tab: string) {
    if (tab === "new") {
      createFolder.mutate({ views: [view] }, { onSuccess: (made) => window.dispatchEvent(new CustomEvent(NAME_FOLDER_EVENT, { detail: made.id })) });
      return;
    }
    const folder = folders.find((f) => f.id === (tab === "main" ? openFolderId : tab));
    if (!folder) return;
    const shows = folder.views.includes(view);
    if (tab === "main") updateFolder.mutate({ id: folder.id, changes: { views: folder.views.filter((other) => other !== view) } });
    else if (!shows) updateFolder.mutate({ id: folder.id, changes: { views: [...folder.views, view] } });
  }
  return { dropOnTab, error: createFolder.error ?? updateFolder.error };
}

/** The free-standing notes and the Notes page's folders. */
export const useNotes = () => useQuery<NotesData>({ queryKey: NOTES, queryFn: notesApi.listNotes });
// Writing notes works offline too (lib/offline/changes); a new note's id is made here, so it can be written in at once.
export function useAddNote() {
  const change = useChange<notesApi.NewNote>(CHANGE.noteAdd);
  const { mutate } = change;
  const add = useCallback((note: Omit<notesApi.NewNote, "id"> = {}) => {
    const id = newId();
    mutate({ ...note, id });
    return id;
  }, [mutate]);
  return { ...change, mutate: add };
}
export const useEditNote = () => useChange<NoteEditChange>(CHANGE.noteEdit);
export const useDeleteNote = () => useChange<{ id: string }>(CHANGE.noteDelete);
// The Notes page's folders need a connection, like the task bar's.
export const useCreateNoteFolder = () => useInvalidating(notesApi.createNoteFolder, [NOTES]);
/** Name or colour: shows at once and is saved in the background. */
export function useUpdateNoteFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: notesApi.NoteFolderChanges }) => notesApi.updateNoteFolder(id, changes),
    onMutate: ({ id, changes }) => {
      queryClient.setQueryData<NotesData>(NOTES, (data) =>
        data && { ...data, noteFolders: data.noteFolders.map((folder) => (folder.id === id ? { ...folder, ...changes } : folder)) },
      );
    },
    onError: () => queryClient.invalidateQueries({ queryKey: NOTES }),
  });
}
// Its notes stay, back under "All".
export const useDeleteNoteFolder = () => useInvalidating(notesApi.deleteNoteFolder, [NOTES]);

// A list made on a folder's page is shown by that folder.
export const useCreateList = () => useInvalidating(listsApi.createList, [LISTS, FOLDERS]);
// A list's kind and default decide what its tasks are worth.
export const useUpdateList = () =>
  useInvalidating(
    ({ id, changes }: { id: string; changes: listsApi.ListChanges }) => listsApi.updateList(id, changes),
    [LISTS, TASKS],
  );
// A list takes its tasks with it, and brings them back on restore.
export const useDeleteList = () => useInvalidating(listsApi.deleteList, [LISTS, ...TASK_DATA]);
export const useRestoreList = () => useInvalidating(listsApi.restoreList, [LISTS, ...TASK_DATA]);
