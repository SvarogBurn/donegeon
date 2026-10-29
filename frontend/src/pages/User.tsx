import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router";
import { FeedbackBox } from "../components/Feedback/FeedbackBox";
import { FeedbackInbox } from "../components/Feedback/FeedbackInbox";
import { NewsStand } from "../components/News/NewsStand";
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
import { useDropOnTab, useFolders } from "../hooks/folders";
import { useLayout, useSaveLayout } from "../hooks/layout";
import { useOnline } from "../lib/offline/online";
import { readStored, writeStored } from "../lib/storage";
import { NeedsConnection } from "../components/NeedsConnection";
import { FONT_CHOICES, FONT_STACKS, textFont } from "../lib/fonts";
import { typedPoints } from "../lib/points";
import { USER_BOX_COLORS } from "../lib/frameTones";
import { USER_BOXES, userView } from "../lib/folders";
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

/** The Settings sections open, kept on this device (a JSON list of their names); all are closed to start with. */
const OPEN_KEY = "donegeon.settingsOpen";

function openSections(): string[] {
  try {
    const names: unknown = JSON.parse(readStored(OPEN_KEY) ?? "[]");
    return Array.isArray(names) ? names.filter((name) => typeof name === "string") : [];
  } catch {
    return [];
  }
}

/** One part of the Settings box: its title a bar that drops its settings down, or folds them away. */
function SettingsSection({ name, title, forceOpen = false, children }: { name: string; title: string; forceOpen?: boolean; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(() => openSections().includes(name));
  const shown = isOpen || forceOpen;
  function toggle() {
    const others = openSections().filter((other) => other !== name);
    writeStored(OPEN_KEY, JSON.stringify(isOpen ? others : [...others, name]));
    setIsOpen(!isOpen);
  }
  return (
    // The first one has no line above it: the box's band is there.
    <div className="space-y-3 border-t-2 border-stone-300 pt-3 first:border-t-0 first:pt-0 dark:border-stone-700" data-settings-section={name}>
      <h3>
        <button
          type="button"
          className="flex w-full items-center gap-2 text-left font-pixel text-sm text-stone-800 hover:text-stone-950 dark:text-stone-100 dark:hover:text-white"
          aria-expanded={shown}
          disabled={forceOpen}
          onClick={toggle}
          data-settings-heading={name}
        >
          {/* The subtasks' arrow: down while open, turned to point right while closed. */}
          <span className="task-arrow" style={shown ? undefined : { transform: "rotate(-90deg)" }} aria-hidden />
          {title}
        </button>
      </h3>
      {shown && children}
    </div>
  );
}

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
          This deletes “{username}” and everything in it: your tasks, lists, folders, goals, tags, points and their history, your stats, the mail you sent and your stories. It can't be undone.
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

/** Every setting of the account's: on the user page, and wherever it was copied (the Tasks page, a folder). */
export function SettingsBox() {
  const { user } = useMe();
  const logout = useLogout();
  const update = useUpdateMe();
  const { profile, save: saveProfile } = useProfile();
  const navigate = useNavigate();
  const online = useOnline();
  const [deleting, setDeleting] = useState(false);
  if (!user) return null;

  return (
    <TileFrame title="Settings" aria-label="Settings" color={USER_BOX_COLORS.settings}>
      <NeedsConnection>
      <SettingsSection name="tasks" title="Tasks">
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
      </SettingsSection>
      {/* The dashboard's deadlines box: its tabs, its Per day, its colours. */}
      <SettingsSection name="deadlines" title="Deadlines box">
        <DeadlineSettings />
      </SettingsSection>
      {/* Which notifications come, and when; and this device's switch. */}
      <SettingsSection name="notifications" title="Notifications">
        <NotificationSettings />
      </SettingsSection>
      {/* The game around the tasks: the points, and the character's news. */}
      <SettingsSection name="gamification" title="Gamification">
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
      </SettingsSection>
      {/* How the app looks, and which tabs it has. Open while the tutorial runs: it points at the Notes tab's switch. */}
      <SettingsSection name="design" title="Theme and design" forceOpen={!user.tutorialSeen}>
      <label className="flex items-center gap-2 text-xs">
        <PixelCheckbox small checked={user.notesTab} onChange={(e) => update.mutate({ notesTab: e.target.checked })} data-notes-tab />
        Notes tab
      </label>
      <p className="text-xs text-stone-500">
        {user.notesTab
          ? "A Notes tab for notes of their own, on no task, with folders of their own."
          : "No Notes tab. A task can still have its note."}
      </p>
      <label className="flex items-center gap-2 text-xs">
        <PixelCheckbox small checked={user.newsTab ?? true} onChange={(e) => update.mutate({ newsTab: e.target.checked })} data-news-tab />
        News tab
      </label>
      <p className="text-xs text-stone-500">
        {(user.newsTab ?? true)
          ? "A News tab: what's new in Donegeon, the devs' other projects and the story events."
          : "No News tab. The paper is still in the News box on this page."}
      </p>
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
      </SettingsSection>
      {/* Leaving the account, last. */}
      <SettingsSection name="account" title="Account">
      <button type="button" className="nes-btn btn" disabled={logout.isPending || !online} title={online ? undefined : "Needs a connection"} onClick={() => logout.mutate()}>
        Log out
      </button>
      {logout.error && <p className="text-xs text-red-600">{logout.error.message}</p>}
      <button type="button" className="nes-btn is-error btn" data-delete-account-open disabled={!online} onClick={() => setDeleting(true)}>
        Delete account
      </button>
      {deleting && <DeleteAccount username={user.username} onCancel={() => setDeleting(false)} />}
      </SettingsSection>
      {/* Under every section, so it shows whichever is open. */}
      {update.error && <p className="text-xs text-red-600">{update.error.message}</p>}
      </NeedsConnection>
    </TileFrame>
  );
}

/** A box of the user page, by its name in USER_BOXES: there, and wherever it was copied (the Tasks page, a folder). */
export function UserBox({ name }: { name: string }) {
  const { user } = useMe();
  if (!user) return null;
  if (name === "character") return <CharacterSheet />;
  if (name === "news") return <NewsStand />;
  if (name === "settings") return <SettingsBox />;
  if (name === "cheatsheet") return <Cheatsheet />;
  if (name === "feedback") return <FeedbackBox username={user.username} />;
  // The devs' only: anyone else's copy shows nothing.
  if (name === "inbox" && user.isDev) return <FeedbackInbox />;
  return null;
}

/**
 * The user's own page, opened from their icon in the task bar: their character, their settings (logging out and
 * deleting the account at the bottom of them), the way to the News page, mail to the devs and the cheat sheet.
 * Its boxes are one column; each is dragged by its tab button onto another, to take its place, or onto a tab of the
 * task bar (Tasks, a folder) to be shown there too, and can be minimized into the Hidden row at the bottom (kept with the account).
 */
export function UserPage() {
  const { user } = useMe();
  const { hash } = useLocation();
  const layout = useLayout("user");
  const saveLayout = useSaveLayout("user");
  const { data: folders = [] } = useFolders();
  const drop = useDropOnTab();
  const [note, setNote] = useState<string | null>(null);
  // One column whatever the screen, so its arrangement is only an order: kept as the layout's one column, as the Calendar page's.
  // Dropped on the Tasks tab or a folder's, a box is shown there too (a copy), as the Calendar page's boxes are.
  const startDrag = useTabDrag(
    (key, tab) => {
      drop.dropOnTab(userView(key), tab);
      const folder = folders.find((other) => other.id === tab);
      setNote(tab === "main" ? `“${USER_BOXES[key]}” is now shown on the Tasks page too.` : folder ? `“${USER_BOXES[key]}” is now shown in “${folder.name}” too.` : null);
    },
    (key, onto, after) => {
      const next = order.filter((other) => other !== key);
      next.splice(next.indexOf(onto) + (after ? 1 : 0), 0, key);
      if (next.join() !== order.join()) saveLayout.mutate({ ...saved, byColumns: { wide: [next] } });
      setNote(null);
    },
  );
  // The layout is waited for, so a minimized box doesn't show for a moment.
  if (!user || layout.isLoading) return null;

  const saved = normalizeLayout(layout.data);
  // The tutorial points at these boxes, and the "All shortcuts" link at the cheat sheet: those show even when minimized.
  const isHidden = (key: string) => user.tutorialSeen && !(key === "cheatsheet" && hash === "#shortcuts") && (saved.hidden ?? []).includes(key);

  // Their names are the buttons' labels and the Hidden row's.
  // The Inbox is the devs' only.
  const defaults = Object.entries(USER_BOXES)
    .filter(([key]) => key !== "inbox" || user.isDev)
    .map(([key, name]) => ({ key, name, node: <UserBox name={key} /> }));
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
                dragTitle: "Drag onto another box to change places; or onto a tab of the task bar: Tasks, or a folder, shows this box too",
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
      {note && !drop.error && (
        <p className="text-center text-sm" role="status" data-user-note>
          {note}
        </p>
      )}
      {saveLayout.error && <p className="text-center text-sm text-red-600">Couldn't save the layout: {saveLayout.error.message}</p>}
      {drop.error && <p className="text-center text-sm text-red-600">Couldn't copy the box: {drop.error.message}</p>}
    </div>
  );
}
