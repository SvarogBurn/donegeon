import type { Task } from "../types";

/** What a divider is called until it is given a title. */
export const DIVIDER_TITLE = "Divider";

/** The title of the divider that was typed ("--- Work"), or null if it isn't one. */
export function typedDivider(text: string): string | null {
  const typed = /^\s*-{3,}(.*)$/s.exec(text);
  return typed ? typed[1].trim() || DIVIDER_TITLE : null;
}

/**
 * The rows of a list with `arrange` applied to each part of it on its own: the rows between two dividers stay
 * between them, so ticked tasks go to the bottom of their part, not of the list.
 */
export function partsOf<T extends Pick<Task, "isDivider">>(rows: T[], arrange: (part: T[]) => T[]): T[] {
  const arranged: T[] = [];
  let part: T[] = [];
  for (const row of rows) {
    if (row.isDivider) {
      arranged.push(...arrange(part), row);
      part = [];
    } else part.push(row);
  }
  return [...arranged, ...arrange(part)];
}
