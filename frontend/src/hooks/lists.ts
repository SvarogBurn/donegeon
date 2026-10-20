import { useQuery } from "@tanstack/react-query";
import * as listsApi from "../api/lists";
import { useInvalidating } from "./mutations";
import { FOLDERS, LISTS, TASK_DATA, TASKS } from "./queryKeys";

export const useLists = () => useQuery({ queryKey: LISTS, queryFn: listsApi.listLists });

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
