import { plainFirstLine } from "../../lib/markup";
import type { TaskTreeNode } from "../../types";
import { PixelCheckbox } from "../PixelCheckbox";
import { useTree } from "./TreeContext";

/**
 * A task's own control, wherever its row is (a list, Today and Week, a day of the calendar): the checkbox, the ↻
 * "done it" button of a task done again and again, or ↻ greyed for a round still ahead, with nothing to press yet.
 * Ticks and presses go through the tree (once per click, see useBusyGuard); a task is ticked last, after
 * everything beneath it.
 */
export function TickOrPress({
  node,
  control = node.isPersistent ? "press" : "tick",
  className = "",
  title,
}: {
  node: TaskTreeNode;
  control?: "tick" | "press" | "ahead";
  className?: string;
  /** What the button or the greyed ↻ says on hover. */
  title?: string;
}) {
  const tree = useTree();
  const name = plainFirstLine(node.title);
  if (control === "ahead") {
    return (
      <span className={`glyph w-5 flex-none text-center text-stone-500 ${className}`} title={title} aria-hidden>
        ↻
      </span>
    );
  }
  if (control === "press") {
    return (
      <button
        type="button"
        className={`repeat-button ${className}`}
        onClick={() => tree.pressTask(node)}
        disabled={tree.isBusy(node.id)}
        aria-label={`Done "${name}" once more`}
        title={title}
      />
    );
  }
  const hasOpenSubtasks = !node.isComplete && node.descendantDoneCount < node.descendantCount;
  return (
    <PixelCheckbox
      className={`${className} ${hasOpenSubtasks ? "opacity-40" : ""}`}
      checked={node.isComplete}
      disabled={tree.isBusy(node.id) || hasOpenSubtasks}
      title={hasOpenSubtasks ? "Tick its subtasks first" : undefined}
      // Ticking a main task finishes it: it is in the Done page, and leaves its list 24 hours later. With an undo,
      // as for any task that leaves its list the moment it is ticked.
      onChange={() => tree.tick(node)}
      aria-label={`Mark "${name}" ${node.isComplete ? "not done" : "done"}`}
    />
  );
}
