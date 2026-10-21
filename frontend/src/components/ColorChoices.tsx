import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LIST_COLORS } from "../lib/frameTones";

interface Props {
  /** The colour in use now, "#rrggbb". */
  current: string;
  onPick: (hex: string) => void;
  /** The way back to the colour it has when none is picked ("Back to blue"); left out when that is the one in use. */
  reset?: { label: string; onReset: () => void };
}

/**
 * A few colours to pick from, the browser's own picker for any other, and the
 * way back to the default. Used for a list's box, a built-in box (ColorSwatch) and for a folder's icon.
 */
export function ColorChoices({ current, onPick, reset }: Props) {
  const other = useRef<HTMLInputElement>(null);
  const latestPick = useRef(onPick);
  latestPick.current = onPick;

  // The browser's picker reports every colour passed over; only the one it is closed on is saved.
  useEffect(() => {
    const input = other.current;
    if (!input) return;
    const onChosen = () => latestPick.current(input.value);
    input.addEventListener("change", onChosen);
    return () => input.removeEventListener("change", onChosen);
  }, []);
  // Uncontrolled, so the browser's picker isn't interrupted; it starts from the colour in use.
  useEffect(() => {
    if (other.current) other.current.value = current;
  }, [current]);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-5 gap-1.5">
        {LIST_COLORS.map(([name, hex]) => (
          <button
            key={hex}
            type="button"
            className={`size-6 cursor-pointer border-2 ${current === hex ? "border-stone-900 dark:border-white" : "border-transparent"}`}
            style={{ backgroundColor: hex }}
            aria-label={name}
            aria-pressed={current === hex}
            title={name}
            onClick={() => onPick(hex)}
          />
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs">
        Other
        <input ref={other} type="color" className="h-6 w-10 cursor-pointer" defaultValue={current} aria-label="Any other colour" />
      </label>
      {reset && (
        <button type="button" className="btn-quiet" onClick={reset.onReset}>
          {reset.label}
        </button>
      )}
    </div>
  );
}

interface SwatchProps extends Props {
  /** What the button and its popup are called: "List colour", "Today's colour". */
  label: string;
  title: string;
  /** The button's look, drawn from --swatch (the colour in use): a list's plate has a small square, a box's band a 7x7 button like its others. */
  className: string;
  /** Which edge of the button the popup lines up with: a box's band button sits at the right of the box. */
  align?: "left" | "right";
}

/**
 * A button showing the colour in use (as --swatch, for its className to draw) that opens ColorChoices under it;
 * a click outside or Escape closes them.
 */
export function ColorSwatch({ label, title, className, align = "left", ...choices }: SwatchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && setIsOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <span ref={ref} className="relative flex flex-none">
      <button
        type="button"
        className={className}
        style={{ "--swatch": choices.current } as CSSProperties}
        aria-label={label}
        aria-expanded={isOpen}
        title={title}
        onClick={() => setIsOpen(!isOpen)}
      />
      {isOpen && (
        <div
          className={`card absolute top-full z-40 mt-2 w-44 !p-2 text-left font-normal text-stone-900 shadow-lg dark:text-stone-100 ${align === "right" ? "right-0" : "left-0 max-sm:right-0 max-sm:left-auto"}`}
          role="dialog"
          aria-label={label}
        >
          <ColorChoices {...choices} />
        </div>
      )}
    </span>
  );
}
