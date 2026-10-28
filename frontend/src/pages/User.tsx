import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router";
import { FeedbackBox } from "../components/Feedback/FeedbackBox";
import { FeedbackInbox } from "../components/Feedback/FeedbackInbox";
import { CharacterSheet } from "../components/Character/CharacterSheet";
import { useProfile } from "../components/Character/useProfile";
import { DeadlineSettings } from "../components/Countdown/DeadlineSettings";
import { NotificationSettings } from "../components/Notifications/NotificationSettings";
import { Cheatsheet } from "../components/Help/Cheatsheet";
import { PixelCheckbox } from "../components/PixelCheckbox";
import { HiddenRow } from "../components/Tiles/HiddenRow";
import { TileControlsContext, TileFrame } from "../components/Tiles/TileFrame";
import { useTabDrag } from "../components/Tiles/useTabDrag";
import { useDeleteAccount, useLogout, useMe, useUpdateMe } from "../hooks/useAuth";
import { useLayout, useSaveLayout } from "../hooks/layout";
import { useOnline } from "../lib/offline/online";
import { NeedsConnection } from "../components/NeedsConnection";
import { FONT_CHOICES, FONT_STACKS, textFont } from "../lib/fonts";
import { typedPoints } from "../lib/points";
import { normalizeLayout, withCollapsed, withHidden } from "../lib/tileLayout";
import type { DeadlineToday, TextFont, TickedTasks } from "../types";

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

/**
 * A font setting's dropdown, and under it what the font is for and the text it covers, written in that font (the
 * pixel one too) so it shows at once how it reads.
 */
function FontChoice({ label, value, onChange, covers, name }: { label: string; value: TextFont; onChange: (font: TextFont) => void; covers: string; name: string }) {
  const choice = FONT_CHOICES.find((font) => font.value === value)!;
  return (
    <>
      <label className="flex flex-wrap items-center gap-2 text-xs">
        {label}
        <select
          className="max-w-full border-2 border-stone-300 bg-white px-1 py-1 text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
          value={value}
          onChange={(e) => onChange(e.target.value as TextFont)}
          data-font-choice={name}
        >
          {FONT_CHOICES.map((font) => (
            <option key={font.value} value={font.value}>
              {font.label}
            </option>
          ))}
        </select>
      </label>
      <p className={`text-xs text-stone-500 ${value === "pixel" ? "font-pixel" : ""}`} style={value === "pixel" ? undefined : { fontFamily: FONT_STACKS[value] }}>
        {choice.note} {covers}
      </p>
    </>
  );
}

const DEADLINE_TODAY_CHOICES: [DeadlineToday, string][] = [
  ["never", "Are not added to Today"],
  ["day", "Come into Today on their day"],
  ["dayBefore", "Come into Today the day before"],
];

const DEADLINE_TODAY_NOTES: Record<DeadlineToday, string> = {
  never: "A task is in Today (or on a day of Week) when you put it there, or when it is on a schedule and due.",
  day: "A task or subtask with a deadline, hard or soft, comes into Today by itself on the day of its deadline, and stays there until it is done. In Week it is on the day of its deadline.",
  dayBefore: "A task or subtask with a deadline, hard or soft, comes into Today by itself the day before its deadline, and stays there until it is done. In Week it is on the day of its deadline.",
};

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
  // Only switching it on goes straight to its amount; opening the page with it on doesn't (on a phone that pops up the keyboard).
  const [isJustSwitched, setIsJustSwitched] = useState(false);

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
          <PixelCheckbox
            small
            checked={value !== null}
            onChange={(e) => {
              setIsJustSwitched(e.target.checked);
              onSave(e.target.checked ? first : null);
            }}
            {...{ [`data-${name}-switch`]: true }}
          />
          {label}
        </label>
        {value !== null && (
          <input
            className="w-28 border-2 border-stone-300 bg-white px-1 py-1 text-xs text-stone-900 tabular-nums dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
            type="text"
            inputMode="numeric"
            autoFocus={isJustSwitched}
            onFocus={(e) => e.currentTarget.select()}
            value={text}
            onChange={(e) => setText(typedPoints(e.target.value))}
            onBlur={done}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            aria-label={amountLabel}
            data-font-choice={name}
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

/**
 * The user's own page, opened from their icon in the task bar: their character, their settings (logging out and
 * deleting the account at the bottom of them), mail to the devs and the cheat sheet.
 * Its boxes are one column; each is dragged by its tab button onto another, to take its place, and can be minimized
 * into the Hidden row at the bottom (both kept with the account).
 */
export function UserPage() {
  const { user } = useMe();
  const logout = useLogout();
  const update = useUpdateMe();
  const { profile, save: saveProfile } = useProfile();
  const navigate = useNavigate();
  const online = useOnline();
  const { hash } = useLocation();
  const layout = useLayout("user");
  const saveLayout = useSaveLayout("user");
  const [deleting, setDeleting] = useState(false);
  // One column whatever the screen, so its arrangement is only an order: kept as the layout's one column, as the Calendar page's.
  const startDrag = useTabDrag(null, (key, onto, after) => {
    const next = order.filter((other) => other !== key);
    next.splice(next.indexOf(onto) + (after ? 1 : 0), 0, key);
    if (next.join() !== order.join()) saveLayout.mutate({ ...saved, byColumns: { wide: [next] } });
  });
  // The layout is waited for, so a minimized box doesn't show for a moment.
  if (!user || layout.isLoading) return null;

  const saved = normalizeLayout(layout.data);
  // The tutorial points at these boxes, and the "All shortcuts" link at the cheat sheet: those show even when minimized.
  const isHidden = (key: string) => user.tutorialSeen && !(key === "cheatsheet" && hash === "#shortcuts") && (saved.hidden ?? []).includes(key);

  // Every setting of the account's goes in this box.
  const settings = (
    <TileFrame title="Settings" aria-label="Settings">
      <NeedsConnection>
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
      <label className="flex items-center gap-2 text-xs">
        <PixelCheckbox small checked={user.sortByDeadline} onChange={(e) => update.mutate({ sortByDeadline: e.target.checked })} data-sort-by-deadline />
        Soonest date first
      </label>
      <p className="text-xs text-stone-500">
        {user.sortByDeadline
          ? "In a list, the task with the nearest date (its deadline, or the next day of its schedule) is at the top; tasks without a date are under them, in your own order. Subtasks within their task too."
          : "Tasks are in the order you put them in."}
      </p>
      <label className="flex flex-wrap items-center gap-2 text-xs">
        Tasks with a deadline
        <select
          className="max-w-full border-2 border-stone-300 bg-white px-1 py-1 text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
          value={user.deadlineToday}
          onChange={(e) => update.mutate({ deadlineToday: e.target.value as DeadlineToday })}
          data-deadline-today
        >
          {DEADLINE_TODAY_CHOICES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-stone-500">{DEADLINE_TODAY_NOTES[user.deadlineToday]}</p>
      <SwitchedAmount
        label="Break reminder"
        value={user.breakEvery}
        first={5}
        onSave={(breakEvery) => update.mutate({ breakEvery })}
        amountLabel="Remind me after every so many tasks"
        name="break-every"
        note={breakNote}
      />
      <label className="flex items-center gap-2 text-xs">
        <PixelCheckbox small checked={user.notesTab} onChange={(e) => update.mutate({ notesTab: e.target.checked })} data-notes-tab />
        Notes tab
      </label>
      <p className="text-xs text-stone-500">
        {user.notesTab
          ? "A Notes tab for notes of their own, on no task, with folders of their own."
          : "No Notes tab. A task can still have its note."}
      </p>
      {/* The dashboard's deadlines box: its tabs, its Per day, its colours. */}
      <DeadlineSettings />
      {/* Which notifications come, and when; and this device's switch. */}
      <NotificationSettings />
      {/* The game around the tasks: the points, and the character's news. */}
      <h3 className="border-t-2 border-stone-300 pt-3 font-pixel text-xs text-stone-500 dark:border-stone-700">Gamification</h3>
      <label className="flex items-center gap-2 text-xs">
        <PixelCheckbox small checked={!user.pointsOff} onChange={(e) => update.mutate({ pointsOff: !e.target.checked })} data-points-system />
        Points
      </label>
      <p className="text-xs text-stone-500">
        {user.pointsOff
          ? "No points: tasks earn nothing, rewards cost nothing and nothing is capped. Your balance waits as it was for when you switch them back on."
          : "Tasks earn points and rewards cost them. Your balance is in the task bar."}
      </p>
      {!user.pointsOff && (
        <SwitchedAmount
          label="Points cap"
          value={user.pointsCap}
          first={100}
          onSave={(pointsCap) => update.mutate({ pointsCap })}
          amountLabel="The most points you can hold"
          name="points-cap"
          note={capNote}
        />
      )}
      <label className="flex items-center gap-2 text-xs">
        <PixelCheckbox small checked={!profile.hideDot} onChange={(e) => saveProfile({ ...profile, hideDot: !e.target.checked || undefined })} data-character-dot />
        New things dot
      </label>
      <p className="text-xs text-stone-500">A red dot on your face in the task bar when the character has earned something new.</p>
      <label className="flex items-center gap-2 text-xs">
        <PixelCheckbox small checked={!profile.hideNews} onChange={(e) => saveProfile({ ...profile, hideNews: !e.target.checked || undefined })} data-character-news />
        Unlocks and news on the character
      </label>
      <p className="text-xs text-stone-500">The LEVEL UP box with what was unlocked, and the editor's Next up box with what's next. Off also hides the red dot.</p>
      {/* How the app looks. */}
      <h3 className="border-t-2 border-stone-300 pt-3 font-pixel text-xs text-stone-500 dark:border-stone-700">Theme</h3>
      <FontChoice
        label="Font in boxes"
        value={textFont(user.boxFont)}
        onChange={(boxFont) => update.mutate({ boxFont })}
        covers="The text inside the boxes (tasks, their notes, goals, these settings, ...). Titles keep the pixel font."
        name="box-font"
      />
      <FontChoice
        label="Font in notes"
        value={textFont(user.notesFont)}
        onChange={(notesFont) => update.mutate({ notesFont })}
        covers="The notes on the Notes page, their titles too."
        name="notes-font"
      />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-2">
          <PixelCheckbox small checked={user.boxColorEdit} onChange={(e) => update.mutate({ boxColorEdit: e.target.checked })} data-box-color-edit />
          Allow changing box colours
        </label>
        {/* Every built-in box back to its own colour; the lists keep theirs. Small and quiet: it is seldom wanted. */}
        <button
          type="button"
          className="btn-quiet underline"
          data-reset-box-colors
          disabled={Object.keys(user.boxColors ?? {}).length === 0}
          title="Every box back to its own colour (lists keep theirs)"
          onClick={() => update.mutate({ boxColors: null })}
        >
          Reset to default
        </button>
      </div>
      <p className="text-xs text-stone-500">
        {user.boxColorEdit
          ? "Every box but the task and reward lists has a colour button on its band, left of the pin. Lists have theirs on their plate."
          : "No colour buttons on the boxes. The colours picked stay."}
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
      {/* Leaving the account, last. */}
      <h3 className="border-t-2 border-stone-300 pt-3 font-pixel text-xs text-stone-500 dark:border-stone-700">Account</h3>
      <button type="button" className="nes-btn btn" disabled={logout.isPending || !online} title={online ? undefined : "Needs a connection"} onClick={() => logout.mutate()}>
        Log out
      </button>
      {logout.error && <p className="text-xs text-red-600">{logout.error.message}</p>}
      <button type="button" className="nes-btn is-error btn" data-delete-account-open disabled={!online} onClick={() => setDeleting(true)}>
        Delete account
      </button>
      {deleting && <DeleteAccount username={user.username} onCancel={() => setDeleting(false)} />}
      </NeedsConnection>
    </TileFrame>
  );

  // Their names are the buttons' labels and the Hidden row's.
  const defaults: { key: string; name: string; node: ReactNode }[] = [
    { key: "character", name: "Character", node: <CharacterSheet /> },
    { key: "settings", name: "Settings", node: settings },
    { key: "feedback", name: "Send mail to devs", node: <FeedbackBox username={user.username} /> },
    ...(user.isDev ? [{ key: "inbox", name: "Inbox", node: <FeedbackInbox /> }] : []),
    { key: "cheatsheet", name: "Cheat sheet", node: <Cheatsheet /> },
  ];
  // The saved order first; a box it doesn't know yet (new to the page) keeps its default place after the one before it.
  const keys = defaults.map((box) => box.key);
  const savedOrder = (saved.byColumns.wide?.[0] ?? []).filter((key) => keys.includes(key));
  const order = [...savedOrder];
  keys.forEach((key, i) => {
    if (order.includes(key)) return;
    const before = keys.slice(0, i).reverse().find((other) => order.includes(other));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, key);
  });
  const boxes = order.map((key) => defaults.find((box) => box.key === key)!);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {boxes
        .filter((box) => !isHidden(box.key))
        .map((box) => (
          <div
            key={box.key}
            data-box={box.key}
            // The box another is dragged onto: ringed, and thicker on the side the other lands.
            className="outline-emerald-600 data-drop:outline-2 data-[drop=above]:shadow-[0_-4px_0_var(--color-emerald-600)] data-[drop=below]:shadow-[0_4px_0_var(--color-emerald-600)]"
          >
            <TileControlsContext.Provider
              value={{
                name: box.name,
                isPinned: false,
                onDragStart: (e) => startDrag(e, box.key),
                dragTitle: "Drag onto another box to put this one in its place",
                onHide: () => saveLayout.mutate(withHidden(saved, box.key, true)),
                isCollapsed: saved.collapsed?.includes(box.key),
                onToggleCollapse: () => saveLayout.mutate(withCollapsed(saved, box.key, !saved.collapsed?.includes(box.key))),
                colorKey: box.key,
              }}
            >
              {box.node}
            </TileControlsContext.Provider>
          </div>
        ))}
      <HiddenRow
        tiles={boxes.filter((box) => isHidden(box.key)).map((box) => ({ key: box.key, label: box.name }))}
        onShow={(key) => saveLayout.mutate(withHidden(saved, key, false))}
      />
      {saveLayout.error && <p className="text-center text-sm text-red-600">Couldn't save the layout: {saveLayout.error.message}</p>}
    </div>
  );
}
