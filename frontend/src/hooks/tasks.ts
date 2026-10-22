import { keepPreviousData, onlineManager, useInfiniteQuery, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import * as goalsApi from "../api/goals";
import * as listsApi from "../api/lists";
import * as tagsApi from "../api/tags";
import * as tasksApi from "../api/tasks";
import { localDate } from "../lib/clock";
import { newId } from "../lib/offline/changes";
import { parseShortSyntax, parseTitleEdit, type SyntaxContext } from "../lib/shortSyntax";
import type { Goal, List, Tag, TaskTreeNode } from "../types";
import { useGoals, useTags } from "./labels";
import { useLists } from "./lists";
import { useChange } from "./mutations";
import { COUNTDOWN, DONE, GOALS, LISTS, PRESSURE, STATS, TAGS, TASKS } from "./queryKeys";

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
/** Tasks done per day: the level and streak the task bar's face goes by. Under the tasks' key, so a tick asks again. */
export const useProgressDays = () => useQuery({ queryKey: [...TASKS, "progress"], queryFn: tasksApi.getProgressDays });
/** The tasks of the site's search. Under the tasks' key, so a change to any task asks again; nothing is asked for an empty `q`. */
export const useTaskSearch = (q: string) =>
  useQuery({ queryKey: [...TASKS, "search", q], queryFn: () => tasksApi.searchTasks(q), enabled: q !== "", placeholderData: keepPreviousData });
export const usePressure = () => useQuery({ queryKey: PRESSURE, queryFn: tasksApi.getPressure });
/** Kept under the countdown key so every task change refreshes it too. */
export const useCombinedCountdown = () => useQuery({ queryKey: [...COUNTDOWN, "all"], queryFn: tasksApi.getCombinedCountdown });

/** Only tasks with a hard deadline have a countdown; pass `enabled` false for the rest. */
export const useCountdown = (taskId: string, enabled = true) =>
  useQuery({ queryKey: [...COUNTDOWN, taskId], queryFn: () => tasksApi.getCountdown(taskId), retry: false, enabled });

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
  const change = useChange("add");
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
  const change = useChange("edit");
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
export const useToggleTask = () => useChange("toggle");
/** One press of a persistent task's "done it" button; `completionId` is made by the caller (newId), for its undo. */
export const usePressTask = () => useChange("press");
export const useUndoPress = () => useChange("undoPress");
export const useDeleteTask = () => useChange("delete");
export const useRestoreTask = () => useChange("restore");
export const useUpdateTask = () => useChange("update");
/** In or out of Today. */
export const useSetToday = () => useChange("today");
/** In or out of the Week box; one coming in goes last on today. */
export const useSetWeek = () => useChange("week");
/** A round of a task on a schedule moved to another day in Week (`to` = `from`: back on its own day). */
export const useMoveRound = () => useChange("round");
/** A place in the Week box: on `day`, right after `after` (null = first, undefined = last); a task not in it yet comes in. */
export const usePlaceInWeek = () => useChange("placeInWeek");
export const useMoveTask = () => useChange("move");
