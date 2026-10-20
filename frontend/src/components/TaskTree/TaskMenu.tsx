import { addDays, mondayOf } from "../../../../shared/dates";
import { currentRound } from "../../../../shared/repeat";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { PixelCheckbox } from "../PixelCheckbox";
import { useGoals, useTags } from "../../hooks/labels";
import { useLists } from "../../hooks/lists";
import { useMoveRound, usePlaceInWeek, useSetToday, useSetWeek, useUpdateTask } from "../../hooks/tasks";
import { localDate } from "../../lib/clock";
import { toggleId } from "../../lib/labels";
import { pointsFieldWidth, typedPoints } from "../../lib/points";
import { REPEAT_UNIT_NAMES } from "../../lib/repeat";
import type { RepeatUnit, TaskTreeNode } from "../../types";
import { DateField, DeadlineFields } from "./DeadlineFields";
import { useTree } from "./TreeContext";

interface Props {
  node: TaskTreeNode;
  /** 0 = main task, 1 = its direct subtask, ... */
  depth: number;
  onAddSubtask: () => void;
  /** Opens the task's note at the side of the page. */
  onOpenNote: () => void;
}

interface LabelPickerProps {
  title: string;
  items: { id: string; name: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  emptyHint: string;
}

/** Tick any number of goals (or tags) for one task. Nothing is ticked by default. */
function LabelPicker({ title, items, selected, onChange, emptyHint }: LabelPickerProps) {
  return (
    <fieldset className="space-y-1 text-xs">
      <legend className="font-medium">{title}</legend>
      {items.length === 0 ? (
        <p className="text-stone-500">{emptyHint}</p>
      ) : (
        <div className="max-h-32 space-y-0.5 overflow-y-auto">
          {items.map((item) => (
            <label key={item.id} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-stone-100 dark:hover:bg-stone-800">
              <PixelCheckbox
                small
                checked={selected.includes(item.id)}
                onChange={() => onChange(toggleId(selected, item.id))}
              />
              <span className="truncate">{item.name}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

function Labels({ node }: { node: TaskTreeNode }) {
  const { data: goals = [] } = useGoals();
  const { data: tags = [] } = useTags();
  const update = useUpdateTask();

  return (
    <div className="space-y-3" data-menu-part="labels">
      <LabelPicker
        title="Goals"
        items={goals}
        selected={node.goalIds}
        onChange={(goalIds) => update.mutate({ id: node.id, changes: { goalIds } })}
        emptyHint="Add a goal in the Goals box first."
      />
      <LabelPicker
        title="Tags"
        items={tags}
        selected={node.tagIds}
        onChange={(tagIds) => update.mutate({ id: node.id, changes: { tagIds } })}
        emptyHint="Add a tag in the Tags box first."
      />
      {update.error && <p className="text-xs text-red-600">{update.error.message}</p>}
    </div>
  );
}

const CHECK_ROW = "flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-stone-100 dark:hover:bg-stone-800";

/** Today, Week and its own point amount (any task), and for main tasks: whether it is persistent and whether its subtasks get its points. */
function Doing({ node }: { node: TaskTreeNode }) {
  const { data: lists = [] } = useLists();
  const update = useUpdateTask();
  const setToday = useSetToday();
  const setWeek = useSetWeek();
  const placeInWeek = usePlaceInWeek();
  const moveRound = useMoveRound();
  const today = localDate();
  const nextMonday = addDays(mondayOf(today), 7);
  // A task on a schedule comes into Week by itself; what can be done about it is putting this week's round off.
  const round = node.weekDay === null ? currentRound(node, today) : null;
  const roundPutOff = round !== null && round.day >= nextMonday && node.roundMoves?.[round.planned] !== undefined;
  // Without a list, a task lives in Today or in Week: it can't leave the last of them.
  const canLeaveWeek = Boolean(node.parentId || node.listId || node.todaySince);
  const inThisWeek = node.weekDay !== null && node.weekDay < nextMonday;
  const inNextWeek = node.weekDay !== null && node.weekDay >= nextMonday;
  const list = lists.find((l) => l.id === node.listId);
  const isReward = node.valueKind === "reward";
  const isSubtask = node.parentId !== null;
  const pointsPlaceholder = String(isSubtask ? (node.points === null ? node.value : "") : (list?.defaultPoints ?? (node.points === null ? node.value : "")));
  const [points, setPoints] = useState(node.points === null ? "" : String(node.points));
  useEffect(() => setPoints(node.points === null ? "" : String(node.points)), [node.points]);
  const save = (changes: { points?: number | null; isPersistent?: boolean; pointsToSubtasks?: boolean }) =>
    update.mutate({ id: node.id, changes });

  function savePoints() {
    const text = points.trim();
    const next = text === "" ? null : Math.max(0, Math.round(Number(text)));
    if (next !== null && Number.isNaN(next)) return setPoints(node.points === null ? "" : String(node.points));
    if (next !== node.points) save({ points: next });
  }

  return (
    <div className="space-y-1">
      {/* A task written straight into Today or Week has no list to go back to, so it can't be taken out of the last of them. */}
      {(node.parentId || node.listId || node.weekDay) && (
        <label className={CHECK_ROW} data-menu-part="today">
          <PixelCheckbox
            small
            checked={node.todaySince !== null}
            onChange={(e) => setToday.mutate({ id: node.id, today: e.target.checked })}
          />
          Do today
        </label>
      )}
      {round === null && (canLeaveWeek || node.weekDay) && (
        <>
          <label className={CHECK_ROW} data-menu-part="week" title="On today in the Week tab of the Today box; drag it to another day there. Ticked, it stays until Monday">
            <PixelCheckbox
              small
              checked={inThisWeek}
              disabled={inThisWeek && !canLeaveWeek}
              onChange={(e) => (e.target.checked ? placeInWeek.mutate({ id: node.id, day: today }) : setWeek.mutate({ id: node.id, week: false }))}
            />
            Do this week
          </label>
          <label className={CHECK_ROW} data-menu-part="next-week" title="In the Next week part of the Week tab, under Sunday; on Monday it is on Monday">
            <PixelCheckbox
              small
              checked={inNextWeek}
              disabled={inNextWeek && !canLeaveWeek}
              onChange={(e) => (e.target.checked ? placeInWeek.mutate({ id: node.id, day: nextMonday }) : setWeek.mutate({ id: node.id, week: false }))}
            />
            Do next week
          </label>
        </>
      )}
      {round !== null && (round.day < nextMonday || roundPutOff) && (
        <label className={CHECK_ROW} data-menu-part="next-week" title="This week's round is put off to next week (Monday); the rounds after it keep their days">
          <PixelCheckbox
            small
            checked={roundPutOff}
            onChange={(e) => moveRound.mutate({ id: node.id, from: round.planned, to: e.target.checked ? nextMonday : round.planned })}
          />
          Do next week (this round)
        </label>
      )}
      <label className={CHECK_ROW} data-menu-part="persistent" title="Stays in its list and can be done again and again; each time counts its points.">
        <PixelCheckbox
          small
          checked={node.isPersistent}
          onChange={(e) => save({ isPersistent: e.target.checked })}
        />
        {isReward ? "Persistent (can be bought again)" : "Persistent (can be done again)"}
      </label>
      <label className="flex items-center gap-2 px-1 text-xs" data-menu-part="points">
        <span className="shrink-0">{isReward ? "Costs" : "Points"}</span>
        {/* The same dark field as a list's "N each". */}
        <input
          className="points-field tabular-nums placeholder:text-stone-400"
          style={pointsFieldWidth(points || pointsPlaceholder, 3)}
          type="text"
          inputMode="numeric"
          value={points}
          onChange={(e) => setPoints(typedPoints(e.target.value))}
          onBlur={savePoints}
          onKeyDown={(e) => e.key === "Enter" && savePoints()}
          placeholder={pointsPlaceholder}
          aria-label={`Points for this task (empty = ${isSubtask ? "what its main task hands down" : list ? "the list's amount" : "Today's amount"})`}
        />
        <span className="text-stone-500">
          {node.points !== null ? "its own amount" : isSubtask ? (node.value ? "its main task's amount" : "no points") : list ? "the list's amount" : "Today's amount"}
        </span>
      </label>
      {!isSubtask && (
        <label className={CHECK_ROW} title="Every subtask without an amount of its own is worth what this task is, each time one is ticked.">
          <PixelCheckbox small checked={node.pointsToSubtasks} onChange={(e) => save({ pointsToSubtasks: e.target.checked })} />
          {isReward ? "Subtasks cost this too" : "Subtasks earn this too"}
        </label>
      )}
      {(update.error ?? setToday.error ?? setWeek.error ?? placeInWeek.error ?? moveRound.error) && (
        <p className="text-xs text-red-600">{(update.error ?? setToday.error ?? setWeek.error ?? placeInWeek.error ?? moveRound.error)!.message}</p>
      )}
    </div>
  );
}

const REPEAT_FROM = [
  { afterDone: false, label: "Planned days", hint: "Keeps to its days: done late, the next round still comes on the planned day." },
  { afterDone: true, label: "After done", hint: "The next round is counted from the day you did it." },
];

const MISSED = [
  {
    makeUp: false,
    label: "Skip, flag !",
    hint: "A round you miss doesn't have to be made up. Missed in an earlier week, it is dropped: the task is on its planned days as ever, and a red ! on Monday in Week reminds you it wasn't done. Within the week it stays due until done.",
  },
  {
    makeUp: true,
    label: "Make up each",
    hint: "Every round you miss is still to be done: each press does the oldest one. Two weeks skipped on a weekly task is two presses to catch up.",
  },
];

/**
 * Persistent tasks: a schedule. With a number in "Every" the task is due again
 * every so many days, weeks or months; empty = no schedule, done whenever.
 */
function Repeat({ node }: { node: TaskTreeNode }) {
  const update = useUpdateTask();
  const [every, setEvery] = useState(node.repeatEvery === null ? "" : String(node.repeatEvery));
  const [unit, setUnit] = useState(node.repeatUnit);
  useEffect(() => setEvery(node.repeatEvery === null ? "" : String(node.repeatEvery)), [node.repeatEvery]);
  useEffect(() => setUnit(node.repeatUnit), [node.repeatUnit]);
  const isOn = node.repeatEvery !== null;
  const save = (changes: { repeatEvery?: number | null; repeatUnit?: RepeatUnit; repeatAfterDone?: boolean; repeatMakeUp?: boolean; nextDue?: string }) =>
    update.mutate({ id: node.id, changes });

  function saveEvery() {
    const next = every.trim() === "" ? null : Math.max(1, Number(every));
    if (next !== node.repeatEvery) save({ repeatEvery: next, repeatUnit: unit });
  }

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center gap-2 px-1">
        <span className="shrink-0">Every</span>
        <input
          className="points-field !w-10 tabular-nums placeholder:text-stone-400"
          type="text"
          inputMode="numeric"
          maxLength={3}
          value={every}
          onChange={(e) => setEvery(e.target.value.replace(/\D/g, ""))}
          onBlur={saveEvery}
          onKeyDown={(e) => e.key === "Enter" && saveEvery()}
          placeholder="-"
          aria-label="Repeat every so many (empty = no schedule)"
        />
        <select
          className="min-w-0 flex-1 border-2 border-stone-300 bg-white px-1 py-1 text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
          value={unit}
          onChange={(e) => {
            const next = e.target.value as RepeatUnit;
            setUnit(next);
            if (isOn) save({ repeatUnit: next });
          }}
          aria-label="Days, weeks or months"
        >
          {REPEAT_UNIT_NAMES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {isOn ? (
        <>
          <div className="flex items-center gap-2 px-1">
            <span className="shrink-0">Next</span>
            <DateField value={node.nextDue} label="Next due date" onChange={(nextDue) => nextDue && save({ nextDue })} />
          </div>
          <div className="flex gap-1" role="group" aria-label="What the next round is counted from">
            {REPEAT_FROM.map((option) => (
              <button
                key={option.label}
                type="button"
                title={option.hint}
                aria-pressed={node.repeatAfterDone === option.afterDone}
                onClick={() => save({ repeatAfterDone: option.afterDone })}
                className={`nes-btn btn-small flex-1 ${node.repeatAfterDone === option.afterDone ? "is-primary" : ""}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-stone-500">{REPEAT_FROM.find((option) => option.afterDone === node.repeatAfterDone)!.hint}</p>
          {/* Counted from the day it was done, a round can't be missed: it waits until it is done. */}
          {!node.repeatAfterDone && (
            <>
              <div className="flex gap-1" role="group" aria-label="Rounds that were missed" data-menu-part="missed">
                {MISSED.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    title={option.hint}
                    aria-pressed={node.repeatMakeUp === option.makeUp}
                    onClick={() => save({ repeatMakeUp: option.makeUp })}
                    className={`nes-btn btn-small flex-1 ${node.repeatMakeUp === option.makeUp ? "is-primary" : ""}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-stone-500">{MISSED.find((option) => option.makeUp === node.repeatMakeUp)!.hint}</p>
            </>
          )}
        </>
      ) : (
        <p className="px-1 text-stone-500">Fill in a number to make it come back on a schedule.</p>
      )}
      {update.error && <p className="text-red-600">{update.error.message}</p>}
    </div>
  );
}

/**
 * The "⋯" on each row: today / persistent / points, a schedule, goals and tags (any task,
 * none by default), deadline (main tasks and their direct subtasks), the note (main
 * tasks), and the touch-friendly equivalents of Ctrl+Enter and Delete.
 */
export function TaskMenu({ node, depth, onAddSubtask, onOpenNote }: Props) {
  const tree = useTree();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  // Under its button, in the page's own coordinates. The menu is put on the page itself (a portal), so no box it
  // is opened in can cut it off: the Week tab's days scroll on their own, and would.
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!isOpen) return;
    const measure = () => {
      const button = ref.current?.getBoundingClientRect();
      // Its right edge on the button's (the class shifts it back by its own width); counted from the left, so a
      // scroll bar on the page doesn't move it.
      if (button) setPlace({ top: button.bottom + window.scrollY + 4, left: button.right + window.scrollX });
    };
    measure();
    // A box scrolled under it (the week's days) takes its button along: the menu follows.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [isOpen]);
  // Opened from a row low on the screen it would hang off the bottom: the page scrolls just enough to show all of it.
  useEffect(() => {
    if (isOpen && place) menu.current?.scrollIntoView({ block: "nearest" });
    // Once, when it opens and has its place; not each time it follows its button.
  }, [isOpen, place === null]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !menu.current?.contains(target)) setIsOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
      if (e.key !== "Enter" || e.isComposing || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
      // Enter is OK: it saves the field being typed in and closes. Not where the key has a job of its own: on a
      // button (the calendar, Add subtask, the ⋯ itself), in a dropdown, in the calendar's own field. A switch
      // that is one of a pair (Hard / Soft) was set by its click, so there Enter is OK too.
      const target = e.target as HTMLElement;
      if (target.closest("select, input[type=date]") || target.closest("button:not([aria-pressed])")) return;
      e.preventDefault();
      // Leaving a typed field saves it. A date that can't be read keeps the menu open, with its message.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      if (!menu.current?.querySelector('[aria-invalid="true"]')) setIsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <span ref={ref} className="relative">
      <button
        type="button"
        className="btn-quiet glyph"
        aria-label="Task options"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        ⋯
      </button>
      {isOpen &&
        place &&
        createPortal(
          // On a phone it is a sheet along the bottom of the screen: beside its button it would hang off the edge.
          // It lies over the task bar (z-50), so a menu opened low on the screen is not cut off by it.
          <div
            ref={menu}
            style={{ "--menu-top": `${place.top}px`, "--menu-left": `${place.left}px` } as CSSProperties}
            className="card absolute top-(--menu-top) left-(--menu-left) z-50 w-64 -translate-x-full max-sm:translate-x-0 space-y-3 !p-3 shadow-lg max-sm:fixed max-sm:inset-x-2 max-sm:top-auto max-sm:bottom-2 max-sm:z-50 max-sm:max-h-[75dvh] max-sm:w-auto max-sm:overflow-y-auto"
            role="dialog"
            aria-label="Task options"
          >
            <Doing node={node} />
            {/* A schedule is for tasks done again and again, so it is offered once Persistent is ticked. */}
            {node.isPersistent && (
              <div className="space-y-1 text-xs">
                <span className="font-medium">Repeat</span>
                <Repeat node={node} />
              </div>
            )}
            <Labels node={node} />
            {depth <= 1 && !node.isPersistent && (
              <div className="space-y-1 text-xs" data-menu-part="deadline">
                <span className="font-medium">Deadline</span>
                <DeadlineFields task={node} />
              </div>
            )}
            <div className="flex justify-between border-t border-stone-200 pt-2 dark:border-stone-800">
              <button type="button" className="btn-quiet" onClick={() => (setIsOpen(false), onAddSubtask())}>
                Add subtask
              </button>
              <button type="button" className="btn-quiet inline-flex items-center gap-1" data-menu-part="note" onClick={() => (setIsOpen(false), onOpenNote())}>
                <span aria-hidden className={`notes-button ${node.notes ? "" : "opacity-45 grayscale"}`} />
                Note
              </button>
              <button type="button" className="btn-quiet !text-red-600" onClick={() => (setIsOpen(false), tree.deleteTask(node))}>
                Delete task
              </button>
            </div>
            {/* Everything above is saved as it is changed (a typed field when it is left); OK just says so and closes. Enter does the same. */}
            <button type="button" className="nes-btn is-primary btn" title="Changes are saved; close this menu (Enter)" onClick={() => setIsOpen(false)}>
              OK
            </button>
          </div>,
        document.body,
      )}
    </span>
  );
}
