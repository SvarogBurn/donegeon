import { useRef } from "react";
import { Link, NavLink } from "react-router";
import { usePoints } from "../../hooks/points";
import { useStandalone } from "../../lib/standalone";
import type { User } from "../../types";
import { Bell } from "../Notifications/Bell";
import { AppBars } from "./AppBars";
import { barTab as tab, useNewFolderTab, usePublishedHeight } from "./barHooks";
import { Clock } from "./Clock";
import { FolderTabs } from "./FolderTabs";

export function NavBar({ user }: { user: User }) {
  const isStandalone = useStandalone();
  return isStandalone ? <AppBars user={user} /> : <TaskBar user={user} />;
}

function TaskBar({ user }: { user: User }) {
  const { data: points } = usePoints();
  const bar = useRef<HTMLElement>(null);
  usePublishedHeight(bar, "--bar-h");
  const { isNewShown, onNewUsed, handlers } = useNewFolderTab(bar);

  return (
    // A task bar: fixed along the bottom of the screen, 70% opaque, while the page scrolls above it (AppShell leaves room for it).
    <header
      ref={bar}
      {...handlers}
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-stone-300 bg-white/70 pb-[env(safe-area-inset-bottom)] dark:border-stone-700 dark:bg-stone-900/70"
    >
      {/*
        Tabs at the far left, the logo in the middle (equal side columns keep it centred), the rest at the right.
        A phone has no room for the logo: there it is just the two ends.
      */}
      <div className="flex items-center justify-between gap-x-2 px-2 py-1.5 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:gap-x-4 sm:px-3">
        {/* With folders there can be many tabs: they wrap onto more rows, or on a phone scroll sideways in one. */}
        <nav className="flex min-w-0 items-center gap-1 max-sm:overflow-x-auto sm:flex-wrap" aria-label="Pages">
          {/* A box dragged from a folder's page and dropped on Tasks is no longer shown in that folder (see useDropOnTab). */}
          <NavLink to="/" end className={tab} aria-label="Tasks" data-tab-drop="main">
            <span className="tab-icon tab-icon-tasks" aria-hidden />
            Tasks
          </NavLink>
          <NavLink to="/stats" className={tab} aria-label="Stats">
            <span className="tab-icon tab-icon-stats" aria-hidden />
            Stats
          </NavLink>
          <NavLink to="/calendar" className={tab} aria-label="Calendar">
            <span className="tab-icon tab-icon-calendar" aria-hidden />
            Calendar
          </NavLink>
          {user.notesTab && (
            <NavLink to="/notes" className={tab} aria-label="Notes">
              <span className="tab-icon tab-icon-notes" aria-hidden />
              Notes
            </NavLink>
          )}
          <FolderTabs tab={tab} isNewShown={isNewShown} onNewUsed={onNewUsed} />
        </nav>
        <Link to="/" className="logo h-[42px] max-sm:hidden" aria-label="Donegeon" />
        <div className="flex flex-none items-center justify-end gap-x-2 text-sm sm:gap-x-3">
          {/* The balance, laid out like a tab: a big number where the icon would be, "pts" underneath. */}
          {points && (
            <NavLink to="/points" className={tab} data-nav-balance={points.balance} aria-label="Points" title="Your points: earned minus spent. Click for the history.">
              <span className="flex h-[21px] items-center text-sm leading-none tabular-nums sm:h-[42px] sm:text-3xl">
                {points.balance}
              </span>
              {points.balance === 1 ? "pt" : "pts"}
            </NavLink>
          )}
          {/* The user's own page (and logging out), under their name. */}
          <NavLink to="/user" className={tab} aria-label="Account" title={user.username}>
            <span className="tab-icon tab-icon-user" aria-hidden />
            <span className="max-w-16 truncate sm:max-w-28">{user.username}</span>
          </NavLink>
          {/* The clock with a teeny bell beside the time: a click opens the notifications (passed deadlines, each asking for a new date). */}
          <Bell>{(bell) => <Clock beforeTime={bell} />}</Bell>
        </div>
      </div>
    </header>
  );
}
