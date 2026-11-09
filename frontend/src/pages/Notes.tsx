import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ColorChoices } from "../components/ColorChoices";
import { NeedsConnection } from "../components/NeedsConnection";
import { dragAlong, useTabPress, type OnTabDrag } from "../components/layout/tabDrag";
import { NoteCard } from "../components/Notes/NoteCard";
import { NoteFolderCard } from "../components/Notes/NoteFolderCard";
import { NotesLock } from "../components/Notes/NotesLock";
import { TileControlsContext } from "../components/Tiles/TileFrame";
import { useTabDrag } from "../components/Tiles/useTabDrag";
import { useDropOnTab } from "../hooks/folders";
import { useSealPlainNotes } from "../hooks/notesKey";
import { useCreateNoteFolder, useDeleteNoteFolder, useEditNote, useFolderPick, useMoveNoteFolder, useNewNote, useNotes, useReorderNoteFolders, useUpdateNoteFolder } from "../hooks/notes";
import { noteView } from "../lib/folders";
import { FOLDER_COLOR, folderIn } from "../lib/frameTones";
import { childrenOf, insideOf, pathTo } from "../lib/noteFolders";
import { moveItem } from "../lib/taskBar";
import type { NoteFolder } from "../types";

/**
 * A note's box dropped on one of the page's folders (a chip along the top, a folder's icon):
 * data-tab-drop="notes:<id>" ("notes:" = All).
 */
const NOTES_TAB = "notes:";

/** The chip or icon a folder's editor opens under (and a click on which isn't one outside it). */
const folderSelector = (id: string) => `[data-note-folder-id="${id}"]`;
/** Where a folder's editor stays clear of the screen's sides. */
const EDGE_PX = 8;

/**
 * A note folder's name and colour, and removing it (its notes and subfolders stay, in `parentName` or under All). Opens
 * under its chip, but outside the row of chips (that row scrolls sideways, and would cut it off), or under its card in
 * the folder it is in (`onCard`).
 */
function NoteFolderEditor({ folder, parentName, onCard = false, onClose }: { folder: NoteFolder; parentName?: string; onCard?: boolean; onClose: () => void }) {
  const update = useUpdateNoteFolder();
  const remove = useDeleteNoteFolder();
  const [name, setName] = useState(folder.name);
  const [left, setLeft] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Under its chip, kept inside the row's width (on a phone it is laid across the screen instead); under its card, kept
  // on the screen.
  useLayoutEffect(() => {
    const card = ref.current;
    const row = card?.parentElement;
    const chip = row?.querySelector(folderSelector(folder.id));
    if (!card || !row || !chip) return;
    const rowBox = row.getBoundingClientRect();
    const x = chip.getBoundingClientRect().left - rowBox.left;
    if (onCard) setLeft(Math.max(EDGE_PX - rowBox.left, Math.min(0, document.documentElement.clientWidth - EDGE_PX - rowBox.left - card.offsetWidth)));
    else setLeft(Math.max(0, Math.min(x, rowBox.width - card.offsetWidth)));
  }, [folder.id, onCard]);

  useEffect(() => {
    const onPointerDown = (e: globalThis.PointerEvent) => {
      const target = e.target as Element;
      // A click on its own chip closes it (the chip's click does that), and isn't taken for one outside.
      if (!ref.current?.contains(target) && !target.closest?.(folderSelector(folder.id))) onClose();
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
      className={`card absolute top-full left-(--left) z-50 mt-1 w-52 space-y-2 !p-2 text-xs shadow-lg ${onCard ? "" : "max-sm:right-0 max-sm:left-0 max-sm:w-auto"}`}
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
        <button type="button" className="btn-quiet !text-red-600" title={`Removes the folder only: its notes and folders stay, ${parentName ? `in "${parentName}"` : "under All"}`} onClick={() => {
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

/**
 * A top-level folder along the top of the page: a click shows its notes; held, right-clicked or clicked again, its name
 * and colour open; moved, it is dragged to another place among the folders, or into another.
 */
function NoteFolderChip({ folder, isActive, isOpen, isEditing, isDragged, onPick, onEdit, onDrag }: {
  folder: NoteFolder;
  isActive: boolean;
  /** One of the folders inside it is shown. */
  isOpen: boolean;
  isEditing: boolean;
  isDragged: boolean;
  onPick: () => void;
  onEdit: (id: string | null) => void;
  onDrag: OnTabDrag;
}) {
  const press = useTabPress<HTMLButtonElement>({ onDrag, onHoldRelease: () => onEdit(folder.id) });

  // A plain click (one that ends a hold or a drag is stopped before this).
  function onClick() {
    if (isActive) onEdit(isEditing ? null : folder.id);
    else onPick();
  }

  return (
    <button
      ref={press.ref}
      type="button"
      className={chip(isActive || isOpen)}
      data-tab-drop={`${NOTES_TAB}${folder.id}`}
      data-nest={folder.id}
      data-note-folder-id={folder.id}
      data-note-folder={folder.name}
      data-bar-item={folder.id}
      data-lifted={press.isLifted || undefined}
      data-dragged={isDragged || undefined}
      aria-pressed={isActive}
      aria-expanded={isEditing}
      title={`${folder.name}. Drag to move it among the folders, or onto one to put it inside; click again, hold or right-click for its name, colour or to remove it; drop a note here to put it in.`}
      style={{ WebkitTouchCallout: "none", userSelect: "none" }}
      onPointerDown={press.onPointerDown}
      onClickCapture={press.onClickCapture}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        // A finger's long-press: letting go opens it, unless the folder is dragged meanwhile.
        if (press.pressing.current) return;
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
 * its own). Along the top, the page's own top-level folders for notes (All, then the user's); a click shows that
 * folder's notes, after the folders inside it (big icons, like a computer's; the phone's back goes up a folder), and a card dragged by its tab button onto a folder goes into it. A folder dragged onto
 * another goes inside it. Dragged onto a folder of the top strip, a note is shown in that folder too, like a list.
 */
export function NotesPage() {
  const notes = useNotes();
  const drop = useDropOnTab();
  const newNote = useNewNote();
  const editNote = useEditNote();
  const createFolder = useCreateNoteFolder();
  const reorder = useReorderNoteFolders();
  const move = useMoveNoteFolder();
  const chipRow = useRef<HTMLElement>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const folderPick = useFolderPick(notes.data?.noteFolders);
  const [editingId, setEditingId] = useState<string | null>(null);
  const closeEditor = useCallback(() => setEditingId(null), []);
  const startDrag = useTabDrag(
    (id, tab) => (tab.startsWith(NOTES_TAB) ? editNote.mutate({ id, changes: { noteFolderId: tab.slice(NOTES_TAB.length) || null } }) : drop.dropOnTab(noteView(id), tab)),
    // Newest first: there is no order of the user's own to change (the folders' is changed by dragging them).
    () => {},
  );

  useSealPlainNotes(notes.data);

  if (notes.error) return <p className="text-sm text-red-600">Couldn't load your notes: {notes.error.message}</p>;
  if (!notes.data) return <p className="text-sm text-stone-500">Loading…</p>;
  if (notes.data.locked) return <NotesLock />;
  const { noteFolders } = notes.data;
  const { pickedId } = folderPick;
  const pick = (id: string | null) => {
    setEditingId(null);
    folderPick.pick(id);
  };
  const topLevel = childrenOf(noteFolders, null);
  const path = pathTo(noteFolders, pickedId);
  // A chip or a folder's card: let go beside a folder along the top, it takes that place there ("All" stays first,
  // "+ Folder" last); on a folder (the middle of a chip, a folder's icon), it goes inside it. Never into
  // itself or a folder inside it, nor where it already is.
  const dragFolder = (folder: NoteFolder, at: { x: number; y: number }) => {
    const order = topLevel.map((f) => f.id);
    const inside = insideOf(noteFolders, folder.id);
    setEditingId(null);
    setDraggedId(folder.id);
    dragAlong({
      key: folder.id,
      rows: [chipRow.current!],
      at,
      onEnd: () => setDraggedId(null),
      onDrop: (drop) => {
        const next = moveItem({ left: order, right: [] }, folder.id, drop).left;
        if (folder.parentId) move.mutate({ id: folder.id, parentId: null, order: next, moved: true });
        else if (next.join() !== order.join()) reorder.mutate(next);
      },
      nest: {
        allows: (into) => !inside.has(into) && into !== (folder.parentId ?? ""),
        onDrop: (into) => move.mutate({ id: folder.id, parentId: into || null, moved: true }),
      },
    });
  };
  const editingFolder = noteFolders.find((folder) => folder.id === editingId);
  const editorFor = (folder: NoteFolder, onCard = false) => (
    <NoteFolderEditor key={folder.id} folder={folder} parentName={pathTo(noteFolders, folder.parentId).at(-1)?.name} onCard={onCard} onClose={closeEditor} />
  );
  const subfolders = pickedId ? childrenOf(noteFolders, pickedId) : [];
  const shown = notes.data.notes.filter((note) => pickedId === null || note.noteFolderId === pickedId);

  return (
    <div className="space-y-4">
      <div className="relative">
        {/* Scrolled sideways, the open folder's card would no longer be under its chip. */}
        <nav ref={chipRow} className="flex items-center gap-1 overflow-x-auto pb-1" aria-label="Note folders" onScroll={() => setEditingId(null)}>
          <button
            type="button"
            className={chip(pickedId === null)}
            data-tab-drop={NOTES_TAB}
            data-nest=""
            aria-pressed={pickedId === null}
            title="Every note. Drop a note here to take it out of its folder, or a folder to bring it up to the top."
            onClick={() => pick(null)}
          >
            <span className="tab-icon tab-icon-notes !size-[21px] !bg-size-[20px]" aria-hidden />
            All
          </button>
          {topLevel.map((folder) => (
            <NoteFolderChip
              key={folder.id}
              folder={folder}
              isActive={pickedId === folder.id}
              isOpen={path[0]?.id === folder.id}
              isEditing={editingId === folder.id}
              isDragged={draggedId === folder.id}
              onPick={() => pick(folder.id)}
              onEdit={setEditingId}
              onDrag={(_, at) => dragFolder(folder, at)}
            />
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
        {editingFolder && !editingFolder.parentId && editorFor(editingFolder)}
      </div>
      {(createFolder.error ?? reorder.error ?? move.error) && <p className="text-sm text-red-600">{(createFolder.error ?? reorder.error ?? move.error)!.message}</p>}
      <div className="flex justify-center gap-2">
        {/* Made in the folder that is shown, and opened to be written in. */}
        <button type="button" className="nes-btn btn-small" onClick={newNote}>
          + New note
        </button>
        {/* In a folder, one inside it: its name and colour open under its icon. */}
        {pickedId && (
          <NeedsConnection>
            <button type="button" className="nes-btn btn-small" disabled={createFolder.isPending} onClick={() => createFolder.mutate({ parentId: pickedId }, { onSuccess: (made) => setEditingId(made.id) })}>
              + New folder
            </button>
          </NeedsConnection>
        )}
      </div>
      {shown.length === 0 && subfolders.length === 0 ? (
        <p className="text-center text-sm text-stone-500">{pickedId ? "No notes in this folder yet: drop one on it, or write a new one here." : "No notes yet."}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]" aria-label="Notes">
          {subfolders.map((folder) => (
            <li key={folder.id}>
              <NoteFolderCard
                folder={folder}
                isEditing={editingId === folder.id}
                isDragged={draggedId === folder.id}
                onOpen={() => pick(folder.id)}
                onEdit={setEditingId}
                onDrag={(_, at) => dragFolder(folder, at)}
              >
                {editingId === folder.id && editorFor(folder, true)}
              </NoteFolderCard>
            </li>
          ))}
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
