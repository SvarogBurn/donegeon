import { useEffect, useRef, useState } from "react";
import { useUpdateTask } from "../../hooks/useTasks";
import { formatFullDay, parseDay } from "../../lib/dates";
import type { Task } from "../../types";

const TYPES = [
  { value: "hard", label: "Hard", hint: "Counts toward daily pressure and gets a countdown." },
  { value: "soft", label: "Soft", hint: "Shown as a reminder only." },
] as const;

interface DateFieldProps {
  /** "YYYY-MM-DD" or null. */
  value: string | null;
  onChange: (value: string | null) => void;
}

/**
 * A date typed day-first as dd/mm/yyyy, whatever the browser's own language
 * would show. The calendar button opens the browser's picker for the same value.
 */
function DateField({ value, onChange }: DateFieldProps) {
  const [text, setText] = useState(value ? formatFullDay(value) : "");
  const [isInvalid, setIsInvalid] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setText(value ? formatFullDay(value) : "");
    setIsInvalid(false);
  }, [value]);

  function commit() {
    if (!text.trim()) {
      if (value) onChange(null);
      return setIsInvalid(false);
    }
    const parsed = parseDay(text);
    setIsInvalid(!parsed);
    if (parsed && parsed !== value) onChange(parsed);
    else if (parsed) setText(formatFullDay(parsed));
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        className={`input pr-9 tabular-nums ${isInvalid ? "!border-red-600" : ""}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          // Don't let the menu's Escape handler close it mid-edit without restoring the text.
          if (e.key === "Escape") setText(value ? formatFullDay(value) : "");
        }}
        placeholder="dd/mm/yyyy"
        aria-label="Deadline date (dd/mm/yyyy)"
        aria-invalid={isInvalid}
        inputMode="numeric"
      />
      <button
        type="button"
        className="btn-quiet absolute top-1/2 right-1 -translate-y-1/2"
        aria-label="Pick the date from a calendar"
        onClick={() => picker.current?.showPicker()}
      >
        ▦
      </button>
      {/* Only used for its calendar popup; never shown, so its locale format doesn't matter. */}
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute right-0 bottom-0 size-0 opacity-0"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      />
      {isInvalid && <p className="mt-1 text-xs text-red-600">Use day/month/year, e.g. 07/10/2026</p>}
    </div>
  );
}

/** Date + hard/soft switch. Saves on every change; used in the task menu and on the countdown page. */
export function DeadlineFields({ task }: { task: Pick<Task, "id" | "deadlineDate" | "deadlineType"> }) {
  const update = useUpdateTask();
  const save = (changes: { deadlineDate?: string | null; deadlineType?: "hard" | "soft" }) =>
    update.mutate({ id: task.id, changes });
  const type = task.deadlineType ?? "hard";

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        {/* The server keeps the current type, so a quick type-then-date change can't send a stale type back. */}
        <DateField value={task.deadlineDate} onChange={(deadlineDate) => save({ deadlineDate })} />
        {task.deadlineDate && (
          <button type="button" className="btn-quiet mt-1.5 shrink-0" onClick={() => save({ deadlineDate: null })}>
            Remove
          </button>
        )}
      </div>
      {/* Hard or soft is the user's call and can be chosen before there is a date. */}
      <div className="flex gap-1" role="group" aria-label="Deadline type">
        {TYPES.map((option) => (
          <button
            key={option.value}
            type="button"
            title={option.hint}
            aria-pressed={type === option.value}
            onClick={() => save({ deadlineType: option.value })}
            className={`flex-1 rounded-md border px-2 py-1 text-xs ${type === option.value ? "border-emerald-700 bg-emerald-700 text-white" : "border-stone-300 dark:border-stone-700"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-stone-500">{TYPES.find((t) => t.value === type)!.hint}</p>
      {update.error && <p className="text-xs text-red-600">{update.error.message}</p>}
    </div>
  );
}
