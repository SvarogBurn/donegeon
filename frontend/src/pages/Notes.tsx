import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { useSearchParams } from "react-router";
import { ColorChoices } from "../components/ColorChoices";
import { NeedsConnection } from "../components/NeedsConnection";
import { NoteBox } from "../components/Notes/NoteBox";
import { TreeProvider } from "../components/TaskTree/TreeContext";
import { TreeError, UndoBar } from "../components/TaskTree/TreeStatus";
import { TileGrid } from "../components/Tiles/TileGrid";
import {
  useAddNote,
  useCreateNoteFolder,
  useDeleteNoteFolder,
  useDropOnTab,
  useEditNote,
  useLayout,
  useNotes,
  useSaveLayout,
  useTaskTrees,
  useUpdateNoteFolder,
} from "../hooks/useTasks";
import { noteView } from "../lib/folders";
import { FOLDER_COLOR, folderIn } from "../lib/frameTones";
import { normalizeLayout } from "../lib/tileLayout";
import type { NoteFolder } from "../types";

/** How long a folder is held down before its name and colour open. */
const HOLD_MS = 500;
/** A note's box dropped on one of the folders along the top of the page: data-tab-drop="notes:<id>" ("notes:" = All). */
const NOTES_TAB = "notes:";

/** A note folder's name and colour, and removing it (its notes stay, under All). Opens under its chip. */
function NoteFolderEditor({ folder, onClose }: { folder: NoteFolder; onClose: () => void }) {
  const update = useUpdateNoteFolder();
  const remove = useDeleteNoteFolder();
  const [name, setName] = useState(folder.name);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (e: globalThis.PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  function saveName() {
    const next = name.trim();
    if (!next) setName(folder.name);
    else if (next !== folder.name) update.mutate({ id: folder.id, changes: { name: next } });
  }

  return (
    <div ref={ref} className="card absolute top-full left-0 z-50 mt-2 w-52 space-y-2 !p-2 text-xs shadow-lg max-sm:fixed max-sm:inset-x-2 max-sm:top-auto max-sm:mt-0 max-sm:w-auto" role="dialog" aria-label={`Note folder "${folder.name}"`}>
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
    <span className="relative flex flex-none">
      <button
        type="button"
        className={chip(isActive)}
        data-tab-drop={`${NOTES_TAB}${folder.id}`}
        data-note-folder={folder.name}
        aria-pressed={isActive}
        title={`${folder.name}. Hold or right-click for its name and colour; drop a note here to put it in.`}
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
      </button>
      {isEditing && <NoteFolderEditor folder={folder} onClose={() => onEdit(null)} />}
    </span>
  );
}

/**
 * The Notes page: notes of their own, on no task. Along the top, the page's own folders for notes (All, then the
 * user's); a click shows that folder's notes, and a note's box dropped on one goes into it. A note's box dropped on a
 * folder of the task bar is shown in that folder too, like a list.
 */
export function NotesPage() {
  const tasks = useTaskTrees();
  const notes = useNotes();
  const layout = useLayout("notes");
  const saveLayout = useSaveLayout("notes");
  const drop = useDropOnTab();
  const addNote = useAddNote();
  const editNote = useEditNote();
  const createFolder = useCreateNoteFolder();
  const [params, setParams] = useSearchParams();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [madeId, setMadeId] = useState<string | null>(null);

  const error = notes.error ?? tasks.error;
  if (error) return <p className="text-sm text-red-600">Couldn't load your notes: {error.message}</p>;
  if (!notes.data || !tasks.data || layout.isLoading) return <p className="text-sm text-stone-500">Loading…</p>;
  const { noteFolders } = notes.data;
  // A folder that was removed shows All.
  const pickedId = noteFolders.some((folder) => folder.id === params.get("folder")) ? params.get("folder") : null;
  const pick = (id: string | null) => setParams(id ? { folder: id } : {}, { replace: true });
  const shown = notes.data.notes.filter((note) => pickedId === null || note.noteFolderId === pickedId);

  const tiles = shown.map((note) => ({
    key: noteView(note.id),
    view: noteView(note.id),
    name: `note "${note.title || "Note"}"`,
    node: <NoteBox note={note} startEditing={note.id === madeId} />,
  }));

  function dropOnTab(view: string, tab: string) {
    if (!tab.startsWith(NOTES_TAB)) return drop.dropOnTab(view, tab);
    editNote.mutate({ id: view.slice("note:".length), changes: { noteFolderId: tab.slice(NOTES_TAB.length) || null } });
  }

  return (
    <TreeProvider tasks={tasks.data}>
      <div className="space-y-4">
        <nav className="flex items-center gap-1 overflow-x-auto pb-1" aria-label="Note folders">
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
        {createFolder.error && <p className="text-sm text-red-600">{createFolder.error.message}</p>}
        <TreeError />
        <div className="flex justify-center">
          <button type="button" className="nes-btn btn-small" onClick={() => setMadeId(addNote.mutate({ noteFolderId: pickedId }))}>
            + New note
          </button>
        </div>
        {shown.length === 0 ? (
          <p className="text-center text-sm text-stone-500">{pickedId ? "No notes in this folder yet: drop one on it, or write a new one here." : "No notes yet."}</p>
        ) : (
          <TileGrid tiles={tiles} layout={normalizeLayout(layout.data)} onChange={(next) => saveLayout.mutate(next)} onDropOnTab={dropOnTab} />
        )}
        {drop.error && <p className="text-center text-sm text-red-600">Couldn't change the folder: {drop.error.message}</p>}
        <UndoBar />
      </div>
    </TreeProvider>
  );
}
