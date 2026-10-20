// Levels for the character and its skills. One curve for everything: level L to L+1 takes 5·L exp, so level L is
// reached at 5·L(L−1)/2 exp: Lv 2 at 5, 3 at 15, 5 at 50, 10 at 225, 20 at 950, 30 at 2175. One exp is one task done.

/** The exp at which level `level` is reached. */
export const expFor = (level: number) => (5 * level * (level - 1)) / 2;

/** The level for an amount of exp, how far into it the exp is, and how much the whole level takes. */
export function levelOf(exp: number): { level: number; into: number; span: number } {
  const xp = Math.max(0, Math.floor(exp));
  // The largest L with 5·L(L−1)/2 ≤ xp, from the quadratic, then nudged for rounding.
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (8 * xp) / 5)) / 2));
  while (expFor(level + 1) <= xp) level++;
  while (level > 1 && expFor(level) > xp) level--;
  return { level, into: xp - expFor(level), span: 5 * level };
}
