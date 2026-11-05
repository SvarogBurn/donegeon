import { useSyncExternalStore } from "react";

/**
 * Whether the app runs installed (opened from its icon, in a window of its own) rather than in a browser tab.
 * The installed app has its own layout: a strip along the top with the points, folders, search and account, and
 * a bottom bar of the pages and a "+" (AppBars). CSS sees it as html[data-standalone].
 */
const query = window.matchMedia("(display-mode: standalone), (display-mode: fullscreen)");
// An iPhone's home-screen app says so here instead.
const isIosHomeScreen = (navigator as Navigator & { standalone?: boolean }).standalone === true;

// Dev only: open any page with ?standalone to fake the installed app in a browser tab (?standalone=0 to stop).
// It lasts for the tab, so moving between pages keeps it. Gone from production builds.
const isFaked = import.meta.env.DEV && fakeStandalone();

function fakeStandalone() {
  const param = new URLSearchParams(location.search).get("standalone");
  try {
    if (param !== null) sessionStorage.setItem("fakeStandalone", param === "0" ? "" : "1");
    return sessionStorage.getItem("fakeStandalone") === "1";
  } catch {
    return param !== null && param !== "0";
  }
}

export const isStandalone = () => isFaked || isIosHomeScreen || query.matches;

// The phone's own status and navigation bars take the page's colour (index.html's theme-color), which the app's bars
// have too, installed or not.
const mark = () => document.documentElement.toggleAttribute("data-standalone", isStandalone());

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

/** A phone-wide screen (under 40rem, as Tailwind's `sm`). */
const narrow = window.matchMedia("(width < 40rem)");
const isAppLayout = () => isStandalone() || narrow.matches;
const subscribeLayout = (onChange: () => void) => {
  const unsubscribe = subscribe(onChange);
  narrow.addEventListener("change", onChange);
  return () => (unsubscribe(), narrow.removeEventListener("change", onChange));
};

/**
 * Whether the installed app's layout (AppBars: the strip along the top, the bottom bar with its "+") is used: when it
 * is installed, and on a phone-wide screen in a browser tab too (2026-11-04, playtest 1: the browser's task bar hid
 * its tabs in a strip too narrow to show them). The scroll bar is still the browser's there (html[data-standalone]).
 */
export const useAppLayout = () => useSyncExternalStore(subscribeLayout, isAppLayout);
