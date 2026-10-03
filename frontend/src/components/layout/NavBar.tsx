import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { getDevDate, localDate, setDevDate } from "../../api/client";
import { useLogout } from "../../hooks/useAuth";
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

export function NavBar({ user }: { user: User }) {
  const logout = useLogout();

  return (
    <header className="border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link to="/" className="text-lg font-bold tracking-tight text-emerald-800 dark:text-emerald-400">
          Donegeon
        </Link>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-sm">
          {import.meta.env.DEV && <DevDateField />}
          <span className="text-stone-500">{user.username}</span>
          <button type="button" className="btn-quiet" disabled={logout.isPending} onClick={() => logout.mutate()}>
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
