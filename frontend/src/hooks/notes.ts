import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import * as notesApi from "../api/notes";
import type { NoteScreenState } from "../components/Notes/NoteScreen";
import { newId } from "../lib/offline/changes";
import { readStored, writeStored } from "../lib/storage";
import type { NotesData } from "../lib/offline/noteChanges";
import { useChange, useInvalidating } from "./mutations";
import { NOTES } from "./queryKeys";
import type { NoteFolder } from "../types";

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
const FOLDER_KEY = "donegeon.noteFolder";
/** The Notes page's folder picked last on this device (null: All), shown again when the page is opened. */
export const rememberNoteFolder = (id: string | null) => writeStored(FOLDER_KEY, id);
/**
 * The Notes page's folder that is shown (`?folder=<id>`; opened without one, the folder picked last), or null for All;
 * a folder that was removed shows All too.
 */
export function pickedFolderId(search: URLSearchParams, noteFolders: NoteFolder[]): string | null {
  const id = search.get("folder") ?? readStored(FOLDER_KEY);
  return noteFolders.some((folder) => folder.id === id) ? id : null;
}
/**
 * "+ New note" on the Notes page, and the installed app's "+" there: a note made in the folder that is shown, opened to
 * be written in. The folders are read from what the page has loaded, at the click (so the bar doesn't load the notes).
 */
export function useNewNote() {
  const { mutate } = useAddNote();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { search } = useLocation();
  return useCallback(() => {
    const noteFolders = queryClient.getQueryData<NotesData>(NOTES)?.noteFolders ?? [];
    const id = mutate({ noteFolderId: pickedFolderId(new URLSearchParams(search), noteFolders) });
    navigate(`/notes/${id}`, { state: { fresh: true } satisfies NoteScreenState });
  }, [mutate, queryClient, navigate, search]);
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
/** The folders in another order (`ids` left to right): shows at once and is saved in the background. */
export function useReorderNoteFolders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notesApi.reorderNoteFolders,
    onMutate: (ids) => {
      queryClient.setQueryData<NotesData>(NOTES, (data) =>
        data && { ...data, noteFolders: [...data.noteFolders].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)) },
      );
    },
    onError: () => queryClient.invalidateQueries({ queryKey: NOTES }),
  });
}
// Its notes stay, back under "All".
export const useDeleteNoteFolder = () => useInvalidating(notesApi.deleteNoteFolder, [NOTES]);
