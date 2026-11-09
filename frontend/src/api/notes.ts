import type { Note, NoteFolder } from "../types";
import type { When } from "../lib/clock";
import { api } from "./client";

export interface NoteChanges {
  title?: string;
  text?: string;
  /** null = out of its folder, only under "All". */
  noteFolderId?: string | null;
}
export interface NewNote extends NoteChanges {
  /** Made on the device (lib/offline/changes), so a note written offline has its id at once. */
  id: string;
}
export interface NoteFolderChanges {
  name?: string;
  color?: string | null;
  /** The folder it goes in; null = the top level. */
  parentId?: string | null;
}

/** What the server answers: with `since`, only the notes changed since then, and `ids` (every note there is, in order). */
export interface NotesAnswer {
  notes: Note[];
  noteFolders: NoteFolder[];
  syncedAt: string;
  ids?: string[];
}
export const listNotes = (since?: string) => api<NotesAnswer>(since ? `/notes?since=${encodeURIComponent(since)}` : "/notes");
export const createNote = (body: NewNote, when?: When) => api<{ note: Note }>("/notes", { body, when }).then((r) => r.note);
export const updateNote = (id: string, body: NoteChanges, when?: When) =>
  api<{ note: Note }>(`/notes/${id}`, { method: "PATCH", body, when }).then((r) => r.note);
export const deleteNote = (id: string, when?: When) => api(`/notes/${id}`, { method: "DELETE", when });

export const createNoteFolder = (body: NoteFolderChanges = {}) =>
  api<{ noteFolder: NoteFolder }>("/notes/folders", { body }).then((r) => r.noteFolder);
export const updateNoteFolder = (id: string, body: NoteFolderChanges) =>
  api<{ noteFolder: NoteFolder }>(`/notes/folders/${id}`, { method: "PATCH", body }).then((r) => r.noteFolder);
/** The folders dragged into another order, left to right. */
export const reorderNoteFolders = (ids: string[]) => api(`/notes/folders/order`, { method: "PUT", body: { ids } });
/** Its notes and subfolders stay, in the folder it was in (or back under "All"). */
export const deleteNoteFolder = (id: string) => api(`/notes/folders/${id}`, { method: "DELETE" });
