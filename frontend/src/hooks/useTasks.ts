import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as foldersApi from "../api/folders";
import * as goalsApi from "../api/goals";
import * as listsApi from "../api/lists";
import * as tagsApi from "../api/tags";
import * as tasksApi from "../api/tasks";
import { localDate } from "../api/client";
import { findNode, toggleInCountdown, toggleInTrees, type CompletionChange } from "../lib/optimisticToggle";
import type { DashboardLayout } from "../lib/tileLayout";
import type { Countdown, Folder, TaskTreeNode } from "../types";

const TASKS = ["tasks"];
const GOALS = ["goals"];
const TAGS = ["tags"];
const LISTS = ["lists"];
const FOLDERS = ["folders"];
const COUNTDOWN = ["countdown"];
const PRESSURE = ["pressure"];
const POINTS = ["points"];
// Any change to a task can change the countdown tables, the dashboard totals and the point balance.
const TASK_DATA = [TASKS, COUNTDOWN, PRESSURE, POINTS];

export const useTaskTrees = () => useQuery({ queryKey: TASKS, queryFn: tasksApi.listTaskTrees });
export const useGoals = () => useQuery({ queryKey: GOALS, queryFn: goalsApi.listGoals });
export const useTags = () => useQuery({ queryKey: TAGS, queryFn: tagsApi.listTags });
export const useLists = () => useQuery({ queryKey: LISTS, queryFn: listsApi.listLists });
export const useFolders = () => useQuery({ queryKey: FOLDERS, queryFn: foldersApi.listFolders });
const LAYOUT = ["layout"];
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

// mutateAsync resolves only after the refetch, so callers can rely on fresh data.
function useInvalidating<TArgs, TResult>(mutationFn: (args: TArgs) => Promise<TResult>, keys: string[][]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  });
}

export const useCreateTask = () => useInvalidating(tasksApi.createTask, TASK_DATA);
/**
 * Ticking shows at once: the row, its parents' "x/y done", deadline pills and
 * any open countdown table change before the server answers, and roll back if it fails.
 */
export function useToggleTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: tasksApi.toggleTask,
    onMutate: async (id: string) => {
      await Promise.all([TASKS, COUNTDOWN, PRESSURE].map((queryKey) => queryClient.cancelQueries({ queryKey })));
      const trees = queryClient.getQueryData<TaskTreeNode[]>(TASKS);
      const node = trees && findNode(trees, id);
      if (!trees || !node) return;

      const today = localDate();
      const change: CompletionChange = { id, was: node.completedOn, now: node.isComplete ? null : today };
      const countdowns = queryClient.getQueriesData<Countdown>({ queryKey: COUNTDOWN });
      queryClient.setQueryData(TASKS, toggleInTrees(trees, change, today));
      for (const [queryKey, countdown] of countdowns) {
        const owner = findNode(trees, String(queryKey[1]));
        if (countdown && owner && findNode([owner], id)) queryClient.setQueryData(queryKey, toggleInCountdown(countdown, change));
      }
      return { trees, countdowns };
    },
    onError: (_error, _id, saved) => {
      if (!saved) return;
      queryClient.setQueryData(TASKS, saved.trees);
      for (const [queryKey, countdown] of saved.countdowns) queryClient.setQueryData(queryKey, countdown);
    },
    onSettled: () => Promise.all(TASK_DATA.map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  });
}
export const usePressTask = () => useInvalidating(tasksApi.pressTask, TASK_DATA);
export const useUndoPress = () =>
  useInvalidating(
    ({ id, completionId }: { id: string; completionId: string }) => tasksApi.undoPress(id, completionId),
    TASK_DATA,
  );
export const useDeleteTask = () => useInvalidating(tasksApi.deleteTask, TASK_DATA);
export const useRestoreTask = () => useInvalidating(tasksApi.restoreTask, TASK_DATA);
export const useUpdateTask = () =>
  useInvalidating(
    ({ id, changes }: { id: string; changes: tasksApi.TaskChanges }) => tasksApi.updateTask(id, changes),
    TASK_DATA,
  );
/** In or out of Today. Shows at once, before the server answers, and rolls back if it fails. */
export function useSetToday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, today }: { id: string; today: boolean }) => tasksApi.updateTask(id, { today }),
    onMutate: async ({ id, today }) => {
      await queryClient.cancelQueries({ queryKey: TASKS });
      const trees = queryClient.getQueryData<TaskTreeNode[]>(TASKS);
      if (!trees) return;
      const mark = (nodes: TaskTreeNode[]): TaskTreeNode[] =>
        nodes.map((node) =>
          node.id === id
            ? { ...node, todaySince: today ? (node.todaySince ?? localDate()) : null }
            : { ...node, children: mark(node.children) },
        );
      queryClient.setQueryData(TASKS, mark(trees));
      return { trees };
    },
    onError: (_error, _args, saved) => saved && queryClient.setQueryData(TASKS, saved.trees),
    onSettled: () => queryClient.invalidateQueries({ queryKey: TASKS }),
  });
}
export const useMoveTask = () =>
  useInvalidating(
    ({ id, placement }: { id: string; placement: tasksApi.TaskPlacement }) => tasksApi.moveTask(id, placement),
    TASK_DATA,
  );

export const useCreateGoal = () => useInvalidating(goalsApi.createGoal, [GOALS]);
// Deleting a goal unlinks it from its tasks.
export const useDeleteGoal = () => useInvalidating(goalsApi.deleteGoal, [GOALS, TASKS]);

export const useCreateTag = () => useInvalidating(tagsApi.createTag, [TAGS]);
export const useDeleteTag = () => useInvalidating(tagsApi.deleteTag, [TAGS, TASKS]);

// A folder made by dropping a list on "New" takes that list with it.
export const useCreateFolder = () => useInvalidating(foldersApi.createFolder, [FOLDERS, LISTS]);
/** Name, colour or arrangement: shows at once and is saved in the background. */
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
// Removing a folder puts its lists back on the Tasks page.
export const useDeleteFolder = () => useInvalidating(foldersApi.deleteFolder, [FOLDERS, LISTS]);

export const useCreateList = () => useInvalidating(listsApi.createList, [LISTS]);
// A list's kind and default decide what its tasks are worth.
export const useUpdateList = () =>
  useInvalidating(
    ({ id, changes }: { id: string; changes: listsApi.ListChanges }) => listsApi.updateList(id, changes),
    [LISTS, TASKS],
  );
// A list takes its tasks with it, and brings them back on restore.
export const useDeleteList = () => useInvalidating(listsApi.deleteList, [LISTS, ...TASK_DATA]);
export const useRestoreList = () => useInvalidating(listsApi.restoreList, [LISTS, ...TASK_DATA]);
