import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { localDate } from "../api/client";
import { FeedbackBox } from "../components/Feedback/FeedbackBox";
import { FeedbackInbox } from "../components/Feedback/FeedbackInbox";
import { Cheatsheet } from "../components/Help/Cheatsheet";
import { PixelCheckbox } from "../components/PixelCheckbox";
import { TileFrame } from "../components/Tiles/TileFrame";
import { useDeleteAccount, useLogout, useMe, useUpdateMe } from "../hooks/useAuth";
import { useLists, useStatRows } from "../hooks/useTasks";
import { typedPoints } from "../lib/points";
import { collectStats, countByDay, periodCounts, streaks } from "../lib/stats";
import type { TickedTasks } from "../types";

const TICKED_CHOICES: [TickedTasks, string][] = [
  ["bottom", "Go to the bottom"],
  ["stay", "Stay where they are"],
  ["hide", "Are hidden"],
];

const TICKED_NOTES: Record<TickedTasks, string> = {
  bottom: "A ticked task sits under the open ones of its list (a subtask under the open subtasks of its task) for 24 hours, then is only on the Done page.",
  stay: "A ticked task keeps its place for 24 hours, then is only on the Done page.",
  hide: "A ticked task leaves the Tasks tab and your folders at once. It is on the Done page, where it can be unticked.",
};

/** Days in a row with at least one task done and the tasks done this year, as the Stats page counts them with no filter set. Nothing while it loads. */
function Streak() {
  const rows = useStatRows();
  const lists = useLists();
  if (!rows.data || !lists.data) return null;
  const today = localDate();
  const byDay = countByDay(collectStats(rows.data, lists.data).completions);
  const { current, longest } = streaks(byDay, today);
  const { year } = periodCounts(byDay, today);

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p>
          <span className="text-2xl font-bold tabular-nums" data-streak={current}>
            {current}
          </span>{" "}
          <span className="text-sm text-stone-500">day streak</span>
        </p>
        <p>
          <span className="text-2xl font-bold tabular-nums" data-streak-longest={longest}>
            {longest}
          </span>{" "}
          <span className="text-sm text-stone-500">longest</span>
        </p>
        <p>
          <span className="text-2xl font-bold tabular-nums" data-done-year={year}>
            {year}
          </span>{" "}
          <span className="text-sm text-stone-500">done in {today.slice(0, 4)}</span>
        </p>
      </div>
      <p className="text-xs text-stone-500">Do at least one task a day to keep it going.</p>
    </>
  );
}

interface SwitchedAmountProps {
  label: string;
  /** null = switched off. */
  value: number | null;
  /** What it starts at when it is switched on, until the user types their own. */
  first: number;
  onSave: (value: number | null) => void;
  /** What the number is, for a screen reader. */
  amountLabel: string;
  /** The `data-` name of the field; its switch is the same with `-switch`. */
  name: string;
  /** What the setting does, off and on. */
  note: (value: number | null) => string;
}

/** A setting that is off unless the user switches it on, and then is the number they type: the points cap, the break reminder. */
function SwitchedAmount({ label, value, first, onSave, amountLabel, name, note }: SwitchedAmountProps) {
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => setText(value === null ? "" : String(value)), [value]);

  function done() {
    // Nothing typed, or 0, is no amount: back to the saved one.
    const next = Number(text) || value;
    setText(next === null ? "" : String(next));
    if (next !== value) onSave(next);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-2">
          <PixelCheckbox small checked={value !== null} onChange={(e) => onSave(e.target.checked ? first : null)} {...{ [`data-${name}-switch`]: true }} />
          {label}
        </label>
        {value !== null && (
          <input
            className="w-28 border-2 border-stone-300 bg-white px-1 py-1 text-xs text-stone-900 tabular-nums dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            type="text"
            inputMode="numeric"
            // Switching it on goes straight to its amount.
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            value={text}
            onChange={(e) => setText(typedPoints(e.target.value))}
            onBlur={done}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            aria-label={amountLabel}
            {...{ [`data-${name}`]: true }}
          />
        )}
      </div>
      <p className="text-xs text-stone-500">{note(value)}</p>
    </>
  );
}

const capNote = (cap: number | null) =>
  cap === null
    ? "Your points can add up without limit."
    : `A task that would take you past ${cap} ${cap === 1 ? "point" : "points"} can't be ticked or done until you spend some on a reward.`;

const breakNote = (every: number | null) =>
  every === null
    ? "No reminders to take a break."
    : `After every ${every === 1 ? "task" : `${every} tasks`} you do in a day, a popup reminds you to take a break to eat and drink.`;

/**
 * Asks before the account is deleted: the Delete button stays off until the user has typed "donegeon/<username>".
 * Esc or Cancel closes it; a click beside it does not, so a slip can't lose what was typed.
 */
function DeleteAccount({ username, onCancel }: { username: string; onCancel: () => void }) {
  const [typed, setTyped] = useState("");
  const remove = useDeleteAccount();
  const phrase = `donegeon/${username}`;
  const matches = typed.trim().toLowerCase() === phrase;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (matches && !remove.isPending) remove.mutate(typed);
  };

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onKeyDown={(e) => e.key === "Escape" && !remove.isPending && onCancel()}>
      <form onSubmit={submit} className="card w-96 max-w-full space-y-3 text-xs" role="alertdialog" aria-modal="true" aria-label="Delete account" data-delete-account>
        <p className="text-sm text-red-600 dark:text-red-400">Delete your account?</p>
        <p>
          This deletes “{username}” and everything in it: your tasks, lists, folders, goals, tags, points and their history, your stats and the mail you sent. It can't be undone.
        </p>
        <label className="block space-y-1">
          <span>
            To go ahead, type <strong className="break-all select-all">{phrase}</strong>
          </span>
          <input
            className="w-full border-2 border-stone-300 bg-white px-1 py-1 text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            data-delete-account-confirm
          />
        </label>
        {remove.error && <p className="text-red-600">{remove.error.message}</p>}
        <div className="flex justify-end">
          <button type="button" className="nes-btn btn-small" disabled={remove.isPending} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className={`nes-btn btn-small ${matches ? "is-error" : "is-disabled"}`} disabled={!matches || remove.isPending}>
            Delete account
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

/** The user's own page, opened from their icon in the task bar: who is logged in, logging out, and their settings. */
export function UserPage() {
  const { user } = useMe();
  const logout = useLogout();
  const update = useUpdateMe();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <TileFrame title="Account" aria-label="Account">
        <div className="flex items-center gap-3">
          <span className="tab-icon tab-icon-user !size-[42px] flex-none" aria-hidden />
          <p className="min-w-0 text-base break-words" data-username>
            {user.username}
          </p>
        </div>
        <Streak />
        <button type="button" className="nes-btn btn" disabled={logout.isPending} onClick={() => logout.mutate()}>
          Log out
        </button>
        {logout.error && <p className="text-xs text-red-600">{logout.error.message}</p>}
        <button type="button" className="nes-btn is-error btn" data-delete-account-open onClick={() => setDeleting(true)}>
          Delete account
        </button>
        {deleting && <DeleteAccount username={user.username} onCancel={() => setDeleting(false)} />}
      </TileFrame>
      {/* Every setting of the account's goes in this box. */}
      <TileFrame title="Settings" aria-label="Settings">
        <label className="flex flex-wrap items-center gap-2 text-xs">
          Ticked tasks
          <select
            // As wide as its longest choice.
            className="max-w-full border-2 border-stone-300 bg-white px-1 py-1 text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            value={user.tickedTasks}
            onChange={(e) => update.mutate({ tickedTasks: e.target.value as TickedTasks })}
            data-ticked-tasks
          >
            {TICKED_CHOICES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-stone-500">{TICKED_NOTES[user.tickedTasks]}</p>
        <SwitchedAmount
          label="Points cap"
          value={user.pointsCap}
          first={100}
          onSave={(pointsCap) => update.mutate({ pointsCap })}
          amountLabel="The most points you can hold"
          name="points-cap"
          note={capNote}
        />
        <SwitchedAmount
          label="Break reminder"
          value={user.breakEvery}
          first={5}
          onSave={(breakEvery) => update.mutate({ breakEvery })}
          amountLabel="Remind me after every so many tasks"
          name="break-every"
          note={breakNote}
        />
        {/* How the app looks. */}
        <h3 className="border-t-2 border-stone-300 pt-3 font-pixel text-xs text-stone-500 dark:border-stone-700">Theme</h3>
        <label className="flex items-center gap-2 text-xs">
          <PixelCheckbox small checked={user.plainFont} onChange={(e) => update.mutate({ plainFont: e.target.checked })} data-plain-font />
          Plain font in boxes
        </label>
        <p className="text-xs text-stone-500">
          {user.plainFont
            ? "The text inside the boxes (tasks, goals, these settings, ...) is in an ordinary font. Titles keep the pixel font."
            : "Everything is written in the pixel font."}
        </p>
        {/* The tutorial shows while the account has not seen it: this says it hasn't, and goes where it starts. */}
        <button
          type="button"
          className="nes-btn btn"
          data-start-tutorial
          onClick={() => {
            update.mutate({ tutorialSeen: false });
            navigate("/");
          }}
        >
          Repeat the tutorial
        </button>
        {update.error && <p className="text-xs text-red-600">{update.error.message}</p>}
      </TileFrame>
      <FeedbackBox username={user.username} />
      <Cheatsheet />
      {user.isDev && <FeedbackInbox />}
    </div>
  );
}
