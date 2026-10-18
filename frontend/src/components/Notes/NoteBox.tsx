import { useEffect, useRef, useState } from "react";
import { useEditNote, useNotes } from "../../hooks/useTasks";
import type { Note } from "../../types";
import { NoteEditor } from "../TaskTree/NoteEditor";
import { NoteText } from "../TaskTree/NoteText";
import { useTree } from "../TaskTree/TreeContext";
import { TileFrame } from "../Tiles/TileFrame";

/**
 * A note of its own (the Notes page, or a folder that shows it): its title on the band, the text under it. A tap on the
 * text writes in it; leaving the field saves it, offline too. Under the text, which of the Notes page's folders it is in.
 * `startEditing`: a note just made opens with the field.
 */
export function NoteBox({ note, startEditing = false }: { note: Note; startEditing?: boolean }) {
  const edit = useEditNote();
  const { deleteNote } = useTree();
  const { data: notes } = useNotes();
  const noteFolders = notes?.noteFolders ?? [];
  const [title, setTitle] = useState(note.title);
  const [text, setText] = useState(note.text);
  const [editing, setEditing] = useState(startEditing);
  // What was last sent, so the note reads as saved before the server has answered.
  const saved = useRef({ title: note.title, text: note.text });
  // Each from what the server holds, on its own: the text saved must not undo a title being typed, nor the other way round.
  useEffect(() => {
    saved.current.title = note.title;
    setTitle(note.title);
  }, [note.title]);
  useEffect(() => {
    saved.current.text = note.text;
    if (!editing) setText(note.text);
    // What is being written is left alone.
  }, [note.text]);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!editing) return;
    const el = field.current;
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  function saveText() {
    const next = text.trimEnd();
    if (next !== saved.current.text) edit.mutate({ id: note.id, changes: { text: next } });
    saved.current.text = next;
    setText(next);
    setEditing(false);
  }

  function saveTitle() {
    const next = title.trim();
    if (next !== saved.current.title) edit.mutate({ id: note.id, changes: { title: next } });
    saved.current.title = next;
    setTitle(next);
  }

  return (
    <TileFrame
      data-note={note.id}
      title={
        <input
          className="w-full bg-transparent outline-none placeholder:text-white/70 focus:ring-2 focus:ring-white/50"
          value={title}
          placeholder="Note"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setTitle(saved.current.title);
          }}
          aria-label="Note title"
          maxLength={100}
        />
      }
      actions={
        <button
          type="button"
          className="tile-button tile-button-x"
          aria-label={`Delete note "${note.title || "Note"}"`}
          title="Delete this note (Ctrl+Z to undo)"
          onClick={() => deleteNote(note)}
        />
      }
    >
      {editing ? (
        <NoteEditor ref={field} value={text} onChange={setText} onDone={saveText} label="Note" />
      ) : (
        // A long note is capped in height on a phone and scrolls inside the box.
        // The text itself is what is tapped to write in it.
        <button type="button" className="box-scroll block w-full cursor-text text-left" onClick={() => setEditing(true)} aria-label="Write in this note">
          {text ? <NoteText text={text} className="note-paper" /> : <p className="note-paper text-stone-400">Tap to write. # starts a heading, * or - a list</p>}
        </button>
      )}
      {noteFolders.length > 0 && (
        <label className="flex items-center gap-2 text-xs text-stone-500">
          In:
          <select
            className="min-w-0 bg-transparent text-stone-900 underline dark:text-stone-100"
            value={note.noteFolderId ?? ""}
            onChange={(e) => edit.mutate({ id: note.id, changes: { noteFolderId: e.target.value || null } })}
            aria-label="Note folder"
          >
            <option value="">no folder</option>
            {noteFolders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </TileFrame>
  );
}
