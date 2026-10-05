import frameSvg from "../../../assets/140x140border_blue_v3.svg?raw";
import sliderSvg from "../../../assets/buttons/20x10slider_blue_v1.svg?raw";
import type { List } from "../types";

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

/** The Task / Reward switch's track is drawn in the same bright blue, with a darker blue of its own. */
const SLIDER_DARK = "#3544A1";

/** What a list's box is coloured when the user hasn't picked: the art's blue for tasks, the reward tone for rewards. */
export const KIND_COLORS = { task: BAND_BRIGHT.toLowerCase(), reward: TONES.reward.bright.toLowerCase() };

/** The colours offered for a list; any other can be picked from the browser's colour picker. */
export const LIST_COLORS: [name: string, hex: string][] = [
  ["Blue", KIND_COLORS.task],
  ["Orange", KIND_COLORS.reward],
  ["Yellow", "#e0b000"],
  ["Green", "#37946e"],
  ["Teal", "#2a9ba8"],
  ["Purple", "#ad61cb"],
  ["Pink", "#d95f8c"],
  ["Red", "#c8423b"],
  ["Grey", "#6b7280"],
];

export const listColor = (list: Pick<List, "kind" | "color">) => list.color ?? KIND_COLORS[list.kind];

const channels = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

/** The band's second colour for a picked one: two thirds as light, as in the art. */
function darker(hex: string) {
  return `#${channels(hex).map((c) => Math.round((c * 2) / 3).toString(16).padStart(2, "0")).join("")}`;
}

/** Whether white text would be hard to read on this colour, so the band's title should be dark instead. */
export function isLight(hex: string) {
  const [r, g, b] = channels(hex).map((c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4;
}

const recoloured = new Map<string, string>();
function recolour(art: string, artDark: string, bright: string, name: string) {
  const key = `${name}:${bright}`;
  if (!recoloured.has(key)) {
    const svg = art.replaceAll(BAND_BRIGHT, bright).replaceAll(artDark, darker(bright));
    recoloured.set(key, `url("${URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }))}")`);
  }
  return recoloured.get(key)!;
}

/** The tile frame with its band in any colour, as a CSS url(); made once per colour. */
export const frameIn = (hex: string) => recolour(frameSvg, BAND_DARK, hex, "frame");
/** The Task / Reward switch's track in any colour. */
export const sliderIn = (hex: string) => recolour(sliderSvg, SLIDER_DARK, hex, "slider");

/** Sets --frame-<tone> on the page for each tone; index.css picks them up. Blue needs none: it is the file itself. */
export function installFrameTones() {
  for (const [tone, { bright, dark }] of Object.entries(TONES)) {
    const svg = frameSvg.replaceAll(BAND_BRIGHT, bright).replaceAll(BAND_DARK, dark);
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    document.documentElement.style.setProperty(`--frame-${tone}`, `url("${url}")`);
  }
}
