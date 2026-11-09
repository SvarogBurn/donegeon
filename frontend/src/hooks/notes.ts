import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import * as notesApi from "../api/notes";
import type { NoteScreenState } from "../components/Notes/NoteScreen";
import { pathTo } from "../lib/noteFolders";
import { loadNotes } from "../lib/noteSync";
import { newId } from "../lib/offline/changes";
import { readStored, writeStored } from "../lib/storage";
import type { NotesData } from "../lib/offline/noteChanges";
import { useChange, useInvalidating } from "./mutations";
import { NOTES } from "./queryKeys";
import type { NoteFolder } from "../types";

/** The free-standing notes and the Notes page's folders; after the first answer, only the notes changed are asked for. */
export function useNotes(enabled = true) {
  const queryClient = useQueryClient();
  return useQuery<NotesData>({ queryKey: NOTES, queryFn: () => loadNotes(queryClient.getQueryData<NotesData>(NOTES)), enabled });
}
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
/**
 * The Notes page's folder that is shown (`?folder=<id>`, `?folder=` for All; opened without one, the folder picked last
 * on this device), or null for All; a folder that was removed shows All too.
 */
export function pickedFolderId(search: URLSearchParams, noteFolders: NoteFolder[]): string | null {
  const id = search.get("folder") ?? readStored(FOLDER_KEY);
  return noteFolders.some((folder) => folder.id === id) ? id : null;
}
/** A Notes page entry in the history: how many folders down from All it is (see useFolderPick). */
interface FolderStep {
  folderDepth: number;
}
const folderHref = (id: string | null) => `/notes?folder=${id ?? ""}`;
/**
 * The Notes page's folder that is shown, and going to another. The history holds an entry for each folder down from
 * All, so the phone's back goes up a folder at a time before it leaves the page: going into a folder adds entries,
 * going up goes back through them, going across goes back to the folder both are in and on down from there. Opened
 * straight in a folder (the one picked last, a link), the entries above it are written first. `noteFolders` is
 * undefined while they load.
 */
export function useFolderPick(noteFolders: NoteFolder[] | undefined) {
  const location = useLocation();
  const navigate = useNavigate();
  const isLoaded = noteFolders !== undefined;
  const pickedId = pickedFolderId(new URLSearchParams(location.search), noteFolders ?? []);
  const steps = pathTo(noteFolders ?? [], pickedId).map((folder) => folder.id).join();
  // All is no folder down even without a mark; a folder without one wasn't reached through the entries above it.
  const depth = (location.state as FolderStep | null)?.folderDepth ?? (steps ? undefined : 0);
  // The entry whose folders above were written (StrictMode runs the effect twice, before the new entries show).
  const written = useRef<string | null>(null);

  useEffect(() => {
    if (isLoaded) writeStored(FOLDER_KEY, pickedId);
  }, [isLoaded, pickedId]);
  useEffect(() => {
    if (!isLoaded || depth !== undefined || written.current === location.key) return;
    written.current = location.key;
    navigate(folderHref(null), { replace: true, state: { folderDepth: 0 } satisfies FolderStep });
    steps.split(",").forEach((id, at) => navigate(folderHref(id), { state: { folderDepth: at + 1 } satisfies FolderStep }));
  }, [isLoaded, depth, steps, location.key, navigate]);

  const pick = useCallback((id: string | null) => {
    const from = steps ? steps.split(",") : [];
    const to = pathTo(noteFolders ?? [], id).map((folder) => folder.id);
    let shared = 0;
    while (shared < from.length && from[shared] === to[shared]) shared++;
    const down = () => to.slice(shared).forEach((step, at) => navigate(folderHref(step), { state: { folderDepth: shared + at + 1 } satisfies FolderStep }));
    // The entries under this one aren't the folders above it: shown at once, the entries above it written as on opening.
    if (depth !== from.length) return navigate(folderHref(id), { replace: true });
    if (shared === from.length) return down();
    if (to.length > shared) window.addEventListener("popstate", down, { once: true });
    navigate(shared - from.length);
  }, [steps, noteFolders, depth, navigate]);

  return { pickedId, pick };
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
const sortedBy = (folders: NoteFolder[], ids: string[]) => [...folders].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
/** The folders in another order (`ids` left to right): shows at once and is saved in the background. */
export function useReorderNoteFolders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: notesApi.reorderNoteFolders,
    onMutate: (ids) => {
      queryClient.setQueryData<NotesData>(NOTES, (data) => data && { ...data, noteFolders: sortedBy(data.noteFolders, ids) });
    },
    onError: () => queryClient.invalidateQueries({ queryKey: NOTES }),
  });
}
/**
 * A folder dragged into another (`parentId`; null = the top level), and with `order` (the top-level ids, left to right)
 * to a place along the top of the page: shows at once and is saved in the background.
 */
export function useMoveNoteFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, parentId, order, moved }: { id: string; parentId: string | null; order?: string[]; moved: boolean }) => {
      if (moved) await notesApi.updateNoteFolder(id, { parentId });
      if (order) await notesApi.reorderNoteFolders(order);
    },
    onMutate: ({ id, parentId, order }) => {
      queryClient.setQueryData<NotesData>(NOTES, (data) => {
        if (!data) return data;
        const noteFolders = data.noteFolders.map((folder) => (folder.id === id ? { ...folder, parentId } : folder));
        return { ...data, noteFolders: order ? sortedBy(noteFolders, order) : noteFolders };
      });
    },
    onError: () => queryClient.invalidateQueries({ queryKey: NOTES }),
  });
}
// Its notes and subfolders stay, in the folder it was in (or back under "All").
export const useDeleteNoteFolder = () => useInvalidating(notesApi.deleteNoteFolder, [NOTES]);
