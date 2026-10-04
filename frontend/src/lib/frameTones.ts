import frameSvg from "../../../assets/140x140border_blue_v3.svg?raw";

/**
 * The tile frame in other colours. The border art is drawn once, in blue; its
 * title band uses two blues (a bright one fading, through a dither, into a
 * dark one). Each tone swaps those two colours in the SVG's own text, so the
 * dither and every other pixel of the art stay exactly as drawn.
 */
const BAND_BRIGHT = "#5B6EE1";
const BAND_DARK = "#3E4987";

// As in the blue original, each dark is about two thirds as light as its bright,
// and the bright is dark enough for the white title that sits on it.
const TONES = {
  /** Reward lists. */
  reward: { bright: "#DF7126", dark: "#984D1A" },
  /** Goals, tags, new list. */
  setup: { bright: "#37946E", dark: "#25654B" },
  /** Done. */
  record: { bright: "#AD61CB", dark: "#76428A" },
};

/** Sets --frame-<tone> on the page for each tone; index.css picks them up. Blue needs none: it is the file itself. */
export function installFrameTones() {
  for (const [tone, { bright, dark }] of Object.entries(TONES)) {
    const svg = frameSvg.replaceAll(BAND_BRIGHT, bright).replaceAll(BAND_DARK, dark);
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    document.documentElement.style.setProperty(`--frame-${tone}`, `url("${url}")`);
  }
}
