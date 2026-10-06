import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router";
import { useUpdateMe } from "../../hooks/useAuth";
import { useFolders, useLayout, useLists, useTaskTrees } from "../../hooks/useTasks";
import type { User } from "../../types";
import { MAKE_TASK, STEPS, type TutorialContext } from "./steps";

/** Where the tutorial has got to, kept for the tab so a reload doesn't start it over. */
interface Progress {
  userId: string;
  step: number;
  /** The step whose notes are taken and whose page is open; its `done` is only looked at once this is the step. */
  entered: number;
  taskId: string | null;
  /** The step that asks for a task was skipped: the steps about that task are passed over. */
  noTask?: boolean;
  base: Record<string, number>;
  known: string[];
}

/** A number that changes when the text does: for telling that an arrangement is no longer the one noted. */
const hash = (text: string) => [...text].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) | 0, 0);

const STORE = "donegeon.tutorial";
/** Lets a browser driven by automation (the e2e scripts), which is spared the tutorial, have it after all. */
const FORCE = "donegeon.forceTutorial";

function stored<T>(read: () => T, otherwise: T): T {
  try {
    return read();
  } catch {
    return otherwise;
  }
}

function load(userId: string): Progress {
  const saved = stored(() => JSON.parse(sessionStorage.getItem(STORE) ?? "null") as Progress | null, null);
  if (saved?.userId === userId && saved.step < STEPS.length) return { ...saved, entered: -1 };
  return { userId, step: 0, entered: -1, taskId: null, base: {}, known: [] };
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Where the words go, and the arrow from them to what they are about. */
interface Place {
  top: number;
  left: number;
  arrow: { x: number; y: number; points: string };
}

// Room between the highlighted thing and the words, for the arrow.
const GAP = 62;
const BUBBLE = 352;

/** A hole in the dim over `rect`, with a little room around it: a piece of the clip-path. */
const hole = (rect: Rect) => `M${rect.left - 6} ${rect.top - 6}h${rect.width + 12}v${rect.height + 12}h${-rect.width - 12}Z`;
interface Found {
  rect: Rect | null;
  /** The menu the target is a part of, if it is: the words keep clear of all of it. */
  frame: Rect | null;
  more: Rect[];
}


/**
 * Follows the things a step is about, wherever scrolling and layout take them: first the first of `selectors`
 * that is on the page (absent if none is), then each of `also` that is.
 */
function useTargetRects(selectors: string[], also: string[], step: number): Found {
  const [found, setFound] = useState<Found>({ rect: null, frame: null, more: [] });
  const wanted = useRef({ selectors, also, step });
  wanted.current = { selectors, also, step };
  // What was already scrolled to: once is enough, after that the page is the user's.
  const scrolled = useRef("");

  useEffect(() => {
    let frame = 0;
    const box = (el: Element): Rect | null => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) } : null;
    };
    const look = () => {
      frame = requestAnimationFrame(look);
      const { selectors, also, step } = wanted.current;
      let el: Element | null = null;
      let matched = "";
      for (const selector of selectors) if ((el = document.querySelector((matched = selector)))) break;
      if (el && scrolled.current !== `${step} ${matched}`) {
        scrolled.current = `${step} ${matched}`;
        // Something in a menu or in the task bar is brought into sight without moving the page more than it takes.
        el.scrollIntoView({ block: el.closest("header, [role=dialog]") ? "nearest" : "center", inline: "nearest", behavior: "smooth" });
      }
      const rect = el ? box(el) : null;
      const dialog = el?.parentElement?.closest("[role=dialog]");
      const menu = dialog ? box(dialog) : null;
      const more = also.flatMap((selector) => [...document.querySelectorAll(selector)]).flatMap((other) => box(other) ?? []);
      const next = { rect, frame: menu, more };
      setFound((was) => (JSON.stringify(was) === JSON.stringify(next) ? was : next));
    };
    look();
    return () => cancelAnimationFrame(frame);
  }, []);
  return found;
}

/**
 * The tutorial: shown to an account until it is finished or skipped (User.tutorialSeen), and again when asked
 * for in the settings. It opens on a dark screen with a few words, then lets the app show and walks through it:
 * everything but the thing being talked about is dimmed, an arrow points at that thing, and most steps wait
 * for the user to do what they are told (see steps.tsx). Nothing is blocked: the whole app stays usable.
 */
export function Tutorial({ user }: { user: User }) {
  const isSpared = navigator.webdriver && !stored(() => localStorage.getItem(FORCE), null);
  if (user.tutorialSeen || isSpared) return null;
  return <Running key={user.id} user={user} />;
}

function Running({ user }: { user: User }) {
  const tasks = useTaskTrees();
  const lists = useLists();
  const folders = useFolders();
  const layout = useLayout();
  const update = useUpdateMe();
  const navigate = useNavigate();
  const path = useLocation().pathname;
  const [progress, setProgress] = useState(() => load(user.id));
  // Some steps wait for something only the page knows (a menu being open): looked at a few times a second.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    stored(() => sessionStorage.setItem(STORE, JSON.stringify(progress)), undefined);
  }, [progress]);

  const step = STEPS[progress.step];
  const isReady = Boolean(tasks.data && lists.data && folders.data && !layout.isLoading);
  const ctx: TutorialContext = {
    tasks: tasks.data ?? [],
    lists: lists.data ?? [],
    folders: folders.data ?? [],
    hidden: layout.data?.hidden?.length ?? 0,
    arranged: hash(JSON.stringify([layout.data?.pinned ?? [], layout.data?.byColumns ?? {}])),
    columns: (layout.data?.byColumns.wide ?? []).filter((column) => column.length > 0).length,
    path,
    task: tasks.data?.find((task) => task.id === progress.taskId),
    base: progress.base,
    known: progress.known,
    isTouch: stored(() => matchMedia("(pointer: coarse)").matches, false),
  };
  const isEntered = progress.entered === progress.step;
  const isShown = !step.dark && isEntered;
  const { rect, frame, more } = useTargetRects(isShown ? (step.target?.(ctx) ?? []) : [], isShown ? (step.also?.(ctx) ?? []) : [], progress.step);
  // The dark opening covers the page's scrollbar too: the page doesn't scroll under it.
  useEffect(() => {
    if (!step.dark) return;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [step.dark]);
  // What a step needs brought out while it is on (the "New folder" tab): said on <html>, for index.css.
  const flag = isShown ? step.flag : undefined;
  useEffect(() => {
    if (!flag) return;
    document.documentElement.dataset[flag] = "";
    return () => {
      delete document.documentElement.dataset[flag];
    };
  }, [flag]);

  const goTo = (index: number, more: Partial<Progress> = {}) => setProgress((was) => ({ ...was, ...more, step: index }));
  function end() {
    stored(() => sessionStorage.removeItem(STORE), undefined);
    update.mutate({ tutorialSeen: true });
  }
  const next = () => (progress.step + 1 < STEPS.length ? goTo(progress.step + 1) : end());

  // A step begins: its page is opened and its numbers noted. Then, on every look, whether it is done.
  useEffect(() => {
    if (!isReady) return;
    if (!isEntered) {
      // Nothing to do on this screen (a second column on a phone): on to the next.
      if ((step.needsTask && !ctx.task && progress.noTask) || step.skip?.(ctx)) return next();
      const route = typeof step.route === "function" ? step.route(ctx) : step.route;
      if (route && path !== route) navigate(route);
      setProgress((was) => ({
        ...was,
        entered: was.step,
        base: { ...was.base, ...step.note?.(ctx) },
        known: was.step === MAKE_TASK ? ctx.tasks.map((task) => task.id) : was.known,
      }));
      return;
    }
    if (step.needsTask && !ctx.task) return goTo(MAKE_TASK, { taskId: null });
    if (progress.step === MAKE_TASK) {
      const made = ctx.tasks.find((task) => !progress.known.includes(task.id));
      if (made) goTo(MAKE_TASK + 1, { taskId: made.id, noTask: false });
    } else if (step.done?.(ctx)) next();
  });

  // How tall the words are, to find them a place: known once they are on the page.
  const bubbleEl = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const measured = bubbleEl.current?.offsetHeight ?? 0;
    if (measured !== height) setHeight(measured);
  });

  // Without the task there is nothing for the steps after it to be about; the others are simply left undone.
  const skipStep = () => (progress.step === MAKE_TASK ? goTo(MAKE_TASK + 1, { taskId: null, noTask: true }) : next());
  const waits = Boolean(step.done) || progress.step === MAKE_TASK;
  const words = (
    <>
      <p className="text-sm">{step.text(ctx)}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="btn-quiet" onClick={end}>
          Skip tutorial
        </button>
        {waits ? (
          <button type="button" className="btn-quiet" title="Go on without doing it" data-tutorial-skip onClick={skipStep}>
            Skip this step
          </button>
        ) : (
          <button type="button" className="nes-btn is-primary btn-small" data-tutorial-next onClick={next}>
            {step.button ?? "Next"}
          </button>
        )}
      </div>
    </>
  );

  if (step.dark) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black p-4" role="dialog" aria-modal="true" aria-label="Tutorial" data-tutorial={progress.step}>
        <div className="card w-full max-w-md space-y-4">{words}</div>
      </div>
    );
  }
  // The app's data is still on its way: the first step that shows the app waits for it.
  if (!isReady || !isEntered) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(BUBBLE, vw - 16);
  const within = (value: number, size: number, room: number) => Math.max(8, Math.min(value, room - size - 8));
  // The words go under the thing they are about, over it, or beside it: the first of those with room for them.
  // With room nowhere (it fills the screen) or nothing to point at, they sit at the bottom, clear of the task bar.
  let place: Place | null = null;
  if (rect && height > 0) {
    // A part of a menu: the words go beside the whole menu, and the arrow comes in level with the part.
    const around = frame ?? rect;
    const bottom = around.top + around.height;
    const right = around.left + around.width;
    const x = rect.left + rect.width / 2;
    const y = within(rect.top + rect.height / 2 - 10, 20, vh) + 10;
    const left = within(x - width / 2, width, vw);
    const top = within(y - height / 2, height, vh);
    const ax = within(x - 25, 50, vw) + 25;
    const sides: Record<string, false | Place> = {
      below: vh - bottom >= GAP + height + 8 && { top: bottom + GAP, left, arrow: { x: ax, y: bottom + GAP / 2, points: "up" } },
      above: around.top >= GAP + height + 8 && { top: around.top - GAP - height, left, arrow: { x: ax, y: around.top - GAP / 2, points: "down" } },
      right: vw - right >= GAP + width + 8 && { top, left: right + GAP, arrow: { x: right + GAP / 2, y, points: "left" } },
      left: around.left >= GAP + width + 8 && { top, left: around.left - GAP - width, arrow: { x: around.left - GAP / 2, y, points: "right" } },
    };
    const order = frame ? ["left", "right", "below", "above"] : [step.side ?? "below", "below", "above", "right", "left"];
    place = order.map((side) => sides[side]).find((side) => side !== false) ?? null;
  }
  const bubble: CSSProperties = place
    ? { width, top: place.top, left: place.left }
    : { width, left: (vw - width) / 2, bottom: "calc(var(--bar-h, 5rem) + 1rem)" };

  return (
    <>
      {rect && (
        <>
          {/* Everything is dimmed but the things the step is about: a hole is cut in the dim over each. */}
          <div className="tutorial-dim" style={{ clipPath: `path(evenodd, "M0 0H${vw}V${vh}H0Z${[rect, ...more].map(hole).join("")}")` }} aria-hidden />
          <div className="tutorial-spot" data-tutorial-spot style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} aria-hidden />
        </>
      )}
      {place && (
        <div className="tutorial-arrow" data-points={place.arrow.points} style={{ left: place.arrow.x - 25, top: place.arrow.y - 10 }} aria-hidden />
      )}
      <div
        ref={bubbleEl}
        className="card fixed z-[60] space-y-3 !p-3 shadow-lg"
        style={bubble}
        role="dialog"
        aria-label="Tutorial"
        aria-live="polite"
        data-tutorial={progress.step}
        // Not a click "elsewhere" for the menus and the task bar, which close on one.
        onPointerDown={(e) => e.stopPropagation()}
      >
        {words}
      </div>
    </>
  );
}
