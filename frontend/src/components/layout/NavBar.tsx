import { useLayoutEffect, useRef } from "react";
import { Link, NavLink } from "react-router";
import { usePoints } from "../../hooks/useTasks";
import type { User } from "../../types";
import { Clock } from "./Clock";
import { FolderTabs } from "./FolderTabs";

// The label under each icon: near-black, and the frame's blue on the page that is open.
const tab = ({ isActive }: { isActive: boolean }) =>
  `flex flex-col items-center gap-0.5 px-1.5 pt-1 pb-0.5 font-pixel text-[8px] sm:px-2 ${isActive ? "bg-stone-200/80 text-[#3544a1] dark:bg-stone-800/80 dark:text-[#cbdbfc]" : "text-stone-900 hover:bg-stone-200/50 dark:text-stone-100 dark:hover:bg-stone-800/50"}`;

export function NavBar({ user }: { user: User }) {
  const { data: points } = usePoints();

  // The bar's height changes (it wraps on narrow screens), so it is published as --bar-h for
  // whatever must stay clear of it: the page's bottom padding and the undo bar.
  const bar = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty("--bar-h", `${el.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--bar-h");
    };
  }, []);

  return (
    // A task bar: fixed along the bottom of the screen, 70% opaque, while the page scrolls above it (AppShell leaves room for it).
    <header ref={bar} className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-stone-300 bg-white/70 pb-[env(safe-area-inset-bottom)] dark:border-stone-700 dark:bg-stone-900/70">
      {/*
        Tabs at the far left, the logo in the middle (equal side columns keep it centred), the rest at the right.
        A phone has no room for the logo: there it is just the two ends.
      */}
      <div className="flex items-center justify-between gap-x-2 px-2 py-1.5 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:gap-x-4 sm:px-3">
        {/* With folders there can be many tabs: they wrap onto more rows, or on a phone scroll sideways in one. */}
        <nav className="flex min-w-0 items-center gap-1 max-sm:overflow-x-auto sm:flex-wrap" aria-label="Pages">
          {/* A list dropped on Tasks leaves its folder (see FolderTabs). */}
          <NavLink to="/" end className={tab} aria-label="Tasks" data-tab-drop="main">
            <span className="tab-icon tab-icon-tasks" aria-hidden />
            Tasks
          </NavLink>
          <NavLink to="/done" className={tab} aria-label="Done">
            <span className="tab-icon tab-icon-done" aria-hidden />
            Done
          </NavLink>
          <FolderTabs tab={tab} />
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
          <Clock />
        </div>
      </div>
    </header>
  );
}
