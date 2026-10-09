import { isRecent } from "../../lib/recent";
import type { TaskTreeNode } from "../../types";
import { PixelCheckbox } from "../PixelCheckbox";
import { useTree } from "./TreeContext";
import { RichText } from "../RichText";
import { plainTitle } from "../../lib/markup";

/**
 * Under a persistent task: a ticked, crossed-off copy of it for every time it
 * was done in the last 24 hours, newest first. Unticking a copy takes that one
 * back (points included); after 24 hours the copy is gone and only the Done box has it.
 */
export function PressCopies({ node, className = "" }: { node: TaskTreeNode; className?: string }) {
  const tree = useTree();
  if (!node.isPersistent || node.parentId) return null;
  // Hidden like any ticked task, if the user chose that; a task's own page still shows everything.
  if (tree.ticked === "hide" && tree.rootId === null) return null;
  const recent = node.completions.filter((press) => isRecent(press.day, press.createdAt)).reverse();
  if (recent.length === 0) return null;
  const title = node.title.split("\n")[0];

  return (
    <ul className={className} aria-label={`Times "${plainTitle(title)}" was done in the last 24 hours`}>
      {recent.map((press) => (
        <li key={press.id} data-press-copy={press.id} className="flex items-center gap-x-1.5 px-1 py-0.5">
          <PixelCheckbox
            checked
            onChange={() => tree.takeBackPress(node, press.id)}
            aria-label={`Take back "${plainTitle(title)}": not done after all`}
            title="Done. Untick within 24 hours to take it back"
          />
          <span className="min-w-0 truncate text-stone-400 line-through"><RichText text={title} /></span>
        </li>
      ))}
    </ul>
  );
}
