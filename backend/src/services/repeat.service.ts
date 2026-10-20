import { mondayOf } from "../../../shared/dates.js";
import { currentRound, type Rounds } from "../../../shared/repeat.js";
import { ancestorsOf } from "./taskTree.service.js";

/** What a row needs for staleRoundTicks: its place in the tree, its tick and, on a persistent task, its schedule. */
interface RoundRow extends Rounds {
  id: string;
  parentId: string | null;
  isPersistent: boolean;
  isComplete: boolean;
  completedOn: string | null;
}

/**
 * The subtasks (any depth) still ticked from a round the Skip rule dropped by `today`. A press unticks a persistent
 * task's subtasks for the next round; a round that was never pressed but dropped (its day is before today's Monday,
 * on planned days without making rounds up: currentRound's `missed`) starts the next one the same way.
 * Ticks from this Monday on are kept: they are for the round now open. A subtask's rounds are those of the nearest
 * persistent task above it.
 */
export function staleRoundTicks(rows: RoundRow[], today: string): string[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const monday = mondayOf(today);
  const roundsOf = (row: RoundRow) => ancestorsOf(byId, row).findLast((above) => above.isPersistent) ?? null;
  // A round dropped by the Skip rule: the round now open is a later one (see currentRound).
  const dropped = (owner: RoundRow | null) => Boolean(owner && currentRound(owner, today)?.missed);
  return rows
    .filter((row) => !row.isPersistent && row.isComplete && row.completedOn && row.completedOn < monday && dropped(roundsOf(row)))
    .map((row) => row.id);
}
