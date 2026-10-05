import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { NavLink, useMatch, useNavigate } from "react-router";
import { useCreateFolder, useDeleteFolder, useFolders, useUpdateFolder } from "../../hooks/useTasks";
import { FOLDER_COLOR, folderIn } from "../../lib/frameTones";
import { NAME_FOLDER_EVENT } from "../../lib/folders";
import type { Folder } from "../../types";
import { ColorChoices } from "../ColorChoices";

/** How long a tab is held down before its name and colour open. */
const HOLD_MS = 500;

/** A folder's name and its icon's colour, and removing the folder. Opens above its tab. */
function FolderEditor({ folder, onClose }: { folder: Folder; onClose: () => void }) {
  const update = useUpdateFolder();
  const remove = useDeleteFolder();
  const navigate = useNavigate();
  const isOpenPage = useMatch(`/folders/${folder.id}`) !== null;
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
    // On a phone the tabs scroll sideways, which would cut it off: there it is laid across the screen, just above the bar.
    <div
      ref={ref}
      className="card absolute bottom-full left-0 z-50 mb-2 w-52 space-y-2 !p-2 text-xs shadow-lg max-sm:fixed max-sm:inset-x-2 max-sm:bottom-[calc(var(--bar-h,5rem)+0.5rem)] max-sm:mb-0 max-sm:w-auto"
      role="dialog"
      aria-label={`Folder "${folder.name}"`}
    >
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
        // The name is what one comes here for; a new folder's "Folder" is ready to be typed over.
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
      <button
        type="button"
        className="btn-quiet !text-red-600"
        title="Removes the tab only: the lists it shows stay on the Tasks page"
        onClick={() => {
          onClose();
          remove.mutate(folder.id, { onSuccess: () => isOpenPage && navigate("/") });
        }}
      >
        Remove folder
      </button>
      {(update.error ?? remove.error) && <p className="text-red-600">{(update.error ?? remove.error)!.message}</p>}
    </div>
  );
}

function FolderTab({ folder, tab, isEditing, onEdit }: { folder: Folder; tab: (state: { isActive: boolean }) => string; isEditing: boolean; onEdit: (id: string | null) => void }) {
  const isOpenPage = useMatch(`/folders/${folder.id}`) !== null;
  const hold = useRef(0);
  const held = useRef(false);

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    held.current = false;
    window.clearTimeout(hold.current);
    hold.current = window.setTimeout(() => {
      held.current = true;
      onEdit(folder.id);
    }, HOLD_MS);
  }
  const cancelHold = () => window.clearTimeout(hold.current);
  useEffect(() => cancelHold, []);

  // A plain click opens the folder. Its name and colour open by holding the tab, right-clicking it, or clicking it while its page is the open one.
  function onClick(e: MouseEvent) {
    if (held.current) return e.preventDefault();
    if (!isOpenPage) return;
    e.preventDefault();
    onEdit(isEditing ? null : folder.id);
  }

  return (
    <span className="relative flex flex-none">
      <NavLink
        to={`/folders/${folder.id}`}
        className={tab}
        data-tab-drop={folder.id}
        data-folder-tab={folder.name}
        aria-label={`Folder ${folder.name}`}
        title={`${folder.name}. Hold or right-click for its name and colour; drop a list or a stats box here to show it in the folder.`}
        // A held touch must not turn into a text selection or the browser's own menu.
        style={{ WebkitTouchCallout: "none", userSelect: "none" }}
        draggable={false}
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
        <span className="tab-icon tab-icon-folder" style={folder.color ? { backgroundImage: folderIn(folder.color) } : undefined} aria-hidden />
        <span className="max-w-16 truncate sm:max-w-24">{folder.name}</span>
      </NavLink>
      {isEditing && <FolderEditor folder={folder} onClose={() => onEdit(null)} />}
    </span>
  );
}

interface Props {
  tab: (state: { isActive: boolean }) => string;
  /** Whether the "New" tab was called up (a click or a hold on the bar's empty space). */
  isNewShown: boolean;
  /** The "New" tab has done its job and goes away again. */
  onNewUsed: () => void;
}

/**
 * The user's folders as tabs of the task bar, after Tasks and Done, and the
 * "New" tab that makes one: by a click, or by dropping a list or a stats box on it (TileGrid
 * looks for data-tab-drop under a dragged tile that has a view). "New" is out of sight until it
 * is called up, or such a tile is being dragged (.new-folder-slot in index.css).
 * A new folder opens its name for typing.
 */
export function FolderTabs({ tab, isNewShown, onNewUsed }: Props) {
  const { data: folders = [] } = useFolders();
  const create = useCreateFolder();
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const onMade = (e: Event) => setEditingId((e as CustomEvent<string>).detail);
    window.addEventListener(NAME_FOLDER_EVENT, onMade);
    return () => window.removeEventListener(NAME_FOLDER_EVENT, onMade);
  }, []);

  return (
    <>
      {folders.map((folder) => (
        <FolderTab key={folder.id} folder={folder} tab={tab} isEditing={editingId === folder.id} onEdit={setEditingId} />
      ))}
      <span className="new-folder-slot" data-shown={isNewShown || undefined}>
        <button
          type="button"
          className={`${tab({ isActive: false })} flex-none cursor-pointer`}
          data-tab-drop="new"
          aria-label="New folder"
          title="A new folder: a tab of its own showing some of your lists and stats. Drop a list or a stats box here to start one with it."
          disabled={create.isPending}
          onClick={() => {
            onNewUsed();
            create.mutate({}, { onSuccess: (made) => setEditingId(made.id) });
          }}
        >
          <span className="tab-icon tab-icon-folder opacity-50" aria-hidden />
          + New
        </button>
      </span>
    </>
  );
}
