import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { firstOnScreen, nearestTo, nextInDirection, type Box, type Direction, type Stop } from "../lib/keyCursor";
import { note } from "../lib/refusal";
import { tipOf } from "./TapTips";

/** What the arrows stop on: everything that can be clicked or typed in. */
const STOPS =
  'a[href], button:not(:disabled), input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), [contenteditable="true"], [role="button"], [role="tab"], [role="menuitem"], [role="option"], summary, [data-key-target]';
/**
 * A task's row (TaskNode, PickedRow): one stop on the page, so ↑ ↓ go a task at a time, with its parts (the tick, the
 * title, the ⋯) reached with ← →. Its value is the task's page, for Enter ("" when it has none).
 */
const ROW = "[data-key-row]";
/** The fields that take typing: the keys are theirs while one has focus. */
const TYPED = 'input:not([type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="reset"], [type="range"], [type="color"]), textarea, select';
const BARS = "[data-task-bar], [data-top-strip]";
const ARROWS: Record<string, Direction> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
/** How long the cursor rests on something before its tooltip shows, as a mouse's hover does. */
const TIP_DELAY_MS = 700;

const isTyping = (el: HTMLElement) => el.isContentEditable || el.matches(TYPED);

const isShown = (el: HTMLElement) => {
  const box = el.getBoundingClientRect();
  return box.width > 0 && box.height > 0 && el.checkVisibility({ visibilityProperty: true }) && !el.closest('[inert], [aria-hidden="true"]');
};

/** The row `el` is a part of (not the row itself). */
const rowOf = (el: HTMLElement) => el.parentElement?.closest<HTMLElement>(ROW) ?? null;

/** A row's title field, when it has one to type in (Week's rows show theirs as text). */
const titleOf = (row: HTMLElement) => [...row.querySelectorAll<HTMLElement>("textarea")].find(isShown) ?? null;

/** Where the arrows go: inside the popup or dialog opened last, else the whole page (the tutorial's bubble doesn't hold them). */
function scope(): ParentNode {
  const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].filter((d) => (d.dataset.tutorial === undefined || d.hasAttribute("aria-modal")) && isShown(d));
  return dialogs.at(-1) ?? document;
}

/**
 * The stops in `root` on screen or off it: on the page a row stands for everything in it; given `row`, its parts
 * instead. A stop holding others (a row that opens its page) gives way to them.
 */
function stopsIn(root: ParentNode, row?: HTMLElement): Stop<HTMLElement>[] {
  const shown = [...root.querySelectorAll<HTMLElement>(row ? STOPS : `${STOPS}, ${ROW}`)].filter(isShown);
  const found = row ? shown : shown.filter((el) => !rowOf(el));
  const all = new Set(found);
  const holders = new Set<HTMLElement>();
  for (const el of found) for (let up = el.parentElement; up; up = up.parentElement) if (all.has(up)) holders.add(up);
  return found.filter((el) => !holders.has(el)).map((el) => ({ item: el, box: el.getBoundingClientRect(), inBar: Boolean(el.closest(BARS)) }));
}

/**
 * On a computer, the keyboard's cursor: Space puts the mouse's hover look on what is under the mouse (else the first
 * thing on screen), the arrows move it to the nearest thing that way (lib/keyCursor), Enter presses it. A task is one
 * stop: → goes to its title, Space there edits it, Enter opens the task's page (or edits a task with none). In a field
 * every key is the field's, and Esc comes back out. Resting on something shows its tooltip. Space (elsewhere), Esc,
 * or the mouse put it away. It is `data-key-hover` on the element, which the hover styles answer to too (index.css,
 * nes.scss).
 */
export function KeyCursor() {
  // Kept in a ref: a new one comes with every page, and the cursor must outlive the page change.
  const navigateNow = useNavigate();
  const navigate = useRef(navigateNow);
  useEffect(() => {
    navigate.current = navigateNow;
  });
  useEffect(() => {
    let current: HTMLElement | null = null;
    let lastBox: Box | null = null;
    let pointer: { x: number; y: number } | null = null;
    let tip = 0;
    // The keyup of a Space or Enter used here, so a focused button isn't pressed by it as well.
    let swallowUp: string | null = null;

    function place(el: HTMLElement) {
      current?.removeAttribute("data-key-hover");
      current = el;
      el.setAttribute("data-key-hover", "");
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      lastBox = el.getBoundingClientRect();
      window.clearTimeout(tip);
      tip = window.setTimeout(() => {
        const text = el === current && tipOf(el);
        if (text) note(text, el);
      }, TIP_DELAY_MS);
    }

    function putAway() {
      current?.removeAttribute("data-key-hover");
      current = null;
      window.clearTimeout(tip);
    }

    function start() {
      const stops = stopsIn(scope());
      const hit = pointer && document.elementFromPoint(pointer.x, pointer.y);
      const under = hit && stops.find((stop) => stop.item.contains(hit));
      // In a row, the part under the mouse if it is on one.
      const part = under && under.item.matches(ROW) && stopsIn(under.item, under.item).find((stop) => stop.item.contains(hit));
      const first = part || under || firstOnScreen(stops, window.innerHeight);
      if (first) place(first.item);
    }

    /** The cursor's stop among the page's `stops` (its row's, on a part of one); when it is gone or out of reach (a popup opened or closed), it goes to the nearest one instead. */
    function found(stops: Stop<HTMLElement>[]) {
      const el = current && (rowOf(current) ?? current);
      const at = stops.find((stop) => stop.item === el);
      if (at && current!.isConnected) return at;
      const near = lastBox && nearestTo(lastBox, stops);
      if (near) place(near.item);
      return null;
    }

    function move(dir: Direction) {
      const row = rowOf(current!);
      // Along a row's parts; off either end, on from the row.
      if (row && (dir === "left" || dir === "right")) {
        const parts = stopsIn(row, row);
        const at = parts.find((stop) => stop.item === current);
        const next = at && nextInDirection(at.box, false, parts.filter((stop) => stop !== at), dir);
        if (next) return place(next.item);
      }
      const stops = stopsIn(scope());
      const at = found(stops);
      if (!at) return;
      // Into a row: its title, else its first part.
      if (!row && dir === "right" && at.item.matches(ROW)) {
        const into = titleOf(at.item) ?? stopsIn(at.item, at.item).sort((a, b) => a.box.left - b.box.left)[0]?.item;
        if (into) return place(into);
      }
      const next = nextInDirection(at.box, at.inBar, stops.filter((stop) => stop !== at), dir);
      if (next) place(next.item);
    }

    function press(el: HTMLElement) {
      const row = el.matches(ROW) ? el : rowOf(el);
      const isTask = row && (el === row || el === titleOf(row));
      // A task: its page; one with none is edited (from its row, first the title).
      if (isTask && row.dataset.keyRow) navigate.current(row.dataset.keyRow);
      else if (el === row) {
        const title = titleOf(row);
        if (title) place(title);
        else row.click();
      } else if (isTyping(el)) el.focus();
      else el.click();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
      const target = e.target as HTMLElement;
      if (isTyping(target)) {
        // Esc in a field the cursor opened: after the field's own Esc (which keeps it focused), back to moving.
        if (e.key === "Escape" && current?.contains(target)) window.setTimeout(() => target.blur());
        return;
      }
      if (e.key === " " && !e.shiftKey) {
        e.preventDefault();
        swallowUp = e.key;
        // On a field (a task's title, or its row): typing in it. Elsewhere it shows or puts away the cursor.
        const field = current?.isConnected && (isTyping(current) ? current : current.matches(ROW) ? titleOf(current) : null);
        if (field) {
          place(field);
          field.focus();
        } else if (current) putAway();
        else start();
        return;
      }
      if (!current) return;
      if (e.key === "Escape") {
        // A popup's Esc closes the popup; the cursor stays for what is under it.
        if (scope() === document) putAway();
        return;
      }
      const dir = ARROWS[e.key];
      if (e.key !== "Enter" && !dir) return;
      e.preventDefault();
      if (dir) return move(dir);
      swallowUp = e.key;
      if (found(stopsIn(scope()))) press(current);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== swallowUp) return;
      e.preventDefault();
      swallowUp = null;
    };
    // The mouse taking over puts the cursor away. A scroll can send a move without one (same place): that one doesn't.
    const onPointerMove = (e: PointerEvent) => {
      if (current && pointer && Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 2) putAway();
      pointer = { x: e.clientX, y: e.clientY };
    };
    const onPointerDown = () => putAway();

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      putAway();
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, []);
  return null;
}
