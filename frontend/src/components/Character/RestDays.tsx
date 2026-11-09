import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { addDays } from "../../../../shared/dates";
import { restRanges, type RestRange } from "../../../../shared/health";
import { TASKS } from "../../hooks/queryKeys";
import { useMe, useUpdateMe } from "../../hooks/useAuth";
import { localDate } from "../../lib/clock";
import { formatDay } from "../../lib/dates";

/**
 * Saves the rest days: the whole list, of which the server keeps the days gone by as they were (settleRest). The
 * health and the trees are read again, as what a rest day spares changes them.
 */
function useSaveRest() {
  const update = useUpdateMe();
  const queryClient = useQueryClient();
  return (restDays: RestRange[]) => update.mutate({ restDays }, { onSuccess: () => void queryClient.invalidateQueries({ queryKey: TASKS }) });
}

/** The rest days from today on, and whether today is one. */
export function useComingRest() {
  const ranges = restRanges(useMe().user?.restDays);
  const today = localDate();
  const coming = ranges.filter(({ to }) => to >= today);
  return { ranges, coming, today, isResting: coming.some(({ from }) => from <= today) };
}

const rangeText = ({ from, to }: RestRange) => (from === to ? formatDay(from, true) : `${formatDay(from, true)} to ${formatDay(to, true)}`);

/** "Rest today" (or "Resting today", with a way back): the quick one, under the hearts and in the settings. */
export function RestToday() {
  const { ranges, today, isResting } = useComingRest();
  const save = useSaveRest();
  if (isResting) {
    const only = ranges.find(({ from, to }) => from === today && to === today);
    return (
      <p className="text-xs text-sky-700 dark:text-sky-400" data-resting>
        Resting today: nothing missed costs health.{" "}
        {only && (
          <button type="button" className="underline" onClick={() => save(ranges.filter((range) => range !== only))} data-rest-undo>
            Not resting after all
          </button>
        )}
      </p>
    );
  }
  return (
    <button type="button" className="btn-quiet text-xs" title="A day off: nothing missed today costs health, and the streak goes on across it" onClick={() => save([...ranges, { from: today, to: today }])} data-rest-today>
      Rest today
    </button>
  );
}

/** Settings › Gamification › Rest days: a day off now, a rest planned ahead (an exam week, a holiday), and those to come with ×. */
export function RestDaysSettings() {
  const { ranges, coming, today } = useComingRest();
  const save = useSaveRest();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(addDays(today, 6));
  const isValid = from >= today && to >= from;
  return (
    <div className="space-y-2" data-rest-days>
      <p className="text-xs">Rest days</p>
      <p className="text-xs text-stone-500">A day off, a holiday, an exam week: nothing missed on a rest day costs health, rounds on it aren't owed, and the streak goes on across it. Days gone by can't be changed.</p>
      <RestToday />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1">
          From <input type="date" className="input-small !m-0 bg-stone-100 dark:bg-stone-800 dark:text-stone-100" value={from} min={today} onChange={(e) => setFrom(e.target.value)} data-rest-from />
        </label>
        <label className="flex items-center gap-1">
          to <input type="date" className="input-small !m-0 bg-stone-100 dark:bg-stone-800 dark:text-stone-100" value={to} min={from} onChange={(e) => setTo(e.target.value)} data-rest-to />
        </label>
        <button type="button" className="btn-quiet" disabled={!isValid} onClick={() => save([...ranges, { from, to }])} data-rest-add>
          Add
        </button>
      </div>
      {coming.length > 0 && (
        <ul className="space-y-1 text-xs">
          {coming.map((range) => (
            <li key={`${range.from}:${range.to}`} className="flex items-center gap-2" data-rest-range={`${range.from}:${range.to}`}>
              {rangeText(range)}
              <button type="button" className="btn-quiet glyph" aria-label={`Remove the rest ${rangeText(range)}`} onClick={() => save(ranges.filter((one) => one !== range))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
