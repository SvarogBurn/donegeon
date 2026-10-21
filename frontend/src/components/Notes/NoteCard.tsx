import { useContext, useState } from "react";
import { Link } from "react-router";
import { useDeleteNote } from "../../hooks/notes";
import type { Note } from "../../types";
import { RichText } from "../RichText";
import { NoteText } from "../TaskTree/NoteText";
import { TileControlsContext } from "../Tiles/TileFrame";
import { DeleteOrKeep } from "../DeleteOrKeep";

/**
 * A note as a small card (the Notes page, two to a row on a phone; or a folder that shows it): its title in bold, and
 * under it as much of its text as fits, as it reads (lists, headings at the text's size); without a title, the text
 * fills the card from the top. A tap opens it on a screen of its own (/notes/:id). The x in its corner
 * deletes it (asked first, over the card); the tab button beside it drags it onto a folder (TileFrame's controls,
 * given by the grid or the Notes page). On the Notes page it is in the notes' font; shown in a folder (`inBox`), in the
 * boxes' one.
 */
export function NoteCard({ note, inBox = false }: { note: Note; inBox?: boolean }) {
  const controls = useContext(TileControlsContext);
  const remove = useDeleteNote();
  const [confirming, setConfirming] = useState(false);
  const text = note.text.trim();
  // What it is called (to be read out, and in the delete button's name): its title, or else its first line.
  const name = note.title || text.split("\n")[0].trim();
  return (
    <div className="relative" data-text={inBox ? "box" : "notes"}>
      <Link to={`/notes/${note.id}`} className="note-paper note-card flex flex-col" data-note={note.id} aria-label={`Note ${name || "with nothing in it yet"}`}>
        {(note.title || !text) && (
          <span className={`mb-1 block flex-none truncate note-title text-sm leading-snug font-bold markup-bold ${controls ? "pr-12" : "pr-6"}`}>
            {note.title ? <RichText text={note.title} /> : <span className="text-stone-400">Empty note</span>}
          </span>
        )}
        {/* As much of the text as fits, fading out at the card's bottom edge. Without a title it starts at the top, its
            first line kept clear of the buttons in the corner. */}
        {text && (
          <div className="min-h-0 flex-1 overflow-hidden text-xs text-stone-600 [mask-image:linear-gradient(to_bottom,black_70%,transparent)] dark:text-stone-400">
            {!note.title && <span className={`float-right h-4 ${controls ? "w-12" : "w-6"}`} aria-hidden />}
            <NoteText text={text} />
          </div>
        )}
      </Link>
      <div className="absolute top-1 right-1 flex gap-1">
        {controls && (
          <button
            type="button"
            className="tile-button tile-button-tab !mt-0"
            onPointerDown={controls.onDragStart}
            aria-label={`Drag to move ${controls.name}`}
            title={controls.dragTitle ?? "Drag onto a folder"}
          />
        )}
        <button type="button" className="tile-button tile-button-x !mt-0" aria-label={`Delete note "${name || "Empty note"}"`} title="Delete this note" onClick={() => setConfirming(true)} />
      </div>
      {confirming && (
        <div className="note-paper note-card absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-xs" role="alertdialog" aria-label="Delete this note?">
          Delete this note?
          <span className="flex items-center gap-2">
            <DeleteOrKeep onDelete={() => remove.mutate({ id: note.id })} onKeep={() => setConfirming(false)} />
          </span>
        </div>
      )}
    </div>
  );
}
