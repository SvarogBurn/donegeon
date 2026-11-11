import hills from "../../../assets/backgrounds/windowsxp_background_v1.png";

/**
 * The page's backgrounds (Settings › Theme and design, `profile.background`): the theme's own, the light theme on white
 * or the dark one on black whatever the OS says (`theme`), or a picture (assets/backgrounds, credited in its CREDITS.md
 * and under the choice).
 */
export const BACKGROUNDS = [
  { value: "default", label: "Default", note: "The theme's own: light grey on the light theme, near black on the dark." },
  { value: "white", label: "White", note: "The light theme, on white.", theme: "light", color: "#ffffff" },
  { value: "black", label: "Black", note: "The dark theme, on black.", theme: "dark", color: "#000000" },
  { value: "hills", label: "Green hills", note: "Green hills under a blue sky.", image: hills, credit: "okkainu" },
] as const;
export type BackgroundId = (typeof BACKGROUNDS)[number]["value"];

/** The task bars' backgrounds (`profile.bars`): the browser's task bar, the installed app's top strip and bottom bar. */
export const BAR_FILLS = [
  { value: "default", label: "Default", note: "The theme's own: white on the light theme, near black on the dark." },
  { value: "black", label: "Black", note: "Near black, with light words and icons, whatever the theme.", theme: "dark" },
  { value: "white", label: "White", note: "White, with dark words and icons, whatever the theme.", theme: "light" },
  { value: "clear", label: "See-through", note: "The theme's colour, half see-through: the background shows through the bar." },
] as const;
export type BarFillId = (typeof BAR_FILLS)[number]["value"];

/** The boxes' backgrounds (`profile.boxes`): the inside of every box, not its frame. The same choices as the bars'. */
export const BOX_FILLS = [
  { value: "default", label: "Default", note: "The theme's own: white on the light theme, near black on the dark." },
  { value: "black", label: "Black", note: "Near black, with light words, whatever the theme.", theme: "dark" },
  { value: "white", label: "White", note: "White, with dark words, whatever the theme.", theme: "light" },
  { value: "clear", label: "See-through", note: "The theme's colour, partly see-through: the background shows through the boxes." },
] as const;

export const isBackground = (value: unknown): value is BackgroundId => BACKGROUNDS.some((b) => b.value === value);
/** A bars' or boxes' background (the same ids). */
export const isBarFill = (value: unknown): value is BarFillId => BAR_FILLS.some((b) => b.value === value);

/** The settings kept in the user's profile, read without making the whole profile (lib/character/profile.ts). */
const settingsIn = (profile: unknown) => (profile ?? {}) as { background?: unknown; bars?: unknown; boxes?: unknown };

/** The background saved in the profile; left out = the theme's. */
export const backgroundIn = (profile: unknown): BackgroundId => {
  const { background } = settingsIn(profile);
  return isBackground(background) ? background : "default";
};

/** The task bars' background saved in the profile; left out = the theme's. */
export const barsIn = (profile: unknown): BarFillId => {
  const { bars } = settingsIn(profile);
  return isBarFill(bars) ? bars : "default";
};

/** The boxes' background saved in the profile; left out = the theme's. */
export const boxesIn = (profile: unknown): BarFillId => {
  const { boxes } = settingsIn(profile);
  return isBarFill(boxes) ? boxes : "default";
};

/** The theme a choice forces ("light" / "dark"), if it forces one. */
export const themeOf = (choice: { value: string }): "light" | "dark" | undefined => ("theme" in choice ? (choice.theme as "light" | "dark") : undefined);

/** What Distraction free shows of the three (Settings › Theme and design): no picture and nothing see-through, the theme's own in their place; White and Black stay, plain as they are. */
export function calmLook(background: BackgroundId, bars: BarFillId, boxes: BarFillId): [BackgroundId, BarFillId, BarFillId] {
  const plain = (fill: BarFillId) => (fill === "clear" ? "default" : fill);
  const isPicture = "image" in BACKGROUNDS.find((b) => b.value === background)!;
  return [isPicture ? "default" : background, plain(bars), plain(boxes)];
}
