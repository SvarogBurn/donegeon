import { TEXT_FONTS } from "../../../shared/enums";
import type { TextFont } from "../types";

/**
 * The fonts the text inside the boxes, or in the Notes page's notes, can be in (the settings on the user's page).
 * Each is loaded in main.tsx; a system font stands in until it has come.
 */
export const FONT_STACKS: Record<Exclude<TextFont, "pixel">, string> = {
  plain: "ui-sans-serif, system-ui, sans-serif",
  dyslexic: '"OpenDyslexic", ui-sans-serif, system-ui, sans-serif',
  // Atkinson Hyperlegible, made for low vision (letters that look alike are told apart), and much bigger: index.css.
  large: '"Atkinson Hyperlegible", ui-sans-serif, system-ui, sans-serif',
};

/** The settings' dropdowns: each font's name, and a line on what it is for. */
export const FONT_CHOICES: { value: TextFont; label: string; note: string }[] = [
  { value: "pixel", label: "Pixel", note: "The pixel font, like the rest of the app." },
  { value: "plain", label: "Simple", note: "An ordinary font: smaller and quicker to read." },
  { value: "dyslexic", label: "OpenDyslexic", note: "Made for dyslexia: letters weighted at the bottom, so they don't flip or swap." },
  { value: "large", label: "Large print", note: "A much bigger, very clear font (Atkinson Hyperlegible): easy on tired eyes." },
];

/** The font saved for the account, or the pixel one for an account kept on the device from before there was a choice. */
export const textFont = (font: TextFont | undefined): TextFont => (font && TEXT_FONTS.includes(font) ? font : "pixel");
