// Levels for the character and its skills. One curve for everything, exponential: level 1 to 2 takes 5 exp, and each
// level after takes 40% more than the one before (rounded), so level L to L+1 takes round(5·1.4^(L−1)) exp: 5, 7, 10,
// 14, 19, 27, 38, 53 … Reached at: Lv 2 at 5, 3 at 12, 5 at 36, 10 at 247, 19 at 5325, 20 at 7459, 30 at 216071, 40 at
// 6250324. Slow and hard on purpose (the user's call, 2026-10-22, was 15%): the far ranks are out of reach. One exp is
// one task done (or one mail sent to the devs, for the character).

const FIRST = 5;
const GROWTH = 1.4;

/** The exp level `level` takes to get through, to the next. */
export const spanOf = (level: number) => Math.round(FIRST * GROWTH ** (Math.max(1, level) - 1));

/** The exp at which level `level` is reached. */
export function expFor(level: number) {
  let exp = 0;
  for (let l = 1; l < level; l++) exp += spanOf(l);
  return exp;
}

/** The level for an amount of exp, how far into it the exp is, and how much the whole level takes. */
export function levelOf(exp: number): { level: number; into: number; span: number } {
  let into = Math.max(0, Math.floor(exp));
  let level = 1;
  // The levels grow by 40% each, so this is a few dozen steps at most.
  while (into >= spanOf(level)) into -= spanOf(level++);
  return { level, into, span: spanOf(level) };
}
