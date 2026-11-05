import { useState } from "react";
import { localDate } from "../../lib/clock";
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
 * Three or more are folded into one line, "×5 today ⌄", that opens them (2026-11-04, playtest 1: a habit done
 * often stood over a column of copies).
 */
export function PressCopies({ node, className = "" }: { node: TaskTreeNode; className?: string }) {
  const tree = useTree();
  const [isOpen, setIsOpen] = useState(false);
  if (!node.isPersistent) return null;
  // Hidden like any ticked task, if the user chose that; a task's own page still shows everything.
  if (tree.ticked === "hide" && tree.rootId === null) return null;
  const recent = node.completions.filter((press) => isRecent(press.day, press.createdAt)).reverse();
  if (recent.length === 0) return null;
  const title = node.title.split("\n")[0];
  const today = localDate();
  const counts = [
    [recent.filter((press) => press.day === today).length, "today"],
    [recent.filter((press) => press.day !== today).length, "yesterday"],
  ] as const;
  const folds = recent.length >= 3;

  return (
    <ul className={className} aria-label={`Times "${plainTitle(title)}" was done in the last 24 hours`}>
      {folds && (
        <li className="px-1 py-0.5">
          <button type="button" className="btn-quiet text-xs text-stone-500 dark:text-stone-400" aria-expanded={isOpen} onClick={() => setIsOpen(!isOpen)} data-press-fold>
            {isOpen ? "Hide" : "Show"} the {recent.length} done ({counts.filter(([n]) => n > 0).map(([n, when]) => `${n} ${when}`).join(", ")}) {isOpen ? "▴" : "▾"}
          </button>
        </li>
      )}
      {(!folds || isOpen) && recent.map((press) => (
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
