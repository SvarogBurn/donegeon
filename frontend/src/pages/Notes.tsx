import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";
import { useSearchParams } from "react-router";
import { ColorChoices } from "../components/ColorChoices";
import { NeedsConnection } from "../components/NeedsConnection";
import { NoteCard } from "../components/Notes/NoteCard";
import { TileControlsContext } from "../components/Tiles/TileFrame";
import { useTabDrag } from "../components/Tiles/useTabDrag";
import { useDropOnTab } from "../hooks/folders";
import { pickedFolderId, rememberNoteFolder, useCreateNoteFolder, useDeleteNoteFolder, useEditNote, useNewNote, useNotes, useUpdateNoteFolder } from "../hooks/notes";
import { noteView } from "../lib/folders";
import { FOLDER_COLOR, folderIn } from "../lib/frameTones";
import type { NoteFolder } from "../types";

/** How long a folder is held down before its name and colour open. */
const HOLD_MS = 500;
/** A note's box dropped on one of the folders along the top of the page: data-tab-drop="notes:<id>" ("notes:" = All). */
const NOTES_TAB = "notes:";

const chipSelector = (id: string) => `[data-tab-drop="${NOTES_TAB}${id}"]`;

/**
 * A note folder's name and colour, and removing it (its notes stay, under All). Opens under its chip, but outside the
 * row of chips: that row scrolls sideways, and would cut it off.
 */
function NoteFolderEditor({ folder, onClose }: { folder: NoteFolder; onClose: () => void }) {
  const update = useUpdateNoteFolder();
  const remove = useDeleteNoteFolder();
  const [name, setName] = useState(folder.name);
  const [left, setLeft] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Under its chip, kept inside the row's width (on a phone it is laid across the screen instead).
  useLayoutEffect(() => {
    const card = ref.current;
    const row = card?.parentElement;
    const chip = row?.querySelector(chipSelector(folder.id));
    if (!card || !row || !chip) return;
    const rowBox = row.getBoundingClientRect();
    const x = chip.getBoundingClientRect().left - rowBox.left;
    setLeft(Math.max(0, Math.min(x, rowBox.width - card.offsetWidth)));
  }, [folder.id]);

  useEffect(() => {
    const onPointerDown = (e: globalThis.PointerEvent) => {
      const target = e.target as Element;
      // A click on its own chip closes it (the chip's click does that), and isn't taken for one outside.
      if (!ref.current?.contains(target) && !target.closest?.(chipSelector(folder.id))) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [folder.id, onClose]);

  function saveName() {
    const next = name.trim();
    if (!next) setName(folder.name);
    else if (next !== folder.name) update.mutate({ id: folder.id, changes: { name: next } });
  }

  return (
    <div
      ref={ref}
      className="card absolute top-full left-(--left) z-50 mt-1 w-52 space-y-2 !p-2 text-xs shadow-lg max-sm:right-0 max-sm:left-0 max-sm:w-auto"
      style={{ "--left": `${left}px` } as CSSProperties}
      role="dialog"
      aria-label={`Note folder "${folder.name}"`}
    >
      <NeedsConnection>
        <input
          className="nes-input input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            saveName();
            onClose();
          }}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Folder name"
          maxLength={60}
        />
        <ColorChoices
          current={folder.color ?? FOLDER_COLOR}
          onPick={(hex) => update.mutate({ id: folder.id, changes: { color: hex === FOLDER_COLOR ? null : hex } })}
          reset={folder.color ? { label: "Back to gold", onReset: () => update.mutate({ id: folder.id, changes: { color: null } }) } : undefined}
        />
        <button type="button" className="btn-quiet !text-red-600" title="Removes the folder only: its notes stay, under All" onClick={() => {
          onClose();
          remove.mutate(folder.id);
        }}>
          Remove folder
        </button>
      </NeedsConnection>
      {(update.error ?? remove.error) && <p className="text-red-600">{(update.error ?? remove.error)!.message}</p>}
    </div>
  );
}

const chip = (isActive: boolean) =>
  `flex flex-none cursor-pointer items-center gap-1.5 px-2 py-1 font-pixel text-[8px] ${isActive ? "bg-stone-200 text-stone-950 dark:bg-stone-800 dark:text-white" : "text-stone-700 hover:bg-stone-200/60 dark:text-stone-300 dark:hover:bg-stone-800/60"}`;

/** A folder along the top of the page: a click shows its notes; held, right-clicked or clicked again, its name and colour open. */
function NoteFolderChip({ folder, isActive, isEditing, onPick, onEdit }: { folder: NoteFolder; isActive: boolean; isEditing: boolean; onPick: () => void; onEdit: (id: string | null) => void }) {
  const hold = useRef(0);
  const held = useRef(false);
  const cancelHold = () => window.clearTimeout(hold.current);
  useEffect(() => cancelHold, []);

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    held.current = false;
    cancelHold();
    hold.current = window.setTimeout(() => {
      held.current = true;
      onEdit(folder.id);
    }, HOLD_MS);
  }
  function onClick(e: MouseEvent) {
    if (held.current) return e.preventDefault();
    if (isActive) onEdit(isEditing ? null : folder.id);
    else onPick();
  }

  return (
    <button
      type="button"
      className={chip(isActive)}
      data-tab-drop={`${NOTES_TAB}${folder.id}`}
      data-note-folder={folder.name}
      aria-pressed={isActive}
      aria-expanded={isEditing}
      title={`${folder.name}. Click again, hold or right-click for its name, colour or to remove it; drop a note here to put it in.`}
      style={{ WebkitTouchCallout: "none", userSelect: "none" }}
      onPointerDown={onPointerDown}
      onPointerUp={cancelHold}
      onPointerLeave={cancelHold}
      onPointerCancel={cancelHold}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        cancelHold();
        onEdit(folder.id);
      }}
    >
      <span className="tab-icon tab-icon-folder !size-[21px]" style={folder.color ? { backgroundImage: folderIn(folder.color) } : undefined} aria-hidden />
      <span className="max-w-28 truncate">{folder.name}</span>
      {/* Shown, it opens on another click. */}
      {isActive && <span className="text-stone-500" aria-hidden>▾</span>}
    </button>
  );
}

/**
 * The Notes page: notes of their own, on no task, as small cards, two to a row on a phone (a tap opens one on a screen of
 * its own). Along the top, the page's own folders for notes (All, then the user's); a click shows that folder's notes,
 * and a card dragged by its tab button onto one goes into it. Dragged onto a folder of the top strip, it is shown in
 * that folder too, like a list.
 */
export function NotesPage() {
  const notes = useNotes();
  const drop = useDropOnTab();
  const newNote = useNewNote();
  const editNote = useEditNote();
  const createFolder = useCreateNoteFolder();
  const [params, setParams] = useSearchParams();
  const [editingId, setEditingId] = useState<string | null>(null);
  const closeEditor = useCallback(() => setEditingId(null), []);
  const startDrag = useTabDrag(
    (id, tab) => (tab.startsWith(NOTES_TAB) ? editNote.mutate({ id, changes: { noteFolderId: tab.slice(NOTES_TAB.length) || null } }) : drop.dropOnTab(noteView(id), tab)),
    // Newest first: there is no order of the user's own to change.
    () => {},
  );

  if (notes.error) return <p className="text-sm text-red-600">Couldn't load your notes: {notes.error.message}</p>;
  if (!notes.data) return <p className="text-sm text-stone-500">Loading…</p>;
  const { noteFolders } = notes.data;
  const pickedId = pickedFolderId(params, noteFolders);
  const pick = (id: string | null) => {
    rememberNoteFolder(id);
    setParams(id ? { folder: id } : {}, { replace: true });
  };
  const editingFolder = noteFolders.find((folder) => folder.id === editingId);
  const shown = notes.data.notes.filter((note) => pickedId === null || note.noteFolderId === pickedId);

  return (
    <div className="space-y-4">
      <div className="relative">
        {/* Scrolled sideways, the open folder's card would no longer be under its chip. */}
        <nav className="flex items-center gap-1 overflow-x-auto pb-1" aria-label="Note folders" onScroll={() => setEditingId(null)}>
          <button type="button" className={chip(pickedId === null)} data-tab-drop={NOTES_TAB} aria-pressed={pickedId === null} title="Every note. Drop a note here to take it out of its folder." onClick={() => pick(null)}>
            <span className="tab-icon tab-icon-notes !size-[21px] !bg-size-[20px]" aria-hidden />
            All
          </button>
          {noteFolders.map((folder) => (
            <NoteFolderChip key={folder.id} folder={folder} isActive={pickedId === folder.id} isEditing={editingId === folder.id} onPick={() => pick(folder.id)} onEdit={setEditingId} />
          ))}
          <NeedsConnection>
            <button
              type="button"
              className={chip(false)}
              title="A folder for notes, here at the top of the Notes page"
              disabled={createFolder.isPending}
              onClick={() => createFolder.mutate({}, { onSuccess: (made) => (pick(made.id), setEditingId(made.id)) })}
            >
              <span className="tab-icon tab-icon-folder !size-[21px] opacity-50" aria-hidden />+ Folder
            </button>
          </NeedsConnection>
        </nav>
        {editingFolder && <NoteFolderEditor key={editingFolder.id} folder={editingFolder} onClose={closeEditor} />}
      </div>
      {createFolder.error && <p className="text-sm text-red-600">{createFolder.error.message}</p>}
      <div className="flex justify-center">
        {/* Made in the folder that is shown, and opened to be written in. */}
        <button type="button" className="nes-btn btn-small" onClick={newNote}>
          + New note
        </button>
      </div>
      {shown.length === 0 ? (
        <p className="text-center text-sm text-stone-500">{pickedId ? "No notes in this folder yet: drop one on it, or write a new one here." : "No notes yet."}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6" aria-label="Notes">
          {shown.map((note) => (
            <li key={note.id} data-box={note.id}>
              <TileControlsContext.Provider
                value={{ name: `note "${note.title || "Note"}"`, isPinned: false, onDragStart: (e) => startDrag(e, note.id), dragTitle: "Drag onto a folder: one at the top of this page puts it in there, one of the top strip shows it there too" }}
              >
                <NoteCard note={note} />
              </TileControlsContext.Provider>
            </li>
          ))}
        </ul>
      )}
      {drop.error && <p className="text-center text-sm text-red-600">Couldn't change the folder: {drop.error.message}</p>}
    </div>
  );
}
