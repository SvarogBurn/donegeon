import type { InputHTMLAttributes } from "react";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  /** Small, for the rows of an options menu. */
  small?: boolean;
}

/**
 * A NES.css checkbox. NES draws the box on the <span> after the input and
 * hides the input itself; here the input is laid invisibly over the drawn box
 * instead, so it is still what gets clicked and focused. `className` goes on
 * the wrapper (margins); everything else on the input.
 */
export function PixelCheckbox({ className = "", small, ...input }: Props) {
  return (
    <span className={`pixel-check ${small ? "pixel-check-small" : ""} ${className}`}>
      <input type="checkbox" className="nes-checkbox" {...input} />
      <span aria-hidden />
    </span>
  );
}
