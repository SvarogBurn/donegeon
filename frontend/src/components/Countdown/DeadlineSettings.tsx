import { useDeadlineTable } from "../../hooks/useAuth";
import { PER_DAY_CHOICES, type PerDayMode } from "../../lib/deadlineTable";
import { PixelCheckbox } from "../PixelCheckbox";

const PER_DAY_NOTES: Record<PerDayMode, string> = {
  sum: "Each day's Per day adds up what every deadline needs that day.",
  soonest: "Each day's Per day is only what the soonest deadline still open needs: one deadline at a time.",
  columns: "Every deadline gets a column of its own, so you see exactly how many tasks each needs a day.",
};

const FIELD = "border-2 border-stone-300 bg-white px-1 py-1 text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100";

/** The dashboard's deadlines box, on the user's Settings: how Per day is counted, soft deadlines. Its colours are on each task's page (DeadlineColors). */
export function DeadlineSettings() {
  const [table, save] = useDeadlineTable();

  return (
    <>
      <label className="flex flex-wrap items-center gap-2 text-xs">
        Per day
        <select className={`max-w-full ${FIELD}`} value={table.perDay} onChange={(e) => save({ ...table, perDay: e.target.value as PerDayMode })} data-deadline-per-day>
          {PER_DAY_CHOICES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-stone-500">{PER_DAY_NOTES[table.perDay]}</p>
      <label className="flex items-center gap-2 text-xs">
        <PixelCheckbox small checked={table.soft} onChange={(e) => save({ ...table, soft: e.target.checked })} data-deadline-soft />
        Soft deadlines in the box
      </label>
      <p className="text-xs text-stone-500">
        {table.soft ? "Soft deadlines count in the table, as hard ones do." : "Only hard deadlines are in the table."}
      </p>
    </>
  );
}
