import type { Note, NoteFolder } from "../types";
import { api, type When } from "./client";

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
}

export const listNotes = () => api<{ notes: Note[]; noteFolders: NoteFolder[] }>("/notes");
export const createNote = (body: NewNote, when?: When) => api<{ note: Note }>("/notes", { body, when }).then((r) => r.note);
export const updateNote = (id: string, body: NoteChanges, when?: When) =>
  api<{ note: Note }>(`/notes/${id}`, { method: "PATCH", body, when }).then((r) => r.note);
export const deleteNote = (id: string, when?: When) => api(`/notes/${id}`, { method: "DELETE", when });
export const restoreNote = (id: string, when?: When) => api(`/notes/${id}/restore`, { method: "POST", when });

export const createNoteFolder = (body: NoteFolderChanges = {}) =>
  api<{ noteFolder: NoteFolder }>("/notes/folders", { body }).then((r) => r.noteFolder);
export const updateNoteFolder = (id: string, body: NoteFolderChanges) =>
  api<{ noteFolder: NoteFolder }>(`/notes/folders/${id}`, { method: "PATCH", body }).then((r) => r.noteFolder);
/** Its notes stay, back under "All". */
export const deleteNoteFolder = (id: string) => api(`/notes/folders/${id}`, { method: "DELETE" });
