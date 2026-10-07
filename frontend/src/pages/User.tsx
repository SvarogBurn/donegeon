import { useNavigate } from "react-router";
import { localDate } from "../api/client";
import { FeedbackBox } from "../components/Feedback/FeedbackBox";
import { FeedbackInbox } from "../components/Feedback/FeedbackInbox";
import { TileFrame } from "../components/Tiles/TileFrame";
import { useLogout, useMe, useUpdateMe } from "../hooks/useAuth";
import { useLists, useStatRows } from "../hooks/useTasks";
import { collectStats, countByDay, streaks } from "../lib/stats";
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

/** Days in a row with at least one task done, as the Stats page counts them with no filter set. Nothing while it loads. */
function Streak() {
  const rows = useStatRows();
  const lists = useLists();
  if (!rows.data || !lists.data) return null;
  const { current, longest } = streaks(countByDay(collectStats(rows.data, lists.data).completions), localDate());

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
      </div>
      <p className="text-xs text-stone-500">Do at least one task a day to keep it going.</p>
    </>
  );
}

/** The user's own page, opened from their icon in the task bar: who is logged in, logging out, and their settings. */
export function UserPage() {
  const { user } = useMe();
  const logout = useLogout();
  const update = useUpdateMe();
  const navigate = useNavigate();
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
      {user.isDev && <FeedbackInbox />}
    </div>
  );
}
