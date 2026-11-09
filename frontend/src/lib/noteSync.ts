import { listNotes, type NotesAnswer } from "../api/notes";
import type { NotesData } from "./offline/noteChanges";

/**
 * The notes kept on the device brought up to date by an answer to "what changed since": a changed note replaces the
 * one kept, every other note in `ids` is kept as it is, one not in `ids` is gone, in the server's order. Null when a
 * note in `ids` is neither changed nor kept: what is kept is missing something, so every note is to be asked for.
 */
export function mergeNotes(kept: NotesData, answer: NotesAnswer & { ids: string[] }): NotesData | null {
  const changed = new Map(answer.notes.map((note) => [note.id, note]));
  const before = new Map(kept.notes.map((note) => [note.id, note]));
  const notes = answer.ids.map((id) => changed.get(id) ?? before.get(id));
  if (notes.some((note) => !note)) return null;
  return { notes: notes as NotesData["notes"], noteFolders: answer.noteFolders, syncedAt: answer.syncedAt };
}

/** The notes, asking only for what changed since the answer `kept` came from; every note when there is none. */
export async function loadNotes(kept: NotesData | undefined): Promise<NotesData> {
  if (kept?.syncedAt) {
    const answer = await listNotes(kept.syncedAt);
    const merged = answer.ids && mergeNotes(kept, { ...answer, ids: answer.ids });
    if (merged) return merged;
  }
  const { notes, noteFolders, syncedAt } = await listNotes();
  return { notes, noteFolders, syncedAt };
}
