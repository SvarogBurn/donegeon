import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as goalsApi from "../api/goals";
import * as listsApi from "../api/lists";
import * as tagsApi from "../api/tags";
import * as tasksApi from "../api/tasks";
import { localDate } from "../api/client";
import { findNode, toggleInCountdown, toggleInTrees, type CompletionChange } from "../lib/optimisticToggle";
import type { Countdown, TaskTreeNode } from "../types";

const TASKS = ["tasks"];
const GOALS = ["goals"];
const TAGS = ["tags"];
const LISTS = ["lists"];
const COUNTDOWN = ["countdown"];
const PRESSURE = ["pressure"];
// Any change to a task can change the countdown tables and the dashboard totals.
const TASK_DATA = [TASKS, COUNTDOWN, PRESSURE];

export const useTaskTrees = () => useQuery({ queryKey: TASKS, queryFn: tasksApi.listTaskTrees });
export const useGoals = () => useQuery({ queryKey: GOALS, queryFn: goalsApi.listGoals });
export const useTags = () => useQuery({ queryKey: TAGS, queryFn: tagsApi.listTags });
export const useLists = () => useQuery({ queryKey: LISTS, queryFn: listsApi.listLists });
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
      await Promise.all(TASK_DATA.map((queryKey) => queryClient.cancelQueries({ queryKey })));
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
export const useDeleteTask = () => useInvalidating(tasksApi.deleteTask, TASK_DATA);
export const useRestoreTask = () => useInvalidating(tasksApi.restoreTask, TASK_DATA);
export const useUpdateTask = () =>
  useInvalidating(
    ({ id, changes }: { id: string; changes: tasksApi.TaskChanges }) => tasksApi.updateTask(id, changes),
    TASK_DATA,
  );
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

export const useCreateList = () => useInvalidating(listsApi.createList, [LISTS]);
export const useRenameList = () =>
  useInvalidating(({ id, name }: { id: string; name: string }) => listsApi.renameList(id, name), [LISTS]);
// A list takes its tasks with it, and brings them back on restore.
export const useDeleteList = () => useInvalidating(listsApi.deleteList, [LISTS, ...TASK_DATA]);
export const useRestoreList = () => useInvalidating(listsApi.restoreList, [LISTS, ...TASK_DATA]);
