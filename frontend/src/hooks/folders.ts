import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as foldersApi from "../api/folders";
import { NAME_FOLDER_EVENT } from "../lib/folders";
import type { Folder } from "../types";
import { useInvalidating } from "./mutations";
import { FOLDERS } from "./queryKeys";

export const useFolders = () => useQuery({ queryKey: FOLDERS, queryFn: foldersApi.listFolders });

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
/** The tabs dragged into another order (every folder's id, left to right): shows at once and is saved in the background. */
export function useReorderFolders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: foldersApi.reorderFolders,
    onMutate: (ids) => {
      queryClient.setQueryData<Folder[]>(FOLDERS, (folders) => folders && [...folders].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)));
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
