import { useEffect, useRef, useState, type MouseEvent } from "react";
import { NavLink, useMatch, useNavigate } from "react-router";
import { useCreateFolder, useDeleteFolder, useFolders, useReorderFolders, useUpdateFolder } from "../../hooks/folders";
import { FOLDER_COLOR, folderIn } from "../../lib/frameTones";
import { NAME_FOLDER_EVENT } from "../../lib/folders";
import { useOnline } from "../../lib/offline/online";
import { folderKey, folderOrder, moveItem } from "../../lib/taskBar";
import type { Folder } from "../../types";
import { ColorChoices } from "../ColorChoices";
import { dragAlong, useTabPress, type OnTabDrag } from "./tabDrag";

/** A folder's name and its icon's colour, and removing the folder. Opens above its tab. */
function FolderEditor({ folder, opensBelow, onClose }: { folder: Folder; opensBelow: boolean; onClose: () => void }) {
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
    // On a phone the tabs scroll sideways, which would cut it off: there it is laid across the screen, just above the bar
    // (or just under the installed app's top strip).
    <div
      ref={ref}
      className={`card absolute left-0 z-50 w-52 space-y-2 !p-2 text-xs shadow-lg max-sm:fixed max-sm:inset-x-2 max-sm:w-auto ${opensBelow ? "top-full mt-2 max-sm:top-[calc(var(--top-h,4rem)+0.5rem)] max-sm:mt-0" : "bottom-full mb-2 max-sm:bottom-[calc(var(--bar-h,5rem)+0.5rem)] max-sm:mb-0"}`}
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

interface FolderTabProps {
  folder: Folder;
  tab: (state: { isActive: boolean }) => string;
  opensBelow: boolean;
  isEditing: boolean;
  onEdit: (id: string | null) => void;
  isDragged: boolean;
  /** The pointer down on the tab has become a drag, at `at`. */
  onDrag: OnTabDrag;
}

/** A folder's tab: a click opens it; held, right-clicked or clicked on its own page, its name and colour open; moved, it is dragged to another place. */
export function FolderTab({ folder, tab, opensBelow, isEditing, onEdit, isDragged, onDrag }: FolderTabProps) {
  const isOpenPage = useMatch(`/folders/${folder.id}`) !== null;
  const press = useTabPress<HTMLAnchorElement>({ onDrag, onHoldRelease: () => onEdit(folder.id) });

  // A plain click opens the folder (one that ends a hold or a drag is stopped before this).
  function onClick(e: MouseEvent) {
    if (!isOpenPage) return;
    e.preventDefault();
    onEdit(isEditing ? null : folder.id);
  }

  return (
    <span
      className="relative flex flex-none"
      data-bar-item={folderKey(folder.id)}
      data-folder-id={folder.id}
      data-lifted={press.isLifted || undefined}
      data-dragged={isDragged || undefined}
    >
      <NavLink
        ref={press.ref}
        to={`/folders/${folder.id}`}
        className={tab}
        data-tab-drop={folder.id}
        data-folder-tab={folder.name}
        aria-label={`Folder ${folder.name}`}
        title={`${folder.name}. Drag to move it along the bar; hold or right-click for its name and colour; drop a list or a stats box here to show it in the folder.`}
        // A held touch must not turn into a text selection or the browser's own menu.
        style={{ WebkitTouchCallout: "none", userSelect: "none" }}
        draggable={false}
        onPointerDown={press.onPointerDown}
        onClickCapture={press.onClickCapture}
        onClick={onClick}
        onContextMenu={(e) => {
          e.preventDefault();
          // A finger's long-press: letting go opens it, unless the tab is dragged meanwhile.
          if (press.pressing.current) return;
          onEdit(folder.id);
        }}
      >
        <span className="tab-icon tab-icon-folder" style={folder.color ? { backgroundImage: folderIn(folder.color) } : undefined} aria-hidden />
        <span className="max-w-16 truncate sm:max-w-24">{folder.name}</span>
      </NavLink>
      {isEditing && <FolderEditor folder={folder} opensBelow={opensBelow} onClose={() => onEdit(null)} />}
    </span>
  );
}

interface Props {
  tab: (state: { isActive: boolean }) => string;
  /** Whether the "New" tab was called up (a click or a hold on the bar's empty space). */
  isNewShown: boolean;
  /** The "New" tab has done its job and goes away again. */
  onNewUsed: () => void;
  /** The tabs are along the top of the screen (the installed app), so a folder's name and colour open under its tab. */
  opensBelow?: boolean;
}

/** Which folder's name and colour are open; a folder just made (by a drop on "New" too) opens its own. */
export function useFolderEditing() {
  const [editingId, setEditingId] = useState<string | null>(null);
  useEffect(() => {
    const onMade = (e: Event) => setEditingId((e as CustomEvent<string>).detail);
    window.addEventListener(NAME_FOLDER_EVENT, onMade);
    return () => window.removeEventListener(NAME_FOLDER_EVENT, onMade);
  }, []);
  return [editingId, setEditingId] as const;
}

/**
 * The "New" tab that makes a folder: by a click, or by dropping a list or a stats box on it (TileGrid looks for
 * data-tab-drop under a dragged tile that has a view). It is out of sight until it is called up, or such a tile is
 * being dragged (.new-folder-slot in index.css). The new folder opens its name for typing (`onMade`).
 */
export function NewFolderTab({ tab, isNewShown, onNewUsed, onMade }: Omit<Props, "opensBelow"> & { onMade: (id: string) => void }) {
  const create = useCreateFolder();
  const online = useOnline();
  return (
    <span className="new-folder-slot" data-shown={isNewShown || undefined}>
      <button
        type="button"
        className={`${tab({ isActive: false })} flex-none cursor-pointer`}
        data-tab-drop="new"
        aria-label="New folder"
        title="A new folder: a tab of its own showing some of your lists and stats. Drop a list or a stats box here to start one with it."
        disabled={create.isPending || !online}
        onClick={() => {
          onNewUsed();
          create.mutate({}, { onSuccess: (made) => onMade(made.id) });
        }}
      >
        <span className="tab-icon tab-icon-folder opacity-50" aria-hidden />
        + New
      </button>
    </span>
  );
}

/**
 * The user's folders as tabs of the installed app's top strip, and the "New" tab. A folder's tab is dragged along the
 * strip to another place among them. (The browser's task bar lays out its folders itself, among its other items: NavBar.)
 */
export function FolderTabs({ tab, isNewShown, onNewUsed, opensBelow = false }: Props) {
  const { data: folders = [] } = useFolders();
  const [editingId, setEditingId] = useFolderEditing();
  const reorder = useReorderFolders();
  const [draggedId, setDraggedId] = useState<string | null>(null);

  // Let go beside another folder, it takes that place.
  function dragTab(id: string, el: HTMLElement, at: { x: number; y: number }) {
    const order = folders.map((folder) => folder.id);
    setEditingId(null);
    setDraggedId(id);
    dragAlong({
      key: folderKey(id),
      rows: [el.closest("nav") ?? el.parentElement!],
      at,
      onEnd: () => setDraggedId(null),
      onDrop: (drop) => {
        const next = folderOrder(moveItem({ left: order.map(folderKey), right: [] }, folderKey(id), drop));
        if (next.join() !== order.join()) reorder.mutate(next);
      },
    });
  }

  return (
    <>
      {folders.map((folder) => (
        <FolderTab
          key={folder.id}
          folder={folder}
          tab={tab}
          opensBelow={opensBelow}
          isEditing={editingId === folder.id}
          onEdit={setEditingId}
          isDragged={draggedId === folder.id}
          onDrag={(el, at) => dragTab(folder.id, el, at)}
        />
      ))}
      <NewFolderTab tab={tab} isNewShown={isNewShown} onNewUsed={onNewUsed} onMade={setEditingId} />
    </>
  );
}
