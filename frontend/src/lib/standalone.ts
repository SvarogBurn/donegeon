import { useSyncExternalStore } from "react";

/**
 * Whether the app runs installed (opened from its icon, in a window of its own) rather than in a browser tab.
 * The installed app has its own layout: a strip along the top with the account, search, folders and points, and
 * a bottom bar of just the three page icons (AppBars). CSS sees it as html[data-standalone].
 */
const query = window.matchMedia("(display-mode: standalone), (display-mode: fullscreen)");
// An iPhone's home-screen app says so here instead.
const isIosHomeScreen = (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const isStandalone = () => isIosHomeScreen || query.matches;

/** The colour of the installed app's bars, which the phone's own status and navigation bars take too. */
export const BAR_COLOR = { light: "#ffffff", dark: "#1c1c33" };

function mark() {
  const on = isStandalone();
  document.documentElement.toggleAttribute("data-standalone", on);
  // In a browser tab the phone's bars take the page's colour (index.html); installed, they take the app bars'.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.dataset.page ??= meta.content;
    meta.content = on ? (meta.media.includes("dark") ? BAR_COLOR.dark : BAR_COLOR.light) : meta.dataset.page;
  }
}

/** Called once at start-up. */
export function installStandalone() {
  mark();
  query.addEventListener("change", mark);
}

const subscribe = (onChange: () => void) => {
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

export const useStandalone = () => useSyncExternalStore(subscribe, isStandalone);
