import { useEffect, useRef, useState, type CSSProperties } from "react";

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

/**
 * How far into its level a character or skill is: a plain pixel bar, "x / y exp" under its right end. Yellow, or in
 * `color` (a skill's), its shade under it a third darker.
 */
export function ExpBar({ into, span, label, color }: { into: number; span: number; label: string; color?: string }) {
  return (
    <div className="w-full">
      <div className="exp-bar" role="meter" aria-valuemin={0} aria-valuemax={span} aria-valuenow={into} aria-label={label}>
        <div className="exp-bar-fill" style={{ width: `${span > 0 ? (into / span) * 100 : 0}%`, ...(color && ({ "--bar": color, "--bar-edge": `color-mix(in srgb, ${color} 66%, black)` } as CSSProperties)) }} data-bar-color={color} />
      </div>
      <p className="mt-0.5 text-right text-[10px] text-stone-500 tabular-nums" data-exp>
        {into} / {span} exp
      </p>
    </div>
  );
}

// A heart, 7x6 art pixels, and the two pixels of its shine.
const HEART = [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."];
const SHINE = new Set(["1,1", "2,1"]);
const HEART_PIXELS = HEART.flatMap((row, y) => [...row].flatMap((c, x) => (c === "#" ? [{ x, y }] : [])));

/**
 * The character's health: a pixel heart for every 2 hp, red as far as it goes (a half heart is its left half), the rest
 * grey, "x / y hp" under them. `title` says what cost it: on hover, and (a touch screen has no hover) in a small card a
 * tap on "x / y hp" opens; a tap elsewhere or Escape closes it.
 */
export function Hearts({ hp, max, title }: { hp: number; max: number; title?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setIsOpen(false);
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && setIsOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);
  const count = (
    <>
      {hp} / {max} hp
    </>
  );
  return (
    <div ref={ref} className="relative w-full">
      <div className="hearts" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={hp} aria-label="Health" title={title} data-hp={hp}>
        {Array.from({ length: Math.ceil(max / 2) }, (_, i) => {
          const filled = Math.max(0, Math.min(2, hp - 2 * i));
          return (
            <svg key={i} viewBox="0 0 7 6" shapeRendering="crispEdges" className="heart" aria-hidden data-heart={filled}>
              {HEART_PIXELS.map(({ x, y }) => {
                const red = filled === 2 || (filled === 1 && x <= 3);
                return <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} className={red ? (SHINE.has(`${x},${y}`) ? "fill-[#d95763]" : "fill-[#ac3232]") : "fill-stone-400 dark:fill-stone-600"} />;
              })}
            </svg>
          );
        })}
      </div>
      <p className="mt-0.5 text-center text-[10px] text-stone-600 tabular-nums dark:text-stone-400" data-hp-text>
        {title ? (
          <button type="button" className="cursor-pointer" aria-expanded={isOpen} title="What cost it" onClick={() => setIsOpen(!isOpen)} data-hp-hits-button>
            {count}
          </button>
        ) : (
          count
        )}
      </p>
      {isOpen && title && (
        <p className="card absolute inset-x-0 top-full z-20 mt-1 !p-2 text-xs whitespace-pre-line" data-hp-hits>
          {title}
        </p>
      )}
    </div>
  );
}
