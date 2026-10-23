import { useTaskTrees } from "../../hooks/tasks";
import { useDeadlineTable } from "../../hooks/useAuth";
import { DEADLINE_DEFAULTS, deadlineColor, KIND_NAMES } from "../../lib/deadlineTable";
import { findNode } from "../../lib/optimisticToggle";
import { isBigTask } from "../../lib/taskPage";
import type { TaskTreeNode } from "../../types";
import { ColorSwatch } from "../ColorChoices";

// A small square of the colour, as on a list's plate.
const SWATCH = "size-4 cursor-pointer border-2 border-[#222034] bg-(--swatch)";

/**
 * On a task's page, under its deadline: the colour it wears in the deadlines box (its own, or its kind's), and the
 * colour of every deadline of its kind (hard, soft, or big task: a hard deadline with at least two subtasks).
 */
export function DeadlineColors({ node }: { node: TaskTreeNode }) {
  const [table, save] = useDeadlineTable();
  const { data: trees = [] } = useTaskTrees();
  if (!node.deadlineDate) return null;

  const kind = isBigTask(node) ? "big" : node.deadlineType === "soft" ? "soft" : "hard";
  const kindName = KIND_NAMES.find(([k]) => k === kind)![1].toLowerCase();
  const own = table.taskColors[node.id];
  const item = { taskId: node.id, deadlineType: node.deadlineType === "soft" ? ("soft" as const) : ("hard" as const) };

  function setOwn(hex: string | null) {
    // Tasks that are gone lose theirs as well.
    const kept = Object.fromEntries(Object.entries(table.taskColors).filter(([id]) => id !== node.id && findNode(trees, id)));
    save({ ...table, taskColors: hex ? { ...kept, [node.id]: hex } : kept });
  }
  const setKind = (hex: string) => save({ ...table, colors: { ...table.colors, [kind]: hex } });

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" data-deadline-colors>
      <span className="flex items-center gap-1.5">
        <ColorSwatch
          label="Deadline colour"
          title="Pick this deadline's own colour in the deadlines box"
          className={SWATCH}
          align="right"
          current={deadlineColor(item, kind === "big", table)}
          onPick={(hex) => setOwn(hex)}
          reset={own ? { label: "Back to its kind's colour", onReset: () => setOwn(null) } : undefined}
        />
        Its colour
      </span>
      <span className="flex items-center gap-1.5">
        <ColorSwatch
          label={`Colour of every ${kindName} deadline`}
          title={`Pick the colour of every ${kindName} deadline without one of its own`}
          className={SWATCH}
          align="right"
          current={table.colors[kind]}
          onPick={setKind}
          reset={table.colors[kind] !== DEADLINE_DEFAULTS.colors[kind] ? { label: "Back to its own colour", onReset: () => setKind(DEADLINE_DEFAULTS.colors[kind]) } : undefined}
        />
        Every {kindName} deadline
      </span>
    </div>
  );
}
