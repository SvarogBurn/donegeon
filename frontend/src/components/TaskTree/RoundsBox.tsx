import { currentRound } from "../../../../shared/repeat";
import { daysBetween } from "../../../../shared/dates";
import { useTaskPresses } from "../../hooks/tasks";
import { localDate } from "../../lib/clock";
import { formatDay, localDay } from "../../lib/dates";
import { habitRate } from "../../lib/habits";
import { plainFirstLine } from "../../lib/markup";
import { isDue, repeatLabel } from "../../lib/repeat";
import { calendarWeeks } from "../../lib/stats";
import type { TaskTreeNode } from "../../types";
import { count, percent, StatFrame } from "../Stats/boxes/common";
import { CalendarDots } from "../Stats/charts";

// A year of weeks of dots, as in the Habits box; as many of them as fit.
const CALENDAR_WEEKS = 53;

function Bar({ share }: { share: number }) {
  return (
    <span className="block h-3" style={{ backgroundColor: "var(--chart-track)" }}>
      <span className="block h-full" style={{ width: `${share * 100}%`, backgroundColor: "var(--chart)" }} />
    </span>
  );
}

/** A persistent task's page has this where a big task's has its countdown: its schedule, how far this round is, how well it is kept and a year of its days. */
export function RoundsBox({ node }: { node: TaskTreeNode }) {
  const today = localDate();
  const { data: days = [] } = useTaskPresses(node.id);
  const round = currentRound(node, today);
  const createdOn = node.startDate ?? localDay(new Date(node.createdAt));
  const habit = { every: node.repeatEvery, unit: node.repeatUnit, hidden: node.hideInStats };
  // Further back than the day it was made, so all of its days count, as in the Habits box.
  const rate = habitRate({ habit, createdOn }, days, today, daysBetween(createdOn, today) + 2);
  const share = rate && rate.done / rate.expected;
  const byDay = new Map<string, number>();
  for (const day of days) byDay.set(day, (byDay.get(day) ?? 0) + 1);

  return (
    <StatFrame title="Rounds" color="#4a86c8" aria-label="Rounds" className="min-w-0">
      <div className="space-y-3 text-xs tabular-nums" data-rounds-box>
        <div className="flex items-baseline justify-between gap-2">
          <span>{round ? `Repeats ${repeatLabel(node)}` : "No schedule: done whenever"}</span>
          {round && <span data-rounds-next>{round.day === today ? "due today" : `${isDue(node, today) ? "due since" : "next"} ${formatDay(round.day)}`}</span>}
        </div>
        {node.descendantCount > 0 && (
          <div className="space-y-1" data-rounds-progress={`${node.descendantDoneCount}/${node.descendantCount}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span>This round</span>
              <span>
                {node.descendantDoneCount}/{node.descendantCount} done
              </span>
            </div>
            <Bar share={node.descendantDoneCount / node.descendantCount} />
          </div>
        )}
        {(node.repeatEvery || days.length > 0) && (
          <div className="space-y-1" data-rounds-kept={share ?? ""}>
            <div className="flex items-baseline justify-between gap-2">
              <span>{node.repeatEvery ? "Kept so far" : "Done"}</span>
              <span>{share !== null ? percent(share) : node.repeatEvery ? "too new" : count(days.length, "time")}</span>
            </div>
            {share !== null && <Bar share={share} />}
          </div>
        )}
        <CalendarDots weeks={calendarWeeks(byDay, today, CALENDAR_WEEKS)} bare label={`${plainFirstLine(node.title)}, done per day over the last year`} />
      </div>
    </StatFrame>
  );
}
