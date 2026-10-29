import { addDays } from "../../../../shared/dates";
import { useState } from "react";
import { createPortal } from "react-dom";
import { localDate } from "../../lib/clock";
import { useUpdateTask } from "../../hooks/tasks";
import { formatDay } from "../../lib/dates";
import type { PassedDeadline } from "../../lib/notifications";
import { RichText } from "../RichText";
import { DateField } from "../TaskTree/DeadlineFields";

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

/**
 * What a passed deadline in the bell opens: when should it be instead? A day picked saves at once (offline too) and
 * the notification is gone, the task being on time again. The deadline can also be taken off, or the reminder dismissed.
 * Opened from the deadlines box too, which passes `onOpenTask`: its marker no longer goes straight to the task's page.
 */
export function PostponeDeadline({ item, onDismiss, onClose, onOpenTask }: { item: PassedDeadline; onDismiss: () => void; onClose: () => void; onOpenTask?: () => void }) {
  const update = useUpdateTask();
  const [isPast, setIsPast] = useState(false);
  const today = localDate();
  const { node } = item;
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
        <div className="flex flex-wrap justify-end gap-2">
          {onOpenTask && (
            <button type="button" className="btn-quiet" onClick={onOpenTask}>
              Go to the task
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
