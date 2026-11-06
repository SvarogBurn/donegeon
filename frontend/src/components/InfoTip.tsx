import type { MouseEvent } from "react";
import { note } from "../lib/refusal";

/**
 * A small * beside a number: a click or tap says what it counts, in a note beside it (2026-11-04, playtest 1: the
 * numbers said nothing of what they were). The words are drafts (Claude).
 */
export function InfoTip({ text, className = "" }: { text: string; className?: string }) {
  const say = (e: MouseEvent<HTMLButtonElement>) => {
    // Inside something clickable (a summary cell that opens its tasks), it only explains.
    e.stopPropagation();
    note(text, e.currentTarget);
  };
  return (
    <button type="button" className={`inline-flex flex-none cursor-help items-center px-0.5 text-xs leading-none text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 ${className}`} aria-label={`What this is: ${text}`} title={text} onClick={say} data-info-tip>
      *
    </button>
  );
}
