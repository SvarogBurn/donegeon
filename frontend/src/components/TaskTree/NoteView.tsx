import { useEffect, useRef, useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { useLists } from "../../hooks/lists";
import { useUpdateTask } from "../../hooks/tasks";
import { listFrame } from "../../lib/frameTones";
import type { TaskTreeNode } from "../../types";
import { RichText } from "../RichText";
import { TileFrame } from "../Tiles/TileFrame";
import { NoteEditor } from "./NoteEditor";
import { NoteText } from "./NoteText";
import { DeleteOrKeep } from "../DeleteOrKeep";

/**
 * A task's note: read, with Edit to write in it. Written in, it is saved on leaving the field (Done, Escape or a
 * click elsewhere) and is read again. Emptied or deleted (Delete, after asking), the task has no note. `startEditing`:
 * open with the field, as for a task with no note yet.
 */
export function NoteView({ node, startEditing = false }: { node: TaskTreeNode; startEditing?: boolean }) {
  const update = useUpdateTask();
  const [editing, setEditing] = useState(startEditing);
  const [text, setText] = useState(node.notes ?? "");
  const [confirming, setConfirming] = useState(false);
  // What was last sent, so the note reads as saved before the server has answered.
  const saved = useRef(node.notes ?? "");
  useEffect(() => {
    saved.current = node.notes ?? "";
    if (!editing) setText(node.notes ?? "");
    // Only the note from the server; what is being written is left alone.
  }, [node.notes]);
  const field = useRef<HTMLElement>(null);

  function save() {
    const next = text.trim();
    if (next !== saved.current) update.mutate({ id: node.id, changes: { notes: next || null } });
    saved.current = next;
    setText(next);
    setEditing(false);
  }

  function remove() {
    update.mutate({ id: node.id, changes: { notes: null } });
    saved.current = "";
    setText("");
    setConfirming(false);
  }

  return (
    <div className="space-y-2" data-note-view>
      {editing ? (
        <NoteEditor ref={field} value={text} onChange={setText} onDone={save} autoFocus />
      ) : text ? (
        <NoteText text={text} className="note-paper" />
      ) : (
        <p className="text-xs text-stone-500">No note yet.</p>
      )}
      <div className="flex items-center justify-between gap-2">
        {editing || !text ? (
          <span className="text-xs text-stone-500">{editing ? "Saved when you leave it. * or - starts a list" : ""}</span>
        ) : confirming ? (
          <span className="flex items-center gap-2 text-xs" data-note-delete>
            Delete this note?
            <DeleteOrKeep onDelete={remove} onKeep={() => setConfirming(false)} />
          </span>
        ) : (
          <button type="button" className="btn-quiet text-xs text-stone-500" data-note-delete onClick={() => setConfirming(true)}>
            Delete
          </button>
        )}
        {!confirming && (
          <button
            type="button"
            className="nes-btn btn-small"
            // Done: leaving the field saves it. The field must not lose its focus before the click, or the button goes first.
            onMouseDown={(e) => editing && e.preventDefault()}
            onClick={() => (editing ? field.current?.blur() : setEditing(true))}
          >
            {editing ? "Done" : text ? "Edit" : "Write a note"}
          </button>
        )}
      </div>
      {update.error && <p className="text-xs text-red-600">{update.error.message}</p>}
    </div>
  );
}

/** A box framed as the task's list is (its colour, task or reward), so the note is seen to belong to it. Blue without a list. */
export function NoteFrame({ node, className = "", style, ...rest }: { node: TaskTreeNode } & Omit<ComponentProps<typeof TileFrame>, "tone">) {
  const { data: lists = [] } = useLists();
  const frame = listFrame(lists.find((list) => list.id === node.listId));
  return <TileFrame {...rest} tone={frame.tone} style={{ ...frame.style, ...style }} className={className} />;
}

/**
 * The note of one task at the side of the page, as a notes pane: over the right edge of the page, under it on a
 * phone. One at a time; the notes icon of another task shows that one's instead. A click outside it, Escape (when not
 * writing) or × closes it.
 */
export function NotePanel({ node, edit, onClose }: { node: TaskTreeNode; edit: boolean; onClose: () => void }) {
  const pane = useRef<HTMLElement>(null);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || (e.target as Element).closest?.("textarea, input, select, [contenteditable=true], [role=dialog]")) return;
      onClose();
    };
    // A press anywhere else closes it, saving what was being written. Not a notes icon (or Note in a ⋯ menu): those
    // show their own task's note, or close this one, themselves.
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element;
      if (pane.current?.contains(target) || target.closest?.('.notes-button, [data-menu-part="note"]')) return;
      if (document.activeElement instanceof HTMLElement && pane.current?.contains(document.activeElement)) document.activeElement.blur();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose]);

  return createPortal(
    <aside
      ref={pane}
      aria-label="Note"
      data-note-panel={node.id}
      className="fixed top-[calc(var(--top-h,0px)+1rem)] right-4 z-40 w-[24rem] max-sm:inset-x-2 max-sm:top-auto max-sm:bottom-[calc(var(--bar-h,5rem)+0.5rem)] max-sm:w-auto"
    >
      {/* The frame is as tall as there is room for; a longer note scrolls inside it, so the frame's art stays whole. */}
      <NoteFrame
        node={node}
        title="Note"
        aria-label="Note box"
        className="note-pane max-h-[calc(100dvh-var(--bar-h,5rem)-var(--top-h,0px)-2rem)] max-sm:max-h-[60dvh]"
        actions={<button type="button" className="tile-button tile-button-x" aria-label="Close the note" title="Close (Esc)" onClick={onClose} />}
      >
        <p className="text-sm font-bold break-words whitespace-pre-line">
          <RichText text={node.title} />
        </p>
        {/* Another task's note starts afresh, read or written as it was asked for. */}
        <NoteView key={node.id} node={node} startEditing={edit} />
      </NoteFrame>
    </aside>,
    document.body,
  );
}
