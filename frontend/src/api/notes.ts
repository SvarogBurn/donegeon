import type { Note, NoteFolder } from "../types";
import type { When } from "../lib/clock";
import { openNote, sealNote } from "../lib/noteCrypto";
import { deviceKey } from "../lib/notesKey";
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
/** As the server keeps them: while the notes are encrypted, their words are sealed (lib/noteSync opens them). */
export const listNotes = (since?: string) => api<NotesAnswer>(since ? `/notes?since=${encodeURIComponent(since)}` : "/notes");

/** A note's words sealed with this device's notes key, while it has one (lib/noteCrypto); as they are otherwise. */
async function sealed<T extends NoteChanges>(body: T): Promise<T> {
  const kept = await deviceKey();
  return kept ? sealNote(kept.key, body) : body;
}
/** The note the server answers with, readable. */
async function opened(note: Note): Promise<Note> {
  const kept = await deviceKey();
  return kept ? openNote(kept.key, note).catch(() => note) : note;
}

export const createNote = async (body: NewNote, when?: When) => api<{ note: Note }>("/notes", { body: await sealed(body), when }).then((r) => opened(r.note));
export const updateNote = async (id: string, body: NoteChanges, when?: When) =>
  api<{ note: Note }>(`/notes/${id}`, { method: "PATCH", body: await sealed(body), when }).then((r) => opened(r.note));
export const deleteNote = (id: string, when?: When) => api(`/notes/${id}`, { method: "DELETE", when });

export const createNoteFolder = (body: NoteFolderChanges = {}) =>
  api<{ noteFolder: NoteFolder }>("/notes/folders", { body }).then((r) => r.noteFolder);
export const updateNoteFolder = (id: string, body: NoteFolderChanges) =>
  api<{ noteFolder: NoteFolder }>(`/notes/folders/${id}`, { method: "PATCH", body }).then((r) => r.noteFolder);
/** The folders dragged into another order, left to right. */
export const reorderNoteFolders = (ids: string[]) => api(`/notes/folders/order`, { method: "PUT", body: { ids } });
/** Its notes and subfolders stay, in the folder it was in (or back under "All"). */
export const deleteNoteFolder = (id: string) => api(`/notes/folders/${id}`, { method: "DELETE" });
