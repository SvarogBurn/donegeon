import { addDays } from "../../../../shared/dates";
import { useState } from "react";
import { createPortal } from "react-dom";
import { localDate } from "../../lib/clock";
import { useDeleteTask, useToggleTask, useUpdateTask } from "../../hooks/tasks";
import { formatDay } from "../../lib/dates";
import { finishingPlan } from "../../lib/deadlines";
import { plainFirstLine } from "../../lib/markup";
import type { PassedDeadline } from "../../lib/notifications";
import { isBigTask } from "../../lib/taskPage";
import { DeleteOrKeep } from "../DeleteOrKeep";
import { RichText } from "../RichText";
import { DateField } from "../TaskTree/DeadlineFields";

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/**
 * What a passed deadline in the bell opens: when should it be instead? A day picked saves at once (offline too) and
 * the notification is gone, the task being on time again. The deadline can also be taken off, or the reminder dismissed.
 * A big task can also be finished with what was done: what is left undone deleted, after asking, and it ticked
 * (finishingPlan), offline too, the changes going out in that order.
 * Opened from the deadlines box too, which passes `onOpenTask`: its marker no longer goes straight to the task's page.
 */
export function PostponeDeadline({ item, onDismiss, onClose, onOpenTask }: { item: PassedDeadline; onDismiss: () => void; onClose: () => void; onOpenTask?: () => void }) {
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const toggle = useToggleTask();
  const [isPast, setIsPast] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const today = localDate();
  const { node } = item;
  const plan = isBigTask(node) ? finishingPlan(node) : null;
  const choices = [
    { label: "Today", day: today },
    { label: "Tomorrow", day: addDays(today, 1) },
    { label: "In 3 days", day: addDays(today, 3) },
    { label: "In a week", day: addDays(today, 7) },
  ];

  function save(deadlineDate: string | null) {
    if (deadlineDate && deadlineDate < today) return setIsPast(true);
    update.mutate({ id: node.id, changes: { deadlineDate } });
    onClose();
  }

  function finish() {
    if (!plan) return;
    plan.remove.forEach((id) => remove.mutate({ id }));
    plan.tick.forEach((id) => toggle.mutate({ id, done: true }));
    onClose();
  }
  const left = plan?.remove.length ?? 0;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="card max-h-full w-96 max-w-full space-y-3 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Passed deadline" data-postpone={node.id}>
        <p className="font-pixel text-[10px] text-red-600">Deadline passed</p>
        <h3 className="text-sm break-words whitespace-pre-line">
          <RichText text={node.title} />
        </h3>
        <p className="text-xs text-stone-500">
          {item.path.length > 0 && `Part of ${item.path.join(" › ")}. `}
          Its last day was {formatDay(node.deadlineDate!, true)}, {days(item.daysLate)} ago.
        </p>
        <p className="text-sm">For when would you like to change the deadline?</p>
        <div className="grid grid-cols-2 gap-2">
          {choices.map((choice, i) => (
            <button key={choice.label} type="button" className="nes-btn btn-small" onClick={() => save(choice.day)} autoFocus={i === 1}>
              {choice.label}
              <span className="block text-[8px] text-stone-500">{formatDay(choice.day, true)}</span>
            </button>
          ))}
        </div>
        <div>
          <p className="mb-1 text-xs text-stone-500">Another day</p>
          <DateField value={null} onChange={(day) => day && save(day)} label="New deadline" />
          {isPast && <p className="mt-1 text-xs text-red-600">Pick today or a later day.</p>}
        </div>
        {isFinishing && (
          <div className="space-y-2 border-t border-stone-200 pt-2 dark:border-stone-800" data-finish-ask>
            <p className="text-sm">
              Delete {left === 1 ? "the subtask" : `the ${left} subtasks`} not done and tick “{plainFirstLine(node.title)}”? What's done stays.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <DeleteOrKeep onDelete={finish} onKeep={() => setIsFinishing(false)} />
            </div>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {onOpenTask && (
            <button type="button" className="btn-quiet" onClick={onOpenTask}>
              Go to the task
            </button>
          )}
          {plan && !isFinishing && (
            <button
              type="button"
              className="btn-quiet"
              title="Deletes its subtasks not done (it asks first), keeps the ticked ones, and ticks it"
              onClick={() => (left > 0 ? setIsFinishing(true) : finish())}
              data-finish-big
            >
              {left > 0 ? "Delete what's left and finish it" : "Finish it"}
            </button>
          )}
          <button type="button" className="btn-quiet" onClick={() => save(null)}>
            Remove the deadline
          </button>
          <button
            type="button"
            className="btn-quiet"
            title="Leaves the deadline as it is and stops reminding about it"
            onClick={() => {
              onDismiss();
              onClose();
            }}
          >
            Dismiss
          </button>
          <button type="button" className="nes-btn btn-small" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
