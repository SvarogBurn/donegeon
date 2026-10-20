import { useState } from "react";
import { readStored, writeStored } from "../../lib/storage";
import type { TaskTreeNode } from "../../types";
import { useDrag } from "../TaskTree/TreeContext";
import { TileFrame } from "../Tiles/TileFrame";
import { TodayTab } from "./TodayTab";
import { WeekTab } from "./WeekTab";

type Tab = "today" | "week";
/** The tab last opened, kept on this device. */
const TAB_KEY = "donegeon.todayTab";

const savedTab = (): Tab => (readStored(TAB_KEY) === "week" ? "week" : "today");

/** Today and Week on the box's band. Each also takes a dragged task while the other is open. */
function Tabs({ tab, onPick }: { tab: Tab; onPick: (tab: Tab) => void }) {
  const dropKind = useDrag((state) => state.dropTarget?.kind);
  const tabs: [Tab, string][] = [
    ["today", "Today"],
    ["week", "Week"],
  ];
  return (
    <span role="tablist" className="band-tabs">
      {tabs.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="tab"
          className="band-tab"
          aria-selected={tab === key}
          onClick={() => onPick(key)}
          {...{ [key === "today" ? "data-drop-today" : "data-drop-week"]: "" }}
          data-drop={tab !== key && dropKind === key ? "" : undefined}
        >
          {label}
        </button>
      ))}
    </span>
  );
}

/**
 * The day's and the week's working sets, as two tabs of one box. Tasks dragged here, or marked "Do today" /
 * "Do this week" in their ⋯ menu, are only shown here: they live in one of the lists below. Tasks typed
 * into the field at the bottom live here alone, until they are dragged to a list.
 */
export function TodayBox({ tasks }: { tasks: TaskTreeNode[] }) {
  const [tab, setTab] = useState<Tab>(savedTab);
  const isDropTarget = useDrag((state) => state.dropTarget?.kind === tab);

  function pick(next: Tab) {
    setTab(next);
    writeStored(TAB_KEY, next);
  }

  const dropProps = tab === "today" ? { "data-drop-today": "" } : { "data-drop-week": "" };
  return (
    <TileFrame
      title={<Tabs tab={tab} onPick={pick} />}
      {...dropProps}
      data-tab={tab}
      className={isDropTarget ? "ring-2 ring-emerald-600" : ""}
      aria-label="Today"
    >
      {tab === "today" ? <TodayTab tasks={tasks} /> : <WeekTab tasks={tasks} />}
    </TileFrame>
  );
}
