import { DaysBox } from "./DaysBox";
import { MonthBox } from "./MonthBox";

/** One box of the calendar, by its name in CAL_BOXES: the Calendar page's own, or a copy on the Tasks page or in a folder. */
export function CalBoxView({ name }: { name: string }) {
  return name === "days" ? <DaysBox /> : <MonthBox />;
}
