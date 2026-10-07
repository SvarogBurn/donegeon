import { TileFrame } from "../components/Tiles/TileFrame";
import { useMe } from "../hooks/useAuth";
import { usePoints } from "../hooks/useTasks";
import { formatAmount } from "../lib/points";
import type { PointsSummary } from "../types";

const WHAT: Record<PointsSummary["transactions"][number]["type"], string> = {
  earned: "Earned",
  redeemed: "Spent",
  reversal: "Taken back",
};

function when(createdAt: string) {
  const date = new Date(createdAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${String(date.getFullYear()).slice(2)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The balance and everything that led to it: points earned, spent on rewards, and taken back by an untick or undo. */
export function PointsPage() {
  const points = usePoints();
  const cap = useMe().user?.pointsCap ?? null;
  if (points.error) return <p className="text-sm text-red-600">Couldn't load your points: {points.error.message}</p>;
  if (!points.data) return <p className="text-sm text-stone-500">Loading…</p>;
  const { balance, transactions } = points.data;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <TileFrame title="Balance" aria-label="Balance">
        <p>
        <span className="text-3xl font-bold tabular-nums" data-balance={balance}>
          {balance}
        </span>{" "}
        <span className="text-sm text-stone-500">{balance === 1 ? "point" : "points"} to spend{cap !== null && `, of ${cap} at most`}</span>
        </p>
      </TileFrame>
      <TileFrame title="History" aria-label="History">
        {transactions.length === 0 ? (
          <p className="text-sm text-stone-500">Nothing yet. Tick a main task in a task list to earn its points.</p>
        ) : (
          // One line per row on a wide screen: when, what for, what happened, how much. A phone has no
          // room for that: there the title and the amount share a line, with when and what happened under them.
          <ul className="text-sm">
            {transactions.map((row) => (
              <li
                key={row.id}
                data-history-row
                className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 border-t border-stone-200 py-1 first:border-t-0 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] dark:border-stone-800"
              >
                <span className="text-xs whitespace-nowrap text-stone-500 tabular-nums max-sm:order-3 sm:text-sm">{when(row.createdAt)}</span>
                <span className="break-words max-sm:order-1">{row.title.split("\n")[0]}</span>
                <span className="text-xs whitespace-nowrap text-stone-500 max-sm:order-4 max-sm:text-right sm:text-sm">{WHAT[row.type]}</span>
                <span
                  className={`text-right font-medium whitespace-nowrap tabular-nums max-sm:order-2 ${row.amount < 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}`}
                >
                  {formatAmount(row.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </TileFrame>
    </div>
  );
}
