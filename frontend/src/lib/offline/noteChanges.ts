import type { QueryClient } from "@tanstack/react-query";
import * as notesApi from "../../api/notes";
import { NOTES } from "../../hooks/queryKeys";
import type { Note, NoteFolder } from "../../types";
import { quoted, type Saved, type Specs } from "./changeSpec";

/** The changes to the Notes page's notes, which work offline as task changes do. */

/** What the Notes page holds: the notes and its folders, in one answer. */
export interface NotesData {
  notes: Note[];
  noteFolders: NoteFolder[];
}

export interface NoteEditChange {
  id: string;
  changes: notesApi.NoteChanges;
}

/** What each kind of note change carries. */
export interface NoteChangeVars {
  noteAdd: notesApi.NewNote;
  noteEdit: NoteEditChange;
  noteDelete: { id: string };
}

/** Saves what the notes hold now and applies `change` to them. */
async function changeNotes(queryClient: QueryClient, change: (notes: Note[]) => Note[]): Promise<Saved> {
  await queryClient.cancelQueries({ queryKey: NOTES });
  const before = queryClient.getQueryData<NotesData>(NOTES);
  if (!before) return [];
  queryClient.setQueryData<NotesData>(NOTES, { ...before, notes: change(before.notes) });
  return [[NOTES, before]];
}

const noteName = (title: string | undefined) => (title ? `the note ${quoted(title)}` : "a note");

export const noteSpecs: Specs<NoteChangeVars> = {
  // A new note goes first, as the server puts it.
  noteAdd: {
    send: ({ when, ...note }) => notesApi.createNote(note, when),
    show: (queryClient, { when, ...note }) =>
      changeNotes(queryClient, (all) => [
        { title: "", text: "", noteFolderId: null, ...note, position: Math.min(1, ...all.map((n) => n.position)) - 1, createdAt: when.at, updatedAt: when.at },
        ...all,
      ]),
    refresh: [NOTES],
    name: ({ title }) => `the new note${title ? ` ${quoted(title)}` : ""}`,
  },
  noteEdit: {
    send: ({ id, changes, when }) => notesApi.updateNote(id, changes, when),
    show: (queryClient, { id, changes, when }) =>
      changeNotes(queryClient, (all) => all.map((note) => (note.id === id ? { ...note, ...changes, updatedAt: when.at } : note))),
    refresh: [NOTES],
    name: ({ changes }) => `the change to ${noteName(changes.title)}`,
  },
  noteDelete: {
    send: ({ id, when }) => notesApi.deleteNote(id, when),
    show: (queryClient, { id }) =>
      changeNotes(queryClient, (all) => all.filter((n) => n.id !== id)),
    refresh: [NOTES],
    name: () => "deleting a note",
  },
};
