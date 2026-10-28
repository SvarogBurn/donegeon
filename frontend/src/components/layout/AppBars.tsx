import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { useNewNote } from "../../hooks/notes";
import { usePoints } from "../../hooks/points";
import type { User } from "../../types";
import { CharacterFace } from "../Character/CharacterFace";
import { Bell } from "../Notifications/Bell";
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

/** The "+" button's size, how far it stands up above the bar's top edge, and the gap around it in the notch. */
const PLUS = 44;
const PLUS_ABOVE = 24;
const GAP = 4;
/** NES.css draws a button's pixel border this far outside its box. */
const NES_OUTSET = 4;
/** The notch follows the button's square: as wide as it plus the gap each side, as deep as the part of it in the bar plus the gap. */
const NOTCH_HALF = PLUS / 2 + NES_OUTSET + GAP;
const NOTCH_DEPTH = PLUS - PLUS_ABOVE + NES_OUTSET + GAP;
/** Width of the notch piece in the middle of the bottom bar, where the "+" sits. */
const NOTCH_W = 2 * NOTCH_HALF + 8;

/**
 * The middle of the bottom bar's top edge, with a notch the shape of the "+" cut out of it: the bar's colour, and its
 * 1px line going down one side, along the floor and up the other. Pieces don't overlap, so the see-through colour stays even.
 */
function Notch() {
  const side = NOTCH_W / 2 - NOTCH_HALF;
  const right = NOTCH_W - side;
  // [x, y, width, height]: the bar either side of the notch and its floor; then the line along all of it.
  const fill = [
    [0, 0, side, NOTCH_DEPTH],
    [right, 0, side, NOTCH_DEPTH],
    [0, NOTCH_DEPTH, NOTCH_W, 1],
  ];
  const edge = [
    [0, 0, side, 1],
    [right, 0, side, 1],
    [side - 1, 0, 1, NOTCH_DEPTH + 1],
    [right, 0, 1, NOTCH_DEPTH + 1],
    [side - 1, NOTCH_DEPTH, right - side + 2, 1],
  ];
  return (
    <div className="flex flex-none flex-col" style={{ width: NOTCH_W }} aria-hidden>
      <svg width={NOTCH_W} height={NOTCH_DEPTH + 1} viewBox={`0 0 ${NOTCH_W} ${NOTCH_DEPTH + 1}`} shapeRendering="crispEdges" className="block flex-none">
        {fill.map(([x, y, w, h], i) => (
          <rect key={`f${i}`} x={x} y={y} width={w} height={h} className="fill-[var(--bar-fill)]" />
        ))}
        {edge.map(([x, y, w, h], i) => (
          <rect key={`e${i}`} x={x} y={y} width={w} height={h} className="fill-[var(--bar-edge)]" />
        ))}
      </svg>
      {/* Under the notch's floor: the bar. */}
      <div className="app-bar-fill flex-1" />
    </div>
  );
}

/**
 * The installed app's bars (in a browser tab it has NavBar's task bar instead). Along the top: Notes at the far left (when the setting shows it), the
 * folders after it, a small spyglass that opens the search across the strip (the Tasks page then doesn't show one), the
 * bell with the notifications, and the points at the far right. Along the bottom: the pages and the account with their names, and in the middle a "+" button standing up out of a notch in the bar,
 * for a task just for today (on the Notes page, a new note in the folder shown). Both slide away while the page is scrolled down and come back on the way up, as in a
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
  const [isBellOpen, setIsBellOpen] = useState(false);
  const newNote = useNewNote();
  const isOnNotes = pathname === "/notes";
  const isHidden = useHideOnScroll(isAdding || isSearching || isBellOpen);
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
        <div className={`flex items-center gap-2 py-1 pr-3 ${user.notesTab ? "" : "pl-1"}`}>
          {isSearching ? (
            <SiteSearch
              inBar
              autoFocus
              onClose={() => setIsSearching(false)}
              onPickLabel={(key, id) => navigate("/", { state: { pickLabel: { key, id } } satisfies PickLabelState })}
            />
          ) : (
            <>
              {/* Notes stays at the far left, just its icon (when the setting shows it); the folders after it scroll sideways in one row. */}
              {user.notesTab && (
                <NavLink to="/notes" className={(state) => `${folderTab(state)} flex-none`} aria-label="Notes" title="Notes">
                  <span className="tab-icon tab-icon-notes-small" aria-hidden />
                </NavLink>
              )}
              <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]" aria-label="Folders">
                <FolderTabs tab={folderTab} isNewShown={isNewShown} onNewUsed={onNewUsed} opensBelow />
              </nav>
              <button type="button" className="bar-glyph bar-glyph-search flex-none" aria-label="Search" title="Search the whole site" onClick={() => setIsSearching(true)} />
            </>
          )}
          {/* Notifications open below it: passed deadlines, each asking for a new date. */}
          <Bell inStrip onOpenChange={setIsBellOpen} />
          {/* The balance at the far right: the number, with "pts" underneath. None while the points system is off. */}
          {!user.pointsOff && points && (
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
          {/* The user's own page (and logging out), under their name. */}
          <NavLink to="/user" className={barTab} aria-label="Account" title={user.username}>
            <CharacterFace user={user} className="tab-icon !size-[21px]" iconClass="tab-icon tab-icon-user bar-user-icon !size-[21px] !bg-size-[15px]" />
            <span className="max-w-16 truncate">{user.username}</span>
          </NavLink>
        </nav>
        {/* Half of it above the bar's top edge, the rest down in the notch with a gap all round. */}
        <button
          type="button"
          className="nes-btn plus-button absolute top-0 left-1/2"
          style={{ width: PLUS, height: PLUS, translate: `-50% -${PLUS_ABOVE}px` }}
          data-quick-add
          aria-label={isOnNotes ? "New note" : "New task for today"}
          aria-expanded={isOnNotes ? undefined : isAdding}
          title={isOnNotes ? "A new note, in the folder shown" : "A new task, just for today"}
          onClick={() => (isOnNotes ? (setIsAdding(false), newNote()) : setIsAdding(!isAdding))}
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
