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
  if (points.error) return <p className="text-sm text-red-600">Couldn't load your points: {points.error.message}</p>;
  if (!points.data) return <p className="text-sm text-stone-500">Loading…</p>;
  const { balance, transactions } = points.data;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="card" aria-label="Balance">
        <span className="text-3xl font-bold tabular-nums" data-balance={balance}>
          {balance}
        </span>{" "}
        <span className="text-sm text-stone-500">{balance === 1 ? "point" : "points"} to spend</span>
      </section>
      <section className="card space-y-3" aria-label="History">
        <h2 className="font-semibold">History</h2>
        {transactions.length === 0 ? (
          <p className="text-sm text-stone-500">Nothing yet. Tick a main task in a task list to earn its points.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {transactions.map((row) => (
                <tr key={row.id} className="border-t border-stone-200 first:border-t-0 dark:border-stone-800">
                  <td className="py-1 pr-3 whitespace-nowrap text-stone-500 tabular-nums">{when(row.createdAt)}</td>
                  <td className="w-full py-1 pr-3">{row.title.split("\n")[0]}</td>
                  <td className="py-1 pr-3 whitespace-nowrap text-stone-500">{WHAT[row.type]}</td>
                  <td
                    className={`py-1 text-right font-medium whitespace-nowrap tabular-nums ${row.amount < 0 ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}`}
                  >
                    {formatAmount(row.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
