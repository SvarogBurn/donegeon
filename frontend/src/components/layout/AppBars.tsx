import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { usePoints } from "../../hooks/useTasks";
import type { User } from "../../types";
import { QuickAdd } from "../QuickAdd";
import { SiteSearch } from "../Search/SiteSearch";
import { barTab, useHideOnScroll, useNewFolderTab, usePublishedHeight } from "./barHooks";
import { Clock } from "./Clock";
import { FolderTabs } from "./FolderTabs";

/** What the Tasks page is told when a goal or a tag is picked from the strip's search: show only its tasks. */
export interface PickLabelState {
  pickLabel: { key: "goalIds" | "tagIds"; id: string };
}

// The bars look like the task bar in a browser: white (stone-900 on the dark theme), a little see-through, with a thin
// line towards the page. Colours in index.css (--bar-fill, --bar-edge), shared with the notch drawn under the "+".
const BAR = "fixed inset-x-0 z-40 transition-transform duration-200 motion-reduce:transition-none";

// A folder in the top strip: its icon with the name beside it, small, in the task bar's colours.
const folderTab = ({ isActive }: { isActive: boolean }) =>
  `folder-chip flex items-center gap-1.5 px-2 py-1 font-pixel text-[8px] ${isActive ? "bg-stone-200/80 text-[#3544a1] dark:bg-stone-800/80 dark:text-[#cbdbfc]" : "text-stone-900 hover:bg-stone-200/50 dark:text-stone-100 dark:hover:bg-stone-800/50"}`;

/** Width of the notch piece in the middle of the bottom bar, where the "+" sits. */
const NOTCH_W = 76;
/**
 * Half the width of the notch in each 3px row from the bar's top edge down: a cradle with stepped sides for the "+",
 * wide at the top and narrowing to its floor, which is the row after the last.
 */
const NOTCH_ROWS = [36, 33, 30, 27, 27, 24];
const STEP = 3;

/**
 * The middle of the bottom bar's top edge, with the notch the "+" sits in cut out of it, drawn in blocks of 3px: the
 * bar's colour, and its 1px line following the steps. Blocks don't overlap, so the see-through colour stays even.
 */
function Notch() {
  const mid = NOTCH_W / 2;
  const depth = NOTCH_ROWS.length * STEP;
  const fill: [number, number, number, number][] = [];
  const edge: [number, number, number, number][] = [];
  NOTCH_ROWS.forEach((half, i) => {
    const y = i * STEP;
    // The bar on either side of the notch in this row, with the line down its inner side.
    fill.push([0, y, mid - half, STEP], [mid + half, y, mid - half, STEP]);
    edge.push([mid - half - 1, y, 1, STEP], [mid + half, y, 1, STEP]);
    // Where the row below is narrower, the line runs along the top of the bar that steps in there (the floor, at the last).
    const below = NOTCH_ROWS[i + 1] ?? 0;
    edge.push([mid - half - 1, y + STEP, half - below + 1, 1], [mid + below, y + STEP, half - below + 1, 1]);
  });
  // The floor's first row of pixels, under its line.
  fill.push([0, depth, NOTCH_W, 1]);
  // The top edge to either side of the notch.
  edge.push([0, 0, mid - NOTCH_ROWS[0], 1], [mid + NOTCH_ROWS[0], 0, mid - NOTCH_ROWS[0], 1]);
  return (
    <div className="flex flex-none flex-col" style={{ width: NOTCH_W }} aria-hidden>
      <svg width={NOTCH_W} height={depth + 1} viewBox={`0 0 ${NOTCH_W} ${depth + 1}`} shapeRendering="crispEdges" className="block flex-none">
        {fill.map(([x, y, w, h], i) => (
          <rect key={`f${i}`} x={x} y={y} width={w} height={h} className="fill-[var(--bar-fill)]" />
        ))}
        {edge.map(([x, y, w, h], i) => (
          <rect key={`e${i}`} x={x} y={y} width={w} height={h} className="fill-[var(--bar-edge)]" />
        ))}
      </svg>
      {/* The notch's floor and the bar under it. */}
      <div className="app-bar-fill flex-1" />
    </div>
  );
}

/**
 * The installed app's bars (in a browser tab it has NavBar's task bar instead). Along the top: the points, the folders,
 * a small spyglass that opens the search across the strip (the Tasks page then doesn't show one), and the account.
 * Along the bottom: the pages with their names, and in the middle a "+" button standing up out of a notch in the bar,
 * for a task just for today. Both slide away while the page is scrolled down and come back on the way up, as in a
 * phone app. The clock isn't shown, but still runs: it is what reloads everything when the day changes.
 */
export function AppBars({ user }: { user: User }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data: points } = usePoints();
  const top = useRef<HTMLElement>(null);
  const bottom = useRef<HTMLElement>(null);
  usePublishedHeight(top, "--top-h");
  usePublishedHeight(bottom, "--bar-h");
  const { isNewShown, onNewUsed, handlers } = useNewFolderTab(top);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const isHidden = useHideOnScroll(isAdding || isSearching);
  // Another page: the search has done its job.
  useEffect(() => setIsSearching(false), [pathname]);

  return (
    <>
      <header
        ref={top}
        {...handlers}
        className={`${BAR} app-bar-fill top-0 border-b pt-[env(safe-area-inset-top)] ${isHidden ? "-translate-y-full" : ""}`}
        data-bar-hidden={isHidden || undefined}
      >
        <div className="flex items-center gap-2 px-3 py-1">
          {/* The balance: the number, with "pts" underneath. */}
          {points && (
            <NavLink
              to="/points"
              className={({ isActive }) =>
                `flex flex-none flex-col items-center px-1 py-0.5 font-pixel tabular-nums ${isActive ? "bg-stone-200/80 text-[#3544a1] dark:bg-stone-800/80 dark:text-[#cbdbfc]" : "text-stone-900 dark:text-stone-100"}`
              }
              data-nav-balance={points.balance}
              aria-label="Points"
              title="Your points: earned minus spent. Tap for the history."
            >
              <span className="text-xs leading-none">{points.balance}</span>
              <span className="mt-0.5 text-[8px]">{points.balance === 1 ? "pt" : "pts"}</span>
            </NavLink>
          )}
          {isSearching ? (
            <SiteSearch
              inBar
              autoFocus
              onClose={() => setIsSearching(false)}
              onPickLabel={(key, id) => navigate("/", { state: { pickLabel: { key, id } } satisfies PickLabelState })}
            />
          ) : (
            // Many folders scroll sideways in one row.
            <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]" aria-label="Folders">
              <FolderTabs tab={folderTab} isNewShown={isNewShown} onNewUsed={onNewUsed} opensBelow />
            </nav>
          )}
          {!isSearching && (
            <button type="button" className="bar-glyph bar-glyph-search flex-none" aria-label="Search" title="Search the whole site" onClick={() => setIsSearching(true)} />
          )}
          {/* The user's own page (and logging out). */}
          <NavLink to="/user" className="bar-glyph-link flex-none p-1" aria-label="Account" title={user.username}>
            <span className="bar-glyph bar-glyph-user block" aria-hidden />
          </NavLink>
        </div>
      </header>

      {/* Slid out by more than its height, so the "+" standing up out of it goes too. */}
      <header ref={bottom} className={`${BAR} bottom-0 ${isHidden ? "translate-y-[calc(100%+2rem)]" : ""}`} data-bar-hidden={isHidden || undefined}>
        {/* The bar itself: flat to either side, the notch in the middle; under the phone's own buttons too (safe area). */}
        <div className="absolute inset-0 flex" aria-hidden>
          <div className="app-bar-fill flex-1 border-t" />
          <Notch />
          <div className="app-bar-fill flex-1 border-t" />
        </div>
        <nav className="relative grid pb-[env(safe-area-inset-bottom)]" style={{ gridTemplateColumns: `1fr 1fr ${NOTCH_W}px 1fr 1fr` }} aria-label="Pages">
          {/* A box dragged from a folder's page and dropped on Tasks is no longer shown in that folder (see useDropOnTab). */}
          <NavLink to="/" end className={barTab} aria-label="Tasks" data-tab-drop="main">
            <span className="tab-icon tab-icon-tasks !size-[21px]" aria-hidden />
            Tasks
          </NavLink>
          <NavLink to="/stats" className={barTab} aria-label="Stats">
            <span className="tab-icon tab-icon-stats !size-[21px]" aria-hidden />
            Stats
          </NavLink>
          <span />
          <NavLink to="/calendar" className={barTab} aria-label="Calendar">
            <span className="tab-icon tab-icon-calendar !size-[21px]" aria-hidden />
            Calendar
          </NavLink>
          <NavLink to="/notes" className={barTab} aria-label="Notes">
            <span className="tab-icon tab-icon-notes !size-[21px] !bg-size-[20px]" aria-hidden />
            Notes
          </NavLink>
        </nav>
        {/* Most of it above the bar's top edge, the rest down in the notch with a gap all round. */}
        <button
          type="button"
          className="nes-btn plus-button absolute top-0 left-1/2 -translate-x-1/2 -translate-y-[26px]"
          data-quick-add
          aria-label="New task for today"
          aria-expanded={isAdding}
          title="A new task, just for today"
          onClick={() => setIsAdding(!isAdding)}
        >
          +
        </button>
        <div hidden>
          <Clock />
        </div>
      </header>
      {isAdding && <QuickAdd onClose={() => setIsAdding(false)} />}
    </>
  );
}
