import { useRef, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router";
import { useFolders, useReorderFolders } from "../../hooks/folders";
import { usePoints } from "../../hooks/points";
import { useUpdateMe } from "../../hooks/useAuth";
import { useStandalone } from "../../lib/standalone";
import { folderOfKey, folderOrder, moveItem, resolveTaskBar, type BarSide } from "../../lib/taskBar";
import type { User } from "../../types";
import { CharacterFace } from "../Character/CharacterFace";
import { Bell } from "../Notifications/Bell";
import { AppBars } from "./AppBars";
import { barTab as tab, useNewFolderTab, usePublishedHeight } from "./barHooks";
import { Clock } from "./Clock";
import { FolderTab, NewFolderTab, useFolderEditing } from "./FolderTabs";
import { dragAlong, useTabPress, type OnTabDrag } from "./tabDrag";

export function NavBar({ user }: { user: User }) {
  const isStandalone = useStandalone();
  return isStandalone ? <AppBars user={user} /> : <TaskBar user={user} />;
}

const DRAG_HINT = "Drag to move it along the bar, to either side.";

/** One of the bar's own items (not a folder): a click does what it always did; moved (a finger after a hold), it is dragged to another place. */
function BarItem({ itemKey, isDragged, onDrag, children }: { itemKey: string; isDragged: boolean; onDrag: OnTabDrag; children: ReactNode }) {
  const press = useTabPress<HTMLSpanElement>({ onDrag });
  return (
    <span
      ref={press.ref}
      className="relative flex flex-none"
      data-bar-item={itemKey}
      data-lifted={press.isLifted || undefined}
      data-dragged={isDragged || undefined}
      // A held touch must not turn into a text selection or the browser's own menu (a right-click still has it).
      style={{ WebkitTouchCallout: "none", userSelect: "none" }}
      onPointerDown={press.onPointerDown}
      onClickCapture={press.onClickCapture}
      onContextMenu={(e) => press.pressing.current && e.preventDefault()}
    >
      {children}
    </span>
  );
}

function TaskBar({ user }: { user: User }) {
  const { data: points } = usePoints();
  const { data: folders = [] } = useFolders();
  const bar = useRef<HTMLElement>(null);
  const leftSide = useRef<HTMLElement>(null);
  const rightSide = useRef<HTMLDivElement>(null);
  usePublishedHeight(bar, "--bar-h");
  const { isNewShown, onNewUsed, handlers } = useNewFolderTab(bar);
  const [editingId, setEditingId] = useFolderEditing();
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const updateMe = useUpdateMe();
  const reorderFolders = useReorderFolders();
  const layout = resolveTaskBar(user.taskBar, folders.map((folder) => folder.id));

  /** Drags the item `key` along the bar, to either side of the logo; where it is let go is saved, and the folders take the order they are shown in. */
  function drag(key: string, at: { x: number; y: number }) {
    setEditingId(null);
    setDraggedKey(key);
    dragAlong({
      key,
      rows: [leftSide.current!, rightSide.current!],
      at,
      onEnd: () => setDraggedKey(null),
      onDrop: (drop) => {
        const next = moveItem(layout, key, drop);
        if (next === layout || JSON.stringify(next) === JSON.stringify(layout)) return;
        updateMe.mutate({ taskBar: next });
        const order = folderOrder(next);
        if (order.join() !== folders.map((folder) => folder.id).join()) reorderFolders.mutate(order);
      },
    });
  }

  function item(key: string, side: BarSide) {
    const folder = folders.find((other) => other.id === folderOfKey(key));
    if (folder) {
      return (
        <FolderTab
          key={key}
          folder={folder}
          tab={tab}
          opensBelow={false}
          isEditing={editingId === folder.id}
          onEdit={setEditingId}
          isDragged={draggedKey === key}
          onDrag={(_, at) => drag(key, at)}
        />
      );
    }
    let content: ReactNode = null;
    switch (key) {
      case "tasks":
        content = (
          // A box dragged from a folder's page and dropped on Tasks is no longer shown in that folder (see useDropOnTab).
          <NavLink to="/" end className={tab} aria-label="Tasks" title={`Tasks. ${DRAG_HINT}`} data-tab-drop="main" draggable={false}>
            <span className="tab-icon tab-icon-tasks" aria-hidden />
            Tasks
          </NavLink>
        );
        break;
      case "stats":
        content = (
          <NavLink to="/stats" className={tab} aria-label="Stats" title={`Stats. ${DRAG_HINT}`} draggable={false}>
            <span className="tab-icon tab-icon-stats" aria-hidden />
            Stats
          </NavLink>
        );
        break;
      case "calendar":
        content = (
          <NavLink to="/calendar" className={tab} aria-label="Calendar" title={`Calendar. ${DRAG_HINT}`} draggable={false}>
            <span className="tab-icon tab-icon-calendar" aria-hidden />
            Calendar
          </NavLink>
        );
        break;
      case "notes":
        content = user.notesTab && (
          <NavLink to="/notes" className={tab} aria-label="Notes" title={`Notes. ${DRAG_HINT}`} draggable={false}>
            <span className="tab-icon tab-icon-notes" aria-hidden />
            Notes
          </NavLink>
        );
        break;
      case "points":
        // The balance, laid out like a tab: a big number where the icon would be, "pts" underneath. None while the points system is off.
        content = !user.pointsOff && points && (
          <NavLink
            to="/points"
            className={tab}
            data-nav-balance={points.balance}
            aria-label="Points"
            title={`Your points: earned minus spent. Click for the history. ${DRAG_HINT}`}
            draggable={false}
          >
            <span className="flex h-[21px] items-center text-sm leading-none tabular-nums sm:h-[42px] sm:text-3xl">{points.balance}</span>
            {points.balance === 1 ? "pt" : "pts"}
          </NavLink>
        );
        break;
      case "user":
        // The user's own page (and logging out), under their name.
        content = (
          <NavLink to="/user" className={tab} aria-label="Account" title={`${user.username}. ${DRAG_HINT}`} draggable={false}>
            <CharacterFace user={user} className="tab-icon" iconClass="tab-icon tab-icon-user" />
            <span className="max-w-16 truncate sm:max-w-28">{user.username}</span>
          </NavLink>
        );
        break;
      case "clock":
        // The clock with a teeny bell beside the time: a click opens the notifications (passed deadlines, each asking for a new date), on its side of the screen.
        content = (
          <span className="flex items-center text-sm">
            <Bell side={side}>{(bell) => <Clock beforeTime={bell} />}</Bell>
          </span>
        );
        break;
    }
    if (!content) return null;
    return (
      <BarItem key={key} itemKey={key} isDragged={draggedKey === key} onDrag={(_, at) => drag(key, at)}>
        {content}
      </BarItem>
    );
  }

  return (
    // A task bar: fixed along the bottom of the screen, 70% opaque, while the page scrolls above it (AppShell leaves room for it).
    <header
      ref={bar}
      {...handlers}
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-stone-300 bg-white/70 pb-[env(safe-area-inset-bottom)] dark:border-stone-700 dark:bg-stone-900/70"
    >
      {/*
        Two sides with the logo in the middle (equal side columns keep it centred). At first the pages and folders are at
        the left and the points, account and clock at the right, but every item can be dragged to another place, to either
        side (User.taskBar, lib/taskBar.ts). Below 1280px wide (a phone, a window on half the screen) the logo would crowd
        the tabs: there it is just the two ends.
      */}
      <div className="flex items-center justify-between gap-x-2 px-2 py-1.5 sm:gap-x-4 sm:px-3 xl:grid xl:grid-cols-[1fr_auto_1fr]">
        {/* With folders there can be many tabs: they wrap onto more rows, or on a phone scroll sideways in one. */}
        <nav ref={leftSide} className="flex min-w-0 items-center gap-1 max-sm:overflow-x-auto sm:flex-wrap" aria-label="Pages" data-bar-side="left">
          {layout.left.map((key) => item(key, "left"))}
          <NewFolderTab tab={tab} isNewShown={isNewShown} onNewUsed={onNewUsed} onMade={setEditingId} />
        </nav>
        <Link to="/" className="logo h-[42px] max-xl:hidden" aria-label="Donegeon" />
        <div ref={rightSide} className="flex flex-none flex-wrap items-center justify-end gap-x-2 sm:gap-x-3" data-bar-side="right">
          {layout.right.map((key) => item(key, "right"))}
        </div>
      </div>
    </header>
  );
}
