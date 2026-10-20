/** A bar of 10 pixel cells (CuteKart's stat bars): a cell for each tenth of the way to `max`, all of them past it. */
export function CellBar({ value, max, label }: { value: number; max: number; label: string }) {
  const filled = max > 0 ? Math.min(10, Math.floor((value / max) * 10)) : 0;
  return (
    <span className="cell-bar" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)} aria-label={label}>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className="cell-bar-cell" data-filled={i < filled || undefined} />
      ))}
    </span>
  );
}

/** How far into its level a character or skill is: a plain pixel bar, "x / y exp" under its right end. */
export function ExpBar({ into, span, label }: { into: number; span: number; label: string }) {
  return (
    <div className="w-full">
      <div className="exp-bar" role="meter" aria-valuemin={0} aria-valuemax={span} aria-valuenow={into} aria-label={label}>
        <div className="exp-bar-fill" style={{ width: `${span > 0 ? (into / span) * 100 : 0}%` }} />
      </div>
      <p className="mt-0.5 text-right text-[10px] text-stone-500 tabular-nums" data-exp>
        {into} / {span} exp
      </p>
    </div>
  );
}
