import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { useFolders, useGoals, useLists, useTags, useTaskSearch, useTaskTrees } from "../../hooks/useTasks";
import { formatDay } from "../../lib/dates";
import { listView } from "../../lib/folders";
import { findNode } from "../../lib/optimisticToggle";
import type { SearchResult } from "../../types";
import { STAT_BOXES } from "../Stats/StatsPanel";

/** How long after the last key the tasks are asked for. */
const TYPING_PAUSE_MS = 200;
/** How long the thing a result led to stays marked. */
const FOUND_MS = 2000;

/** The pages, and the boxes on them that are always the same: [title, page, the box's tile if it is one, more words to find it by]. */
const PLACES: [title: string, path: string, tile: string | null, words?: string][] = [
  ["Tasks", "/", null, "home lists dashboard"],
  ["Stats", "/stats", null, "statistics charts"],
  ["Done", "/done", null, "finished history log"],
  ["Points", "/points", null, "balance history rewards"],
  ["Account", "/user", null, "user settings log out password feedback tutorial"],
  ["Today", "/", "today"],
  ["Goals", "/", "goals"],
  ["Tags", "/", "tags"],
  ["Deadline pressure", "/", "pressure"],
  ["All deadlines", "/", "deadlines", "countdown"],
  ...Object.entries(STAT_BOXES).map(([key, label]): [string, string, string] => [label, "/stats", key]),
];

/**
 * Scrolls to the first of `selectors` there is on the page and marks it for a moment. The page may still be
 * on its way, so it is looked for over the next frames. What is hidden or folded away is not there to be found.
 */
function showOnPage(selectors: string[]) {
  let frames = 0;
  const look = () => {
    const el = selectors.map((selector) => document.querySelector<HTMLElement>(selector)).find(Boolean);
    if (!el) {
      if (++frames < 120) requestAnimationFrame(look);
      return;
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // A whole box is shown from its top; a single row in the middle of the screen.
    el.scrollIntoView({ block: el.offsetHeight > window.innerHeight / 2 ? "start" : "center", behavior: still ? "auto" : "smooth" });
    el.dataset.found = "";
    window.setTimeout(() => delete el.dataset.found, FOUND_MS);
  };
  requestAnimationFrame(look);
}

/** One line of what was found. `go` is absent for what there is nowhere to go to. */
interface Hit {
  key: string;
  title: string;
  /** Small, under the title: where it is. */
  where?: string;
  /** Small, at the right: what it is, or how a task stands. */
  kind: string;
  mark?: ReactNode;
  go?: () => void;
  hint?: string;
}

interface Props {
  /** Picking a goal or a tag from the results filters the page's lists by it. */
  onPickLabel: (key: "goalIds" | "tagIds", id: string) => void;
}

/**
 * The search at the top of the Tasks page: a pill-shaped field that looks through the whole site. Pages, boxes,
 * folders, lists, goals and tags are found by name among what is already loaded; tasks are asked of the server,
 * which looks through the titles of every one there is, the ones finished long ago too.
 */
export function SiteSearch({ onPickLabel }: Props) {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const typed = text.trim();
  const [q, setQ] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setQ(typed), TYPING_PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [typed]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  const search = useTaskSearch(q);
  const { data: lists = [] } = useLists();
  const { data: folders = [] } = useFolders();
  const { data: goals = [] } = useGoals();
  const { data: tags = [] } = useTags();
  // What the Tasks page shows: a task that is in here can be gone to.
  const { data: trees = [] } = useTaskTrees();

  const goTo = (path: string, selectors: string[] = []) => () => {
    navigate(path);
    if (selectors.length > 0) showOnPage(selectors);
  };
  const tile = (key: string) => `[data-tile="${key}"]`;
  const has = (...words: (string | undefined)[]) => words.some((word) => word?.toLowerCase().includes(typed.toLowerCase()));

  // Everything but the tasks is found as it is typed.
  const places: Hit[] = !typed
    ? []
    : [
        ...PLACES.filter(([title, , , words]) => has(title, words)).map(([title, path, key]) => ({
          key: `place:${path}:${key ?? ""}`,
          title,
          kind: key === null ? "Page" : `Box on ${path === "/" ? "Tasks" : "Stats"}`,
          go: goTo(path, key === null ? [] : [tile(key)]),
        })),
        ...folders.filter((folder) => has(folder.name)).map((folder) => ({ key: `folder:${folder.id}`, title: folder.name, kind: "Folder", go: goTo(`/folders/${folder.id}`) })),
        ...lists.filter((list) => has(list.name)).map((list) => ({ key: listView(list.id), title: list.name, kind: list.kind === "reward" ? "Reward list" : "List", go: goTo("/", [tile(listView(list.id))]) })),
        ...goals.filter((goal) => has(goal.name)).map((goal) => ({ key: `goal:${goal.id}`, title: goal.name, kind: "Goal", hint: "Show only the tasks with this goal", go: () => onPickLabel("goalIds", goal.id) })),
        ...tags.filter((tag) => has(tag.name)).map((tag) => ({ key: `tag:${tag.id}`, title: tag.name, kind: "Tag", hint: "Show only the tasks with this tag", go: () => onPickLabel("tagIds", tag.id) })),
      ];

  // The tasks come a moment later; until then the ones found for what was typed before stay.
  const taskHit = (result: SearchResult): Hit => ({
    key: result.id,
    title: result.title,
    where: [lists.find((list) => list.id === result.listId)?.name ?? (result.listId ? null : "Today"), ...result.path.map((title) => title.split("\n")[0])].filter(Boolean).join(" › "),
    kind: result.isComplete && result.completedOn ? `Done ${formatDay(result.completedOn)}/${result.completedOn.slice(0, 4)}` : result.isPersistent ? "Repeats" : "Open",
    mark: (
      <span className={`flex-none ${result.isComplete ? "" : "text-stone-500"}`} aria-hidden>
        {result.isComplete ? "✓" : "○"}
      </span>
    ),
    hint: "Show it on the Tasks page",
    // Finished too long ago to be on the Tasks page: there is nowhere to go, the result says it all.
    go: findNode(trees, result.id) ? goTo("/", [`[data-task-row="${result.id}"]`, `[data-task-row="${result.rootId}"]`]) : undefined,
  });
  const tasks = typed && q ? (search.data?.results ?? []).map(taskHit) : [];
  const isSearching = typed !== "" && (q !== typed || search.isFetching);
  const hits = [...places, ...tasks];

  function choose(hit: Hit) {
    if (!hit.go) return;
    setIsOpen(false);
    setText("");
    hit.go();
  }

  return (
    <div ref={ref} className="relative mx-auto max-w-md" data-site-search>
      <div className="pixel-round-edge p-0.5">
        <label className="pixel-round search-pill">
          <input
            type="text"
            role="searchbox"
            enterKeyHint="search"
            autoComplete="off"
            maxLength={300}
            placeholder="Search"
            aria-label="Search the whole site"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setIsOpen(false);
              // Enter goes to the first result there is somewhere to go for.
              if (e.key !== "Enter") return;
              const first = hits.find((hit) => hit.go);
              if (first) choose(first);
            }}
          />
        </label>
      </div>
      {isOpen && typed !== "" && (
        <div className="card absolute inset-x-0 top-full z-30 mt-1 max-h-[min(60vh,28rem)] overflow-y-auto !p-2 shadow-lg" role="dialog" aria-label="Search results" aria-live="polite" data-search-results>
          {hits.length > 0 && (
            <ul className="space-y-0.5">
              {hits.map((hit) => {
                const line = (
                  <>
                    <span className="flex items-start gap-1.5">
                      {hit.mark}
                      <span className="min-w-0 flex-1 break-words whitespace-pre-line">{hit.title}</span>
                      {!hit.where && <span className="flex-none text-xs text-stone-500">{hit.kind}</span>}
                    </span>
                    {hit.where && (
                      <span className="mt-0.5 flex justify-between gap-2 pl-4 text-xs text-stone-500">
                        <span className="min-w-0 truncate">{hit.where}</span>
                        <span className="flex-none">{hit.kind}</span>
                      </span>
                    )}
                  </>
                );
                return (
                  <li key={hit.key} data-search-result={hit.key}>
                    {hit.go ? (
                      <button
                        type="button"
                        className="block w-full cursor-pointer px-1 py-1 text-left text-sm hover:bg-stone-100 focus-visible:bg-stone-100 dark:hover:bg-stone-800 dark:focus-visible:bg-stone-800"
                        title={hit.hint}
                        onClick={() => choose(hit)}
                      >
                        {line}
                      </button>
                    ) : (
                      <div className="px-1 py-1 text-sm">{line}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {search.error ? (
            <p className="p-1 text-xs text-red-600">Couldn't search your tasks: {search.error.message}</p>
          ) : isSearching ? (
            <p className="p-1 text-xs text-stone-500">Searching your tasks…</p>
          ) : hits.length === 0 ? (
            <p className="p-1 text-xs text-stone-500">Nothing found for “{typed}”.</p>
          ) : (
            search.data?.more && <p className="p-1 text-xs text-stone-500">There are more tasks: type more to narrow it down.</p>
          )}
        </div>
      )}
    </div>
  );
}
