import { useEffect, useState, type ReactNode } from "react";
import { sendTestNotification } from "../../api/notifications";
import { ApiError } from "../../api/client";
import { usePushDevice } from "../../hooks/notifications";
import { useTaskTrees } from "../../hooks/tasks";
import { useNotifySettings, useReminders } from "../../hooks/useAuth";
import { findTask } from "../../lib/notifySchedule";
import { DAYS_BEFORE, isNotifyTime, KIND_NAMES, NOTIFY_FROM, NOTIFY_TO, reminderSummary, SNOOZE, WEEKS_BEFORE, type NotifySettings, type Reminder } from "../../lib/notifySettings";
import { plainFirstLine } from "../../lib/markup";
import type { PushState } from "../../lib/pushDevice";
import type { TaskTreeNode } from "../../types";
import { PixelCheckbox } from "../PixelCheckbox";
import { FIELD, ReminderEditor, TimeField } from "./ReminderEditor";

const STATE_NOTES: Record<PushState, string> = {
  unsupported: "This browser can't show notifications from Donegeon. They still show in the bell.",
  install: "On an iPhone or iPad, notifications only come to Donegeon added to the home screen: Share › Add to Home Screen, then turn them on there.",
  noWorker: "Only the built app can show notifications (the dev server has no service worker). They still show in the bell.",
  denied: "Notifications are blocked for Donegeon in this browser. Allow them in the browser's site settings, then come back here.",
  off: "Off on this device: they only show in the bell. Turn them on here on each phone or computer that should get them.",
  on: "On for this device. Turn them on on your other devices too, if you like.",
};

/** This device's switch: push notifications are turned on per browser, apart from the account's choices below it. */
function DeviceSwitch() {
  const { state, serverKey, busy, turnOn, turnOff } = usePushDevice();
  const [test, setTest] = useState<string | null>(null);
  if (state === null || serverKey === undefined) return null;
  if (serverKey === null) return <p className="text-xs text-stone-500">Notifications aren't set up on this server yet, so they only show in the bell.</p>;

  async function sendTest() {
    setTest("Sending…");
    try {
      await sendTestNotification();
      setTest("Sent: it should show in a moment.");
    } catch (err) {
      setTest(err instanceof ApiError ? err.message : "It couldn't be sent.");
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {state === "on" ? (
          <>
            <button type="button" className="nes-btn btn-small" disabled={busy} onClick={() => void turnOff()} data-push-off>
              Turn off for this device
            </button>
            <button type="button" className="nes-btn btn-small" onClick={() => void sendTest()} data-push-test>
              Send a test
            </button>
          </>
        ) : (
          state === "off" && (
            <button type="button" className="nes-btn btn-small is-primary" disabled={busy} onClick={() => void turnOn()} data-push-on>
              Turn on for this device
            </button>
          )
        )}
      </div>
      <p className="text-xs text-stone-500" data-push-state={state}>
        {STATE_NOTES[state]}
      </p>
      {test && <p className="text-xs text-stone-500">{test}</p>}
    </>
  );
}

/** A number typed; out of bounds goes back to the saved one. */
function AmountField({ value, bounds, onSave, label, name, width = "w-10" }: { value: number; bounds: { min: number; max: number }; onSave: (amount: number) => void; label: string; name: string; width?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  function done() {
    const next = Number(text);
    if (!Number.isInteger(next) || next < bounds.min || next > bounds.max) return setText(String(value));
    if (next !== value) onSave(next);
  }
  return (
    <input
      className={`${width} tabular-nums ${FIELD}`}
      type="text"
      inputMode="numeric"
      value={text}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setText(e.target.value.replace(/\D/g, "").slice(0, 3))}
      onBlur={done}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      aria-label={label}
      {...{ [`data-notify-${name}`]: true }}
    />
  );
}

/** A time saved once it is a whole one within the hours; while it is typed, or out of them, the saved one stays. */
function SavedTime({ value, onSave, label, name }: { value: string; onSave: (time: string) => void; label: string; name: string }) {
  const [time, setTime] = useState(value);
  useEffect(() => setTime(value), [value]);
  return (
    <TimeField
      value={time}
      onChange={(next) => {
        setTime(next);
        if (isNotifyTime(next) && next !== value) onSave(next);
      }}
      label={label}
      name={name}
    />
  );
}

function Indented({ children }: { children: ReactNode }) {
  return <div className="ml-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">{children}</div>;
}

/** What a reminder is called in the list: its kind, or its own words, or the task or note it is on. */
function reminderName(reminder: Reminder, trees: TaskTreeNode[]) {
  if (reminder.kind !== "text") return KIND_NAMES[reminder.kind];
  const task = reminder.taskId ? findTask(trees, reminder.taskId)?.node : undefined;
  if (reminder.taskId) return reminder.text ?? (task ? plainFirstLine(task.title) : "A task done or deleted");
  return reminder.text ?? reminder.linkTitle ?? "Reminder";
}

/** The account's reminders: each on or off, changed in place, and a new one at the bottom. */
function Reminders() {
  const { reminders, put, remove } = useReminders();
  const { data: trees = [] } = useTaskTrees();
  // The reminder being changed, or "new"; null = none.
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-2" data-reminders>
      {reminders.length === 0 && <p className="text-xs text-stone-500">No reminders yet.</p>}
      {reminders.map((reminder) => {
        const task = reminder.taskId ? findTask(trees, reminder.taskId)?.node : undefined;
        if (editing === reminder.id) {
          return (
            <ReminderEditor
              key={reminder.id}
              value={reminder}
              task={reminder.taskId ? { id: reminder.taskId, title: task ? plainFirstLine(task.title) : "", scheduled: Boolean(task?.repeatEvery) } : undefined}
              onSave={(next) => (put(next), setEditing(null))}
              onCancel={() => setEditing(null)}
              onDelete={() => (remove(reminder.id), setEditing(null))}
            />
          );
        }
        return (
          <div key={reminder.id} className="flex items-start gap-2 text-xs" data-reminder={reminder.id}>
            <PixelCheckbox small checked={reminder.on} onChange={(e) => put({ ...reminder, on: e.target.checked })} aria-label={`${reminderName(reminder, trees)}: on`} />
            <button type="button" className="min-w-0 flex-1 text-left hover:underline" onClick={() => setEditing(reminder.id)} title="Change it">
              <span className="block truncate">
                {reminderName(reminder, trees)}
                {reminder.taskId && <span className="text-stone-500"> · on {reminder.text && task ? plainFirstLine(task.title) : "a task"}</span>}
                {reminder.noteId && <span className="text-stone-500"> · opens {reminder.linkTitle ?? "a note"}</span>}
              </span>
              <span className="block text-stone-500">{reminderSummary(reminder)}</span>
            </button>
          </div>
        );
      })}
      {editing === "new" ? (
        <ReminderEditor onSave={(next) => (put(next), setEditing(null))} onCancel={() => setEditing(null)} />
      ) : (
        <button type="button" className="btn-quiet text-xs underline" onClick={() => setEditing("new")} data-reminder-new>
          + Add reminder
        </button>
      )}
      <p className="text-xs text-stone-500">
        A reminder on a task is made from its ⋯ menu; its notification has Done and Snooze. Times are between {NOTIFY_FROM} and {NOTIFY_TO}, and
        reminders are planned two weeks ahead each time Donegeon is open.
      </p>
    </div>
  );
}

/** Notifications, on the user's Settings: this device's push switch, the deadline notices, Snooze, the reminders. */
export function NotificationSettings() {
  const [settings, save] = useNotifySettings();
  const { deadline } = settings;
  const set = <K extends keyof NotifySettings>(kind: K, value: NotifySettings[K]) => save({ ...settings, [kind]: value });
  const setDeadline = (changes: Partial<NotifySettings["deadline"]>) => set("deadline", { ...deadline, ...changes });

  return (
    <>
      <h3 className="border-t-2 border-stone-300 pt-3 font-pixel text-xs text-stone-500 dark:border-stone-700">Notifications</h3>
      <DeviceSwitch />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-2">
          <PixelCheckbox small checked={deadline.on} onChange={(e) => setDeadline({ on: e.target.checked })} data-notify-deadline />
          Before a hard deadline
        </label>
        at <SavedTime value={deadline.time} onSave={(time) => setDeadline({ time })} label="Deadline notices: at what time" name="notify-deadline-time" />
      </div>
      {deadline.on && (
        <Indented>
          <label className="flex items-center gap-2">
            <PixelCheckbox small checked={deadline.dayBefore} onChange={(e) => setDeadline({ dayBefore: e.target.checked })} data-notify-day-before />
            A day before
          </label>
          <div className="flex items-center gap-2">
            <PixelCheckbox small checked={deadline.days.on} onChange={(e) => setDeadline({ days: { ...deadline.days, on: e.target.checked } })} aria-label="Some days before" data-notify-days-before />
            <AmountField value={deadline.days.amount} bounds={DAYS_BEFORE} onSave={(amount) => setDeadline({ days: { on: true, amount } })} label="How many days before" name="days-amount" />
            days before
          </div>
          <div className="flex items-center gap-2">
            <PixelCheckbox small checked={deadline.weeks.on} onChange={(e) => setDeadline({ weeks: { ...deadline.weeks, on: e.target.checked } })} aria-label="Some weeks before" data-notify-weeks-before />
            <AmountField value={deadline.weeks.amount} bounds={WEEKS_BEFORE} onSave={(amount) => setDeadline({ weeks: { on: true, amount } })} label="How many weeks before" name="weeks-amount" />
            {deadline.weeks.amount === 1 ? "week" : "weeks"} before
          </div>
        </Indented>
      )}
      <p className="text-xs text-stone-500">{deadline.on ? "What is left of it, and when it is due." : "No notice before a hard deadline."}</p>
      <label className="flex items-center gap-2 text-xs">
        <PixelCheckbox small checked={settings.passed.on} onChange={(e) => set("passed", { on: e.target.checked })} data-notify-passed />
        Deadline passed
      </label>
      <p className="text-xs text-stone-500">{`The day after a hard deadline's day, at ${deadline.time}, if it isn't done: a tap picks a new day for it.`}</p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        Snooze for
        <AmountField value={settings.snoozeMinutes} bounds={SNOOZE} onSave={(snoozeMinutes) => set("snoozeMinutes", snoozeMinutes)} label="Snooze for how many minutes" name="snooze" width="w-12" />
        minutes
      </div>
      <h4 className="pt-1 text-xs font-medium">Reminders</h4>
      <Reminders />
    </>
  );
}
