import { StatsPanel } from "../components/Stats/StatsPanel";
import { TileFrame } from "../components/Tiles/TileFrame";
import { useLogout, useMe, useUpdateMe } from "../hooks/useAuth";
import type { TickedTasks } from "../types";

const TICKED_CHOICES: [TickedTasks, string][] = [
  ["bottom", "Go to the bottom"],
  ["stay", "Stay where they are"],
  ["hide", "Are hidden"],
];

const TICKED_NOTES: Record<TickedTasks, string> = {
  bottom: "A ticked task sits under the open ones of its list (a subtask under the open subtasks of its task) for 24 hours, then is only in the Done tab.",
  stay: "A ticked task keeps its place for 24 hours, then is only in the Done tab.",
  hide: "A ticked task leaves the Tasks tab and your folders at once. It is in the Done tab, where it can be unticked.",
};

/** The user's own page, opened from their icon in the task bar: who is logged in, logging out, their settings and their stats. */
export function UserPage() {
  const { user } = useMe();
  const logout = useLogout();
  const update = useUpdateMe();
  if (!user) return null;

  const boxes = [
    {
      key: "account",
      label: "Account",
      half: true,
      node: (
        <TileFrame title="Account" aria-label="Account">
          <div className="flex items-center gap-3">
            <span className="tab-icon tab-icon-user !size-[42px] flex-none" aria-hidden />
            <p className="min-w-0 text-base break-words" data-username>
              {user.username}
            </p>
          </div>
          <button type="button" className="nes-btn btn" disabled={logout.isPending} onClick={() => logout.mutate()}>
            Log out
          </button>
          {logout.error && <p className="text-xs text-red-600">{logout.error.message}</p>}
        </TileFrame>
      ),
    },
    {
      // Every setting of the account's goes in this box.
      key: "settings",
      label: "Settings",
      half: true,
      node: (
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
          {update.error && <p className="text-xs text-red-600">{update.error.message}</p>}
        </TileFrame>
      ),
    },
  ];

  // Account, the settings, the stats filter and the stats boxes are all tiles of one grid, arranged like the dashboard's.
  return (
    <div className="space-y-4">
      <StatsPanel before={boxes} />
    </div>
  );
}
