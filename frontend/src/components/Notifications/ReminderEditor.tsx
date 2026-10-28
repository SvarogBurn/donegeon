import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { REMINDER_KINDS } from "../../../../shared/enums";
import { listNotes } from "../../api/notes";
import { NOTES } from "../../hooks/queryKeys";
import { usePointsOff } from "../../hooks/useAuth";
import {
  AHEAD,
  isNotifyTime,
  KIND_NAMES,
  KIND_NOTES,
  RECAP_NOTE_NO_POINTS,
  MAX_REMINDER_TIMES,
  newReminderId,
  NOTIFY_FROM,
  NOTIFY_TO,
  spreadTimes,
  WEEKDAY_NAMES,
  type Reminder,
  type ReminderKind,
} from "../../lib/notifySettings";

export const FIELD = "border-2 border-stone-300 bg-white px-1 py-1 text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100";

/** A time field limited to the hours notifications come in. */
export function TimeField({ value, onChange, label, name }: { value: string; onChange: (time: string) => void; label: string; name?: string }) {
  return (
    <input
      className={`tabular-nums ${FIELD}`}
      type="time"
      min={NOTIFY_FROM}
      max={NOTIFY_TO}
      step={60}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      aria-invalid={value !== "" && !isNotifyTime(value)}
      {...(name && { [`data-${name}`]: true })}
    />
  );
}

interface Props {
  /** The reminder being changed; none = a new one. */
  value?: Reminder;
  /** A reminder on this task, made from its ⋯ menu: what it says is the task (or its own words). */
  task?: { id: string; title: string; scheduled: boolean };
  onSave: (reminder: Reminder) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

/**
 * Makes or changes a reminder: what it says (its own words and a note it opens, or "next N days"), on which days
 * (every day, weekdays picked, or, on a task on a schedule, the days it is due) and at what times (set ones, or N
 * evenly from A to B), all between NOTIFY_FROM and NOTIFY_TO. Enter in a field saves it.
 */
export function ReminderEditor({ value, task, onSave, onCancel, onDelete }: Props) {
  const [kind, setKind] = useState<ReminderKind>(value?.kind ?? (task ? "text" : "today"));
  const pointsOff = usePointsOff();
  const [text, setText] = useState(value?.text ?? "");
  const [noteId, setNoteId] = useState(value?.noteId ?? "");
  const [ahead, setAhead] = useState(String(value?.ahead ?? AHEAD.first));
  const [dayMode, setDayMode] = useState<"all" | "due" | "pick">(value ? (Array.isArray(value.days) ? "pick" : value.days) : task?.scheduled ? "due" : "all");
  const [weekdays, setWeekdays] = useState<number[]>(Array.isArray(value?.days) ? value.days : []);
  const [timeMode, setTimeMode] = useState<"set" | "spread">(value?.spread ? "spread" : "set");
  const [times, setTimes] = useState<string[]>(value?.spread ? ["09:00"] : (value?.times ?? ["09:00"]));
  const [spread, setSpread] = useState(value?.spread ?? { count: 3, from: "09:00", to: "21:00" });
  const [problem, setProblem] = useState<string | null>(null);
  // The notes an own-text reminder can open: asked for only then.
  const canLink = kind === "text" && !task;
  const { data: notesData } = useQuery({ queryKey: NOTES, queryFn: listNotes, enabled: canLink });
  const notes = canLink ? (notesData?.notes ?? []) : [];

  function save(e: FormEvent) {
    e.preventDefault();
    if (dayMode === "pick" && weekdays.length === 0) return setProblem("Pick a day.");
    const chosen = timeMode === "spread" ? (isNotifyTime(spread.from) && isNotifyTime(spread.to) ? spreadTimes(spread.count, spread.from, spread.to) : []) : times.filter((time) => time !== "");
    if (chosen.length === 0 || !chosen.every(isNotifyTime)) return setProblem(`Times are between ${NOTIFY_FROM} and ${NOTIFY_TO}.`);
    const note = notes.find((one) => one.id === noteId);
    const words = text.trim();
    if (kind === "text" && !task && !note && !words) return setProblem("Write what it should say.");
    const days = Math.max(AHEAD.min, Math.min(AHEAD.max, Math.round(Number(ahead)) || AHEAD.first));
    onSave({
      id: value?.id ?? newReminderId(),
      on: value?.on ?? true,
      kind,
      days: dayMode === "pick" ? [...weekdays].sort() : dayMode,
      times: [...new Set(chosen)].sort(),
      ...(timeMode === "spread" && { spread }),
      ...(kind === "text" && words && { text: words }),
      ...(kind === "deadlines" && { ahead: days }),
      ...(task && { taskId: task.id }),
      ...(note && { noteId: note.id, linkTitle: note.title || "Note" }),
    });
  }

  const radio = (name: string, checked: boolean, onChange: () => void, label: string) => (
    <label className="flex items-center gap-1.5">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="accent-sky-700" />
      {label}
    </label>
  );

  return (
    // Enter is this form's (it saves), not the ⋯ menu's around it. The times are checked by save(), which says why
    // in the box, not by the browser's own bubble.
    <form className="space-y-2 border-2 border-dashed border-stone-300 p-2 text-xs dark:border-stone-700" onSubmit={save} noValidate data-own-enter data-reminder-editor>
      {task ? (
        <label className="flex flex-col gap-1">
          It says
          <input className={FIELD} value={text} maxLength={200} placeholder={task.title} onChange={(e) => setText(e.target.value)} data-reminder-text />
        </label>
      ) : (
        <>
          <label className="flex flex-wrap items-center gap-2">
            What
            <select className={FIELD} value={kind} onChange={(e) => setKind(e.target.value as ReminderKind)} data-reminder-kind>
              {REMINDER_KINDS.map((one) => (
                <option key={one} value={one}>
                  {KIND_NAMES[one]}
                </option>
              ))}
            </select>
          </label>
          <p className="text-stone-500">{pointsOff && kind === "recap" ? RECAP_NOTE_NO_POINTS : KIND_NOTES[kind]}</p>
          {kind === "text" && (
            <>
              <input className={`w-full ${FIELD}`} value={text} maxLength={200} placeholder="Water the plants" onChange={(e) => setText(e.target.value)} aria-label="What it says" data-reminder-text />
              {notes.length > 0 && (
                <label className="flex flex-wrap items-center gap-2">
                  Opens
                  <select className={`max-w-full ${FIELD}`} value={noteId} onChange={(e) => setNoteId(e.target.value)} data-reminder-note>
                    <option value="">Nothing</option>
                    {notes.map((note) => (
                      <option key={note.id} value={note.id}>
                        {note.title || "Note"}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
          {kind === "deadlines" && (
            <label className="flex items-center gap-2">
              The next
              <input
                className={`w-10 tabular-nums ${FIELD}`}
                type="text"
                inputMode="numeric"
                value={ahead}
                onChange={(e) => setAhead(e.target.value.replace(/\D/g, "").slice(0, 2))}
                aria-label="How many days ahead"
                data-reminder-ahead
              />
              days
            </label>
          )}
        </>
      )}

      <fieldset className="space-y-1">
        <legend className="mb-1">When</legend>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {radio("days", dayMode === "all", () => setDayMode("all"), "Every day")}
          {task?.scheduled && radio("days", dayMode === "due", () => setDayMode("due"), "On days it's due")}
          {radio("days", dayMode === "pick", () => setDayMode("pick"), "On these days")}
        </div>
        {dayMode === "pick" && (
          <div className="flex flex-wrap gap-1">
            {WEEKDAY_NAMES.map((name, day) => (
              <button
                key={name}
                type="button"
                aria-pressed={weekdays.includes(day)}
                className={`border-2 px-1.5 py-0.5 ${weekdays.includes(day) ? "border-sky-700 bg-sky-700 text-white" : "border-stone-300 dark:border-stone-700"}`}
                onClick={() => setWeekdays(weekdays.includes(day) ? weekdays.filter((one) => one !== day) : [...weekdays, day])}
                data-reminder-day={day}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="mb-1">At</legend>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {radio("times", timeMode === "set", () => setTimeMode("set"), "Set times")}
          {radio("times", timeMode === "spread", () => setTimeMode("spread"), "Times a day")}
        </div>
        {timeMode === "set" ? (
          <div className="flex flex-wrap items-center gap-1">
            {times.map((time, at) => (
              <span key={at} className="flex items-center">
                <TimeField value={time} onChange={(next) => setTimes(times.map((old, i) => (i === at ? next : old)))} label={`Time ${at + 1}`} name="reminder-time" />
                {times.length > 1 && (
                  <button type="button" className="btn-quiet px-1" aria-label="Remove this time" onClick={() => setTimes(times.filter((_, i) => i !== at))}>
                    ×
                  </button>
                )}
              </span>
            ))}
            {times.length < MAX_REMINDER_TIMES && (
              <button type="button" className="btn-quiet underline" onClick={() => setTimes([...times, times.at(-1) ?? "09:00"])} data-reminder-add-time>
                + Add time
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            <input
              className={`w-10 tabular-nums ${FIELD}`}
              type="text"
              inputMode="numeric"
              value={spread.count}
              onChange={(e) => setSpread({ ...spread, count: Math.max(1, Math.min(MAX_REMINDER_TIMES, Number(e.target.value.replace(/\D/g, "")) || 1)) })}
              aria-label="How many times a day"
              data-reminder-count
            />
            times, from <TimeField value={spread.from} onChange={(from) => setSpread({ ...spread, from })} label="From" name="reminder-from" />
            to <TimeField value={spread.to} onChange={(to) => setSpread({ ...spread, to })} label="To" name="reminder-to" />
          </div>
        )}
        <p className="text-stone-500">
          Between {NOTIFY_FROM} and {NOTIFY_TO}: the server sends nothing at night.
        </p>
      </fieldset>

      {problem && <p className="text-red-600">{problem}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="nes-btn btn-small is-primary" data-reminder-save>
          Save
        </button>
        <button type="button" className="nes-btn btn-small" onClick={onCancel}>
          Cancel
        </button>
        {onDelete && (
          <button type="button" className="btn-quiet ml-auto !text-red-600" onClick={onDelete} data-reminder-delete>
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
