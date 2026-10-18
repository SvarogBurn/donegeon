import { useContext } from "react";
import { Link } from "react-router";
import type { Note } from "../../types";
import { RichText } from "../RichText";
import { TileControlsContext } from "../Tiles/TileFrame";

/**
 * A note as a small card (the Notes page, two to a row on a phone; or a folder that shows it): its title, or else its
 * first line, and the start of its text. A tap opens it on a screen of its own (/notes/:id). The tab button in its
 * corner drags it onto a folder (TileFrame's controls, given by the grid or the Notes page).
 */
export function NoteCard({ note }: { note: Note }) {
  const controls = useContext(TileControlsContext);
  const lines = note.text.split("\n").filter((line) => line.trim() !== "");
  const title = note.title || lines.shift() || "";
  return (
    <div className="relative">
      <Link to={`/notes/${note.id}`} className="note-paper note-card block" data-note={note.id} aria-label={`Note ${title || "with nothing in it yet"}`}>
        <span className="block truncate pr-4 font-pixel text-[10px] leading-snug">{title ? <RichText text={title} /> : <span className="text-stone-400">Empty note</span>}</span>
        {/* The start of the rest, a few lines' worth, without its list marks. */}
        <span className="mt-1 line-clamp-4 block text-xs break-words text-stone-600 dark:text-stone-400">
          <RichText text={lines.map((line) => line.replace(/^\s*(?:[*-]|\d+\.)\s+/, "")).join(" · ")} />
        </span>
      </Link>
      {controls && (
        <button
          type="button"
          className="tile-button tile-button-tab absolute top-1 right-1 !mt-0"
          onPointerDown={controls.onDragStart}
          aria-label={`Drag to move ${controls.name}`}
          title={controls.dragTitle ?? "Drag onto a folder"}
        />
      )}
    </div>
  );
}
