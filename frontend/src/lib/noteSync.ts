import { listNotes, type NotesAnswer } from "../api/notes";
import type { Note } from "../types";
import { hasPlainWords, isSealed, openNote } from "./noteCrypto";
import { deviceKey } from "./notesKey";
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

/**
 * The notes as the server sent them, readable (lib/noteCrypto), and those it keeps unsealed while this device has the
 * notes key. Null when one is sealed and this device can't open it: no key, or another one.
 */
async function opened(notes: Note[]): Promise<{ notes: Note[]; plain: string[] } | null> {
  const kept = await deviceKey();
  if (!kept) return notes.some((note) => isSealed(note.title) || isSealed(note.text)) ? null : { notes, plain: [] };
  try {
    return { notes: await Promise.all(notes.map((note) => openNote(kept.key, note))), plain: notes.filter(hasPlainWords).map((note) => note.id) };
  } catch {
    return null;
  }
}

/** The notes, asking only for what changed since the answer `kept` came from; every note when there is none. */
export async function loadNotes(kept: NotesData | undefined): Promise<NotesData> {
  if (kept?.syncedAt) {
    const answer = await listNotes(kept.syncedAt);
    const changed = answer.ids && (await opened(answer.notes));
    const merged = changed && mergeNotes(kept, { ...answer, notes: changed.notes, ids: answer.ids! });
    if (merged) {
      const sent = new Set(answer.notes.map((note) => note.id));
      const plain = [...(kept.plain ?? []).filter((id) => !sent.has(id) && answer.ids!.includes(id)), ...changed.plain];
      return { ...merged, ...(plain.length > 0 && { plain }) };
    }
  }
  const { notes, noteFolders, syncedAt } = await listNotes();
  const all = await opened(notes);
  if (!all) return { notes: [], noteFolders, locked: true };
  return { notes: all.notes, noteFolders, syncedAt, ...(all.plain.length > 0 && { plain: all.plain }) };
}
