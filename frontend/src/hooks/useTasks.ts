import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import * as foldersApi from "../api/folders";
import * as goalsApi from "../api/goals";
import * as listsApi from "../api/lists";
import * as tagsApi from "../api/tags";
import * as tasksApi from "../api/tasks";
import { localDate } from "../api/client";
import { findNode, toggleInCountdown, toggleInTrees, type CompletionChange } from "../lib/optimisticToggle";
import { NAME_FOLDER_EVENT } from "../lib/folders";
import type { DashboardLayout } from "../lib/tileLayout";
import type { Countdown, DonePage, Folder, TaskTreeNode } from "../types";

const TASKS = ["tasks"];
// What was done before yesterday is loaded apart from the task trees. These sit under their key, so whatever refreshes the trees refreshes them.
const DONE = [...TASKS, "done"];
const STATS = [...TASKS, "stats"];
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
      // The Done page unticks tasks finished long ago, which only its own pages hold.
      const done = queryClient.getQueryData<InfiniteData<DonePage>>(DONE);
      const node = findNode(trees ?? [], id) ?? findNode(done?.pages.flatMap((page) => page.tasks) ?? [], id);
      if (!node) return;

      const today = localDate();
      const change: CompletionChange = { id, was: node.completedOn, now: node.isComplete ? null : today };
      const countdowns = queryClient.getQueriesData<Countdown>({ queryKey: COUNTDOWN });
      if (trees) queryClient.setQueryData(TASKS, toggleInTrees(trees, change, today));
      if (done) {
        const pages = done.pages.map((page) => ({ ...page, tasks: toggleInTrees(page.tasks, change, today) }));
        queryClient.setQueryData(DONE, { ...done, pages });
      }
      for (const [queryKey, countdown] of countdowns) {
        const owner = findNode(trees ?? [], String(queryKey[1]));
        if (countdown && owner && findNode([owner], id)) queryClient.setQueryData(queryKey, toggleInCountdown(countdown, change));
      }
      return { trees, done, countdowns };
    },
    onError: (_error, _id, saved) => {
      if (!saved) return;
      if (saved.trees) queryClient.setQueryData(TASKS, saved.trees);
      if (saved.done) queryClient.setQueryData(DONE, saved.done);
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
