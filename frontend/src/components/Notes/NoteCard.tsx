import { useContext, useState } from "react";
import { Link } from "react-router";
import { useDeleteNote } from "../../hooks/notes";
import type { Note } from "../../types";
import { RichText } from "../RichText";
import { TileControlsContext } from "../Tiles/TileFrame";
import { DeleteOrKeep } from "../DeleteOrKeep";

/**
 * A note as a small card (the Notes page, two to a row on a phone; or a folder that shows it): its title, or else its
 * first line, and the start of its text. A tap opens it on a screen of its own (/notes/:id). The x in its corner
 * deletes it (asked first, over the card); the tab button beside it drags it onto a folder (TileFrame's controls,
 * given by the grid or the Notes page).
 */
export function NoteCard({ note }: { note: Note }) {
  const controls = useContext(TileControlsContext);
  const remove = useDeleteNote();
  const [confirming, setConfirming] = useState(false);
  const lines = note.text.split("\n").filter((line) => line.trim() !== "");
  const title = note.title || lines.shift() || "";
  return (
    <div className="relative">
      <Link to={`/notes/${note.id}`} className="note-paper note-card block" data-note={note.id} aria-label={`Note ${title || "with nothing in it yet"}`}>
        <span className={`block truncate font-pixel text-[10px] leading-snug ${controls ? "pr-12" : "pr-6"}`}>
          {title ? <RichText text={title} /> : <span className="text-stone-400">Empty note</span>}
        </span>
        {/* The start of the rest, a few lines' worth, without its list marks. */}
        <span className="mt-1 line-clamp-4 block text-xs break-words text-stone-600 dark:text-stone-400">
          <RichText text={lines.map((line) => line.replace(/^\s*(?:[*-]|\d+\.)\s+/, "")).join(" · ")} />
        </span>
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
        <button type="button" className="tile-button tile-button-x !mt-0" aria-label={`Delete note "${title || "Empty note"}"`} title="Delete this note" onClick={() => setConfirming(true)} />
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
