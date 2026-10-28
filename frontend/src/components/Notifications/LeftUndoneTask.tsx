import { addDays } from "../../../../shared/dates";
import { useState } from "react";
import { createPortal } from "react-dom";
import { localDate } from "../../lib/clock";
import { useDeleteTask, usePlaceInWeek, usePressTask, useSetToday, useSetWeek, useToggleTask } from "../../hooks/tasks";
import { formatDay } from "../../lib/dates";
import type { LeftUndone } from "../../lib/notifications";
import { newId } from "../../lib/offline/changes";
import { RichText } from "../RichText";
import { DateField } from "../TaskTree/DeadlineFields";

/** Whether a task left undone has a home of its own (a list, a task above it) to stay in when it is dropped. */
export const hasHome = (item: LeftUndone) => Boolean(item.node.parentId || item.node.listId);

/**
 * Takes a task left undone out of where it was left (Today, Week), back to only its list. One with no list lives
 * only there, so it can't be dropped, only deleted.
 */
export function useDropLeftUndone() {
  const setToday = useSetToday();
  const setWeek = useSetWeek();
  return (item: LeftUndone) => {
    if (item.node.todaySince !== null) setToday.mutate({ id: item.node.id, today: false });
    if (item.node.weekDay !== null) setWeek.mutate({ id: item.node.id, week: false });
  };
}

/**
 * What a task left undone in the bell opens: when will it be done? Today, tomorrow or another day puts it back where it
 * was left, on that day: in Today, or on that day of the Week. It can be done now, or dropped (it stays in its list).
 * Each saves at once (offline too) and the notification is gone.
 */
export function LeftUndoneTask({ item, onClose }: { item: LeftUndone; onClose: () => void }) {
  const setToday = useSetToday();
  const placeInWeek = usePlaceInWeek();
  const { mutate: toggle } = useToggleTask();
  const { mutate: press } = usePressTask();
  const { mutate: remove } = useDeleteTask();
  const drop = useDropLeftUndone();
  const [isPast, setIsPast] = useState(false);
  const today = localDate();
  const { node } = item;
  const waits = !node.isPersistent && node.descendantDoneCount < node.descendantCount;
  const choices = [
    { label: "Today", day: today },
    { label: "Tomorrow", day: addDays(today, 1) },
    { label: "In 3 days", day: addDays(today, 3) },
    { label: "In a week", day: addDays(today, 7) },
  ];

  function doOn(day: string | null) {
    if (!day) return;
    if (day < today) return setIsPast(true);
    if (item.inWeek) {
      placeInWeek.mutate({ id: node.id, day });
      // Left in both: it goes on in Week, and its old mark for Today goes.
      if (item.inToday) setToday.mutate({ id: node.id, today: false });
    } else setToday.mutate({ id: node.id, today: day });
    onClose();
  }

  function doneNow() {
    if (node.isPersistent) press({ id: node.id, completionId: newId() });
    else toggle({ id: node.id, done: true });
    onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="card max-h-full w-96 max-w-full space-y-3 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Left undone" data-left-undone-task={node.id}>
        <p className="font-pixel text-[10px] text-amber-700 dark:text-amber-400">Left undone</p>
        <h3 className="text-sm break-words whitespace-pre-line">
          <RichText text={node.title} />
        </h3>
        <p className="text-xs text-stone-500">
          {item.path.length > 0 && `Part of ${item.path.join(" › ")}. `}
          It was for {formatDay(item.day, true)}, in {item.inWeek ? "the Week" : "Today"}.
        </p>
        <p className="text-sm">When will you do it?</p>
        <div className="grid grid-cols-2 gap-2">
          {choices.map((choice, i) => (
            <button key={choice.label} type="button" className="nes-btn btn-small" onClick={() => doOn(choice.day)} autoFocus={i === 0}>
              {choice.label}
              <span className="block text-[8px] text-stone-500">{formatDay(choice.day, true)}</span>
            </button>
          ))}
        </div>
        <div>
          <p className="mb-1 text-xs text-stone-500">Another day</p>
          <DateField value={null} onChange={doOn} label="Day to do it" />
          {isPast && <p className="mt-1 text-xs text-red-600">Pick today or a later day.</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-quiet" disabled={waits} title={waits ? "Tick its subtasks first" : undefined} onClick={doneNow}>
            {node.isPersistent ? "Done it" : "Done already"}
          </button>
          {hasHome(item) ? (
            <button
              type="button"
              className="btn-quiet"
              title="Not doing it for now: it leaves Today and the Week and stays in its list"
              onClick={() => {
                drop(item);
                onClose();
              }}
            >
              Drop it
            </button>
          ) : (
            <button
              type="button"
              className="btn-quiet text-red-600"
              title="It lives only here, in no list"
              onClick={() => {
                remove({ id: node.id });
                onClose();
              }}
            >
              Delete it
            </button>
          )}
          <button type="button" className="nes-btn btn-small" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
