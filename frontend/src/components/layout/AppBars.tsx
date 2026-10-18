import { useRef } from "react";
import { NavLink, useNavigate } from "react-router";
import { useFolders, usePoints } from "../../hooks/useTasks";
import type { User } from "../../types";
import { SiteSearch } from "../Search/SiteSearch";
import { useNewFolderTab, usePublishedHeight } from "./barHooks";
import { Clock } from "./Clock";
import { FolderTabs } from "./FolderTabs";

/** What the Tasks page is told when a goal or a tag is picked from the strip's search: show only its tasks. */
export interface PickLabelState {
  pickLabel: { key: "goalIds" | "tagIds"; id: string };
}

// The bars are opaque and a cool white (a deep navy on the dark theme), so the phone's own bars can take the same colour (lib/standalone).
const BAR = "fixed inset-x-0 z-40 border-[#d9dcf0] bg-white dark:border-[#34345e] dark:bg-[#1c1c33]";

// A folder in the top strip: its icon with the name beside it, small.
const folderTab = ({ isActive }: { isActive: boolean }) =>
  `folder-chip flex items-center gap-1.5 px-2 py-1 font-pixel text-[8px] ${isActive ? "bg-[#e3e7fb] text-[#3544a1] dark:bg-[#2c2c52] dark:text-[#cbdbfc]" : "text-stone-900 hover:bg-stone-100 dark:text-stone-100 dark:hover:bg-[#26264a]"}`;

// A page in the bottom bar: just its icon, big, and the open one lit with a band of the frames' blue along its top.
const pageTab = ({ isActive }: { isActive: boolean }) =>
  `flex justify-center py-2 ${isActive ? "bg-[#e3e7fb] shadow-[inset_0_3px_0_#5b6ee1] dark:bg-[#2c2c52] dark:shadow-[inset_0_3px_0_#99b4ff]" : "opacity-80 hover:bg-stone-100 hover:opacity-100 dark:hover:bg-[#26264a]"}`;

/**
 * The installed app's bars (in a browser tab it has NavBar's task bar instead). Along the top: the account, the search
 * (which the Tasks page then doesn't show), the points, and the folders under them. Along the bottom: the three pages,
 * icons only. The clock isn't shown, but still runs: it is what reloads everything when the day changes.
 */
export function AppBars({ user }: { user: User }) {
  const navigate = useNavigate();
  const { data: points } = usePoints();
  const { data: folders = [] } = useFolders();
  const top = useRef<HTMLElement>(null);
  const bottom = useRef<HTMLElement>(null);
  usePublishedHeight(top, "--top-h");
  usePublishedHeight(bottom, "--bar-h");
  const { isNewShown, onNewUsed, handlers } = useNewFolderTab(top);

  return (
    <>
      <header ref={top} {...handlers} className={`${BAR} top-0 border-b-2 pt-[env(safe-area-inset-top)]`}>
        <div className="flex items-center gap-2 px-3 py-2">
          {/* The user's own page (and logging out), behind the first letter of their name. */}
          <NavLink to="/user" className="pixel-round-edge flex-none p-0.5 [&.active]:[--edge:#639bff]" aria-label="Account" title={user.username}>
            <span className="pixel-round flex size-10 items-center justify-center bg-[#3f3f74] pt-0.5 font-pixel text-base text-white uppercase">
              {user.username.charAt(0)}
            </span>
          </NavLink>
          <SiteSearch
            inBar
            onPickLabel={(key, id) => navigate("/", { state: { pickLabel: { key, id } } satisfies PickLabelState })}
          />
          {/* The balance: the number, with "pts" underneath. */}
          {points && (
            <NavLink
              to="/points"
              className={({ isActive }) =>
                `flex flex-none flex-col items-center px-1.5 py-1 font-pixel tabular-nums ${isActive ? "text-[#3544a1] dark:text-[#cbdbfc]" : "text-stone-900 dark:text-stone-100"}`
              }
              data-nav-balance={points.balance}
              aria-label="Points"
              title="Your points: earned minus spent. Tap for the history."
            >
              <span className="text-base leading-none">{points.balance}</span>
              <span className="mt-1 text-[8px] text-stone-500 dark:text-stone-400">{points.balance === 1 ? "pt" : "pts"}</span>
            </NavLink>
          )}
        </div>
        {/* Many folders scroll sideways in one row on a phone, and wrap on anything wider. */}
        <nav className={`flex items-center gap-1 px-3 max-sm:overflow-x-auto sm:flex-wrap ${folders.length > 0 || isNewShown ? "pb-2" : ""}`} aria-label="Folders">
          <FolderTabs tab={folderTab} isNewShown={isNewShown} onNewUsed={onNewUsed} opensBelow />
        </nav>
      </header>

      <header ref={bottom} className={`${BAR} bottom-0 border-t-2 pb-[env(safe-area-inset-bottom)]`}>
        <nav className="grid grid-cols-3" aria-label="Pages">
          {/* A box dragged from a folder's page and dropped on Tasks is no longer shown in that folder (see useDropOnTab). */}
          <NavLink to="/" end className={pageTab} aria-label="Tasks" title="Tasks" data-tab-drop="main">
            <span className="tab-icon tab-icon-tasks !size-[42px]" aria-hidden />
          </NavLink>
          <NavLink to="/stats" className={pageTab} aria-label="Stats" title="Stats">
            <span className="tab-icon tab-icon-stats !size-[42px]" aria-hidden />
          </NavLink>
          <NavLink to="/calendar" className={pageTab} aria-label="Calendar" title="Calendar">
            <span className="tab-icon tab-icon-calendar !size-[42px]" aria-hidden />
          </NavLink>
        </nav>
        <div hidden>
          <Clock />
        </div>
      </header>
    </>
  );
}
