import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { NavLink, useMatch, useNavigate } from "react-router";
import { useCreateFolder, useDeleteFolder, useFolders, useReorderFolders, useUpdateFolder } from "../../hooks/folders";
import { FOLDER_COLOR, folderIn } from "../../lib/frameTones";
import { NAME_FOLDER_EVENT } from "../../lib/folders";
import { useOnline } from "../../lib/offline/online";
import type { Folder } from "../../types";
import { ColorChoices } from "../ColorChoices";

/** How long a tab is held down before its name and colour open (on letting go), or it can be dragged by a finger. */
const HOLD_MS = 500;
/** How far the pointer moves before it is a drag rather than a click. */
const MOVE_PX = 6;
/** How close to the ends of a row of tabs that scrolls sideways a dragged tab must be for it to scroll on. */
const EDGE_PX = 32;

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
  onDrag: (tab: HTMLElement, at: { x: number; y: number }) => void;
}

function FolderTab({ folder, tab, opensBelow, isEditing, onEdit, isDragged, onDrag }: FolderTabProps) {
  const isOpenPage = useMatch(`/folders/${folder.id}`) !== null;
  const hold = useRef(0);
  const held = useRef(false);
  const dragged = useRef(false);
  // A pointer is down on the tab: its press is not over yet.
  const pressing = useRef(false);
  const [isLifted, setIsLifted] = useState(false);
  const link = useRef<HTMLAnchorElement>(null);
  const endPress = useRef(() => {});

  // A finger held on the tab drags it, rather than scrolling the row of tabs.
  useEffect(() => {
    const el = link.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => held.current && pressing.current && e.cancelable && e.preventDefault();
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);
  useEffect(() => () => endPress.current(), []);

  // Held still and let go, the tab opens its name and colour; moved (a finger only after the hold), it is dragged to another place.
  function onPointerDown(e: PointerEvent<HTMLAnchorElement>) {
    if (e.button !== 0) return;
    endPress.current();
    held.current = false;
    dragged.current = false;
    pressing.current = true;
    const el = e.currentTarget;
    const { pointerId, pointerType } = e;
    const start = { x: e.clientX, y: e.clientY };
    hold.current = window.setTimeout(() => {
      held.current = true;
      setIsLifted(true);
    }, HOLD_MS);
    const end = () => {
      pressing.current = false;
      window.clearTimeout(hold.current);
      setIsLifted(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
    const onMove = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== pointerId || Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < MOVE_PX) return;
      // A finger that moves before the hold scrolls the row of tabs.
      if (pointerType === "touch" && !held.current) return end();
      end();
      dragged.current = true;
      onDrag(el, { x: ev.clientX, y: ev.clientY });
    };
    const onUp = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      end();
      if (held.current) onEdit(folder.id);
    };
    // The browser took the press over (the row scrolled, or its own long-press): a hold still opens the name and colour.
    const onCancel = onUp;
    endPress.current = end;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  // A plain click opens the folder. Its name and colour open by holding the tab, right-clicking it, or clicking it while its page is the open one.
  function onClick(e: MouseEvent) {
    if (held.current || dragged.current) return e.preventDefault();
    if (!isOpenPage) return;
    e.preventDefault();
    onEdit(isEditing ? null : folder.id);
  }

  return (
    <span className="relative flex flex-none" data-folder-id={folder.id} data-lifted={isLifted || undefined} data-dragged={isDragged || undefined}>
      <NavLink
        ref={link}
        to={`/folders/${folder.id}`}
        className={tab}
        data-tab-drop={folder.id}
        data-folder-tab={folder.name}
        aria-label={`Folder ${folder.name}`}
        title={`${folder.name}. Drag to move it along the bar; hold or right-click for its name and colour; drop a list or a stats box here to show it in the folder.`}
        // A held touch must not turn into a text selection or the browser's own menu.
        style={{ WebkitTouchCallout: "none", userSelect: "none" }}
        draggable={false}
        onPointerDown={onPointerDown}
        onClick={onClick}
        onContextMenu={(e) => {
          e.preventDefault();
          // A finger's long-press: letting go opens it, unless the tab is dragged meanwhile.
          if (pressing.current) return;
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

/**
 * The user's folders as tabs of the task bar, after Tasks and Done, and the
 * "New" tab that makes one: by a click, or by dropping a list or a stats box on it (TileGrid
 * looks for data-tab-drop under a dragged tile that has a view). "New" is out of sight until it
 * is called up, or such a tile is being dragged (.new-folder-slot in index.css).
 * A new folder opens its name for typing. A folder's tab is dragged along the bar to another place among them.
 */
export function FolderTabs({ tab, isNewShown, onNewUsed, opensBelow = false }: Props) {
  const { data: folders = [] } = useFolders();
  const create = useCreateFolder();
  const online = useOnline();
  const [editingId, setEditingId] = useState<string | null>(null);
  const reorder = useReorderFolders();
  const [draggedId, setDraggedId] = useState<string | null>(null);

  /**
   * Drags the tab of `id` along its row: the tab it would land beside is marked on that side (data-reorder), a row
   * that scrolls sideways scrolls on near its ends, and letting go there puts it in that place. Let go away from the
   * row, it stays where it was.
   */
  function dragTab(id: string, tab: HTMLElement, at: { x: number; y: number }) {
    const row = tab.closest("nav") ?? tab.parentElement!;
    const order = folders.map((folder) => folder.id);
    let pointer = at;
    let target: { el: HTMLElement; after: boolean } | null = null;
    const mark = (next: typeof target) => {
      target?.el.removeAttribute("data-reorder");
      next?.el.setAttribute("data-reorder", next.after ? "after" : "before");
      target = next;
    };
    const retarget = () => {
      const bounds = row.getBoundingClientRect();
      if (pointer.y < bounds.top - 30 || pointer.y > bounds.bottom + 30) return mark(null);
      const over = document.elementFromPoint(pointer.x, pointer.y)?.closest<HTMLElement>("[data-folder-id]");
      // Between two tabs it keeps the place it had.
      if (!over || !row.contains(over)) return;
      if (over.dataset.folderId === id) return mark(null);
      const rect = over.getBoundingClientRect();
      mark({ el: over, after: pointer.x > rect.left + rect.width / 2 });
    };
    let frame = 0;
    const scroll = () => {
      const bounds = row.getBoundingClientRect();
      const fromLeft = pointer.x - bounds.left;
      const fromRight = bounds.right - pointer.x;
      const speed = fromLeft < EDGE_PX ? -Math.ceil((EDGE_PX - fromLeft) / 4) : fromRight < EDGE_PX ? Math.ceil((EDGE_PX - fromRight) / 4) : 0;
      if (speed !== 0 && row.scrollWidth > row.clientWidth) {
        row.scrollLeft += speed;
        retarget();
      }
      frame = requestAnimationFrame(scroll);
    };
    const noScroll = (e: TouchEvent) => e.cancelable && e.preventDefault();
    const onMove = (e: globalThis.PointerEvent) => {
      pointer = { x: e.clientX, y: e.clientY };
      retarget();
    };
    const finish = (drop: boolean) => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("touchmove", noScroll);
      document.documentElement.style.cursor = "";
      setDraggedId(null);
      const landed = target;
      mark(null);
      if (!drop || !landed) return;
      const next = order.filter((other) => other !== id);
      next.splice(next.indexOf(landed.el.dataset.folderId!) + (landed.after ? 1 : 0), 0, id);
      if (next.join() !== order.join()) reorder.mutate(next);
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    setEditingId(null);
    setDraggedId(id);
    document.documentElement.style.cursor = "grabbing";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("touchmove", noScroll, { passive: false });
    frame = requestAnimationFrame(scroll);
    retarget();
  }

  useEffect(() => {
    const onMade = (e: Event) => setEditingId((e as CustomEvent<string>).detail);
    window.addEventListener(NAME_FOLDER_EVENT, onMade);
    return () => window.removeEventListener(NAME_FOLDER_EVENT, onMade);
  }, []);

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
