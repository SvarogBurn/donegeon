import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, NavLink } from "react-router";
import { getDevDate, localDate, setDevDate } from "../../api/client";
import { useLogout } from "../../hooks/useAuth";
import { usePoints } from "../../hooks/useTasks";
import type { User } from "../../types";

/** Dev builds only: pretend today is another day, to test date-driven features. */
function DevDateField() {
  const queryClient = useQueryClient();
  const [override, setOverride] = useState(getDevDate());

  function change(date: string | null) {
    setDevDate(date);
    setOverride(date);
    queryClient.invalidateQueries();
  }

  return (
    <label className="flex items-center gap-1 rounded border border-dashed border-amber-500 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
      Dev date
      <input
        type="date"
        className="bg-transparent"
        value={override ?? localDate()}
        onChange={(e) => change(e.target.value || null)}
      />
      {override && (
        <button type="button" className="underline" onClick={() => change(null)}>
          reset
        </button>
      )}
    </label>
  );
}

const tab = ({ isActive }: { isActive: boolean }) =>
  `rounded px-2 py-1 text-sm ${isActive ? "bg-stone-200 font-medium dark:bg-stone-800" : "text-stone-500 hover:text-stone-900 dark:hover:text-stone-100"}`;

export function NavBar({ user }: { user: User }) {
  const logout = useLogout();
  const { data: points } = usePoints();

  return (
    // Stays at the top of the screen while the page scrolls underneath.
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link to="/" className="text-lg font-bold tracking-tight text-emerald-800 dark:text-emerald-400">
          Donegeon
        </Link>
        <nav className="flex items-center gap-1" aria-label="Pages">
          <NavLink to="/" end className={tab}>
            Tasks
          </NavLink>
          <NavLink to="/done" className={tab}>
            Done
          </NavLink>
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
          {import.meta.env.DEV && <DevDateField />}
          {points && (
            <Link
              to="/points"
              data-nav-balance={points.balance}
              className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-800 tabular-nums dark:bg-emerald-950 dark:text-emerald-300"
              title="Your points: earned minus spent. Click for the history."
            >
              {points.balance} {points.balance === 1 ? "pt" : "pts"}
            </Link>
          )}
          <span className="text-stone-500">{user.username}</span>
          <button type="button" className="btn-quiet" disabled={logout.isPending} onClick={() => logout.mutate()}>
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
