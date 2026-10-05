import { useEffect, useRef } from "react";
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
 * way back to the default. Used for a list's box and for a folder's icon.
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
