import { useEffect, useMemo, useRef } from "react";
import { localDate } from "../../api/client";
import { useTickedTasks } from "../../hooks/useAuth";
import { useLists, useStatRows, useTaskTrees } from "../../hooks/useTasks";
import { doneByDay, planByDay, type DoneItem, type PlanItem } from "../../lib/calendar";

/** The calendar's boxes, by the name a folder's view ("cal:<name>") knows them by. */
export const CAL_BOXES: Record<string, string> = {
  days: "Days",
  month: "Calendar",
};

/** What a click on a task opens the details of: something to do on a day, or something done on one. */
export type Info = { plan: PlanItem; day: string } | { done: DoneItem; day: string };

/** Whether something on a day is still to be done on it: not ticked, and not a round of a schedule that isn't due yet. */
export const isOpen = (item: PlanItem) => !item.node.isComplete && item.kind !== "round" && item.kind !== "next";

const PICK_DAY_EVENT = "donegeon:calendar-day";
/** Tells every calendar box on the page that a day was picked: the boxes follow each other wherever they are. */
export const pickDay = (day: string) => window.dispatchEvent(new CustomEvent(PICK_DAY_EVENT, { detail: day }));
/** Calls `onPick` with every day picked in any calendar box on the page, this one too. */
export function useDayPicked(onPick: (day: string) => void) {
  const latest = useRef(onPick);
  latest.current = onPick;
  useEffect(() => {
    const onEvent = (e: Event) => latest.current((e as CustomEvent<string>).detail);
    window.addEventListener(PICK_DAY_EVENT, onEvent);
    return () => window.removeEventListener(PICK_DAY_EVENT, onEvent);
  }, []);
}

/**
 * What the calendar's boxes show: what there is to do on each day from today to `until`, and what was done on
 * each day gone by. Ticked tasks are left out where the user chose to have them out of sight.
 */
export function useCalendar(until: string) {
  const tasks = useTaskTrees();
  const lists = useLists();
  const stats = useStatRows();
  const ticked = useTickedTasks();
  const today = localDate();
  const plan = useMemo(() => {
    const days = planByDay(tasks.data ?? [], today, until);
    if (ticked === "hide") for (const [day, items] of days) days.set(day, items.filter((item) => !item.node.isComplete));
    return days;
  }, [tasks.data, today, until, ticked]);
  const done = useMemo(() => doneByDay(stats.data ?? []), [stats.data]);
  return {
    today,
    trees: tasks.data,
    lists: lists.data,
    isLoaded: Boolean(tasks.data && lists.data),
    error: tasks.error ?? lists.error,
    doneError: stats.error,
    planOn: (day: string): PlanItem[] => plan.get(day) ?? [],
    doneOn: (day: string): DoneItem[] => (day < today ? (done.get(day) ?? []) : []),
  };
}
