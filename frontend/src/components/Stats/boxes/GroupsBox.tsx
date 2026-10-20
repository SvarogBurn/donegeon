import { useState, type CSSProperties } from "react";
import type { GroupKey } from "../../../lib/stats";
import { groupItems, groupTable, shareBars } from "../../../lib/statsView";
import { Empty, Note, ShareBars } from "../charts";
import { Choices, days, StatFrame, type StatBox } from "./common";

const GROUPS: [GroupKey, string, none: string][] = [
  ["list", "Lists", "Today only"],
  ["goal", "Goals", "No goal"],
  ["tag", "Tags", "No tag"],
];

/** What got done per list, goal or tag: how much, what is open, deadlines met, time to done, and the share over time. */
export const GroupsBox: StatBox = ({ stats: { view, lists, goals, tags } }) => {
  const [groupKey, setGroupKey] = useState<GroupKey>("list");
  const [, groupTitle, noneName] = GROUPS.find(([key]) => key === groupKey)!;
  const items = groupItems(groupKey, lists, goals, tags);
  const rows = groupTable(groupKey, view, items, noneName);
  const maxDone = Math.max(1, ...rows.map((row) => row.done));
  const share = shareBars(groupKey, view, items, noneName);
  return (
    <StatFrame title={`By ${groupTitle.toLowerCase().replace(/s$/, "")}`} color="#d95f8c"
      // The first list, goal or tag in the share bars takes the box's colour; the pink further down the row of colours becomes the blue it replaced.
      style={{ "--series-1": "var(--chart)", "--series-5": "#2a78d6" } as CSSProperties}
      aria-label="By list, goal or tag"
    >
      <Choices choices={GROUPS.map(([key, label]) => [key, label])} value={groupKey} onPick={setGroupKey} />
      {rows.length === 0 ? (
        <Empty>No {groupTitle.toLowerCase()} yet.</Empty>
      ) : (
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-stone-500">
              <th className="pr-2 text-left font-normal" />
              <th className="w-full pr-2 text-left font-normal">Done</th>
              <th className="pr-2 text-right font-normal">Open</th>
              <th className="pr-2 text-right font-normal whitespace-nowrap">On time</th>
              <th className="text-right font-normal whitespace-nowrap">To done</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} data-group={row.name}>
                <td className="max-w-32 truncate py-0.5 pr-2 sm:max-w-48">{row.name}</td>
                <td className="py-0.5 pr-2">
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 min-w-0 flex-1" style={{ backgroundColor: "var(--chart-track)" }}>
                      <span className="block h-full" style={{ width: `${(row.done / maxDone) * 100}%`, backgroundColor: "var(--chart)" }} />
                    </span>
                    <span data-group-done>{row.done}</span>
                  </span>
                </td>
                <td className="py-0.5 pr-2 text-right" data-group-open>
                  {row.open}
                </td>
                <td className="py-0.5 pr-2 text-right" data-group-on-time>
                  {row.due ? `${row.onTime}/${row.due}` : "-"}
                </td>
                <td className="py-0.5 text-right whitespace-nowrap">{days(row.median)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {view.doneInRange.length > 0 && (
        <>
          <p className="text-xs text-stone-500">Share of what was done, per {share.unit}</p>
          <ShareBars periods={share.periods} legend={share.legend} />
        </>
      )}
      <Note>
        Open: tasks and subtasks still to do, whatever the dates. On time: deadlines met, out of those met or missed in these
        dates. To done: median days from written down to done. The numbers beside the share bars count each thing done once, though
        it shows under every goal or tag it carries.
      </Note>
    </StatFrame>
  );
};
