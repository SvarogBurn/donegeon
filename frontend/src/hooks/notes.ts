import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import * as notesApi from "../api/notes";
import { newId } from "../lib/offline/changes";
import type { NotesData } from "../lib/offline/noteChanges";
import { useChange, useInvalidating } from "./mutations";
import { NOTES } from "./queryKeys";

/** The free-standing notes and the Notes page's folders. */
export const useNotes = () => useQuery<NotesData>({ queryKey: NOTES, queryFn: notesApi.listNotes });
// Writing notes works offline too (lib/offline/changes); a new note's id is made here, so it can be written in at once.
export function useAddNote() {
  const change = useChange("noteAdd");
  const { mutate } = change;
  const add = useCallback((note: Omit<notesApi.NewNote, "id"> = {}) => {
    const id = newId();
    mutate({ ...note, id });
    return id;
  }, [mutate]);
  return { ...change, mutate: add };
}
export const useEditNote = () => useChange("noteEdit");
export const useDeleteNote = () => useChange("noteDelete");
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
