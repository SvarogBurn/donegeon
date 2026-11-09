import { useEffect } from "react";
import { Navigate, Outlet } from "react-router";
import type { TextFont } from "../../types";
import { useMe } from "../../hooks/useAuth";
import { BACKGROUNDS, backgroundIn, barsIn, boxesIn, themeOf, type BackgroundId, type BarFillId } from "../../lib/backgrounds";
import { FONT_STACKS, textFont } from "../../lib/fonts";
import { useOnline } from "../../lib/offline/online";
import { useAppLayout } from "../../lib/standalone";
import { BigMoment } from "../BigMoment";
import { BreakReminder } from "../BreakReminder";
import { NotificationPlanner } from "../Notifications/NotificationPlanner";
import { CardPublisher } from "../People/CardPublisher";
import { RefusalPopup } from "../RefusalPopup";
import { TapTips } from "../TapTips";
import { LearnHints } from "../Tutorial/Learn";
import { Tutorial } from "../Tutorial/Tutorial";
import { NavBar } from "./NavBar";

/**
 * One of the account's fonts on the page: data-box-font / data-notes-font says which (none: the pixel font), and
 * --box-font / --notes-font holds it.
 */
function useTextFont(setting: "boxFont" | "notesFont", font: TextFont) {
  useEffect(() => {
    if (font === "pixel") return;
    const html = document.documentElement;
    const property = setting === "boxFont" ? "--box-font" : "--notes-font";
    html.dataset[setting] = font;
    html.style.setProperty(property, FONT_STACKS[font]);
    return () => {
      delete html.dataset[setting];
      html.style.removeProperty(property);
    };
  }, [setting, font]);
}

/**
 * The account's background, task bars and boxes on the page (lib/backgrounds.ts, index.css): data-background says which
 * background (none: the theme's), --page-bg holds a picture, data-theme the theme White or Black forces (the phone's
 * bars, theme-color, in its colour too), data-bars the bars' and data-boxes the boxes' (their own theme: useBarTheme,
 * useBoxTheme).
 */
function usePageLook(id: BackgroundId, bars: BarFillId, boxes: BarFillId) {
  useEffect(() => {
    if (id === "default") return;
    const html = document.documentElement;
    const background = BACKGROUNDS.find((b) => b.value === id)!;
    const theme = themeOf(background);
    const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    const before = metas.map((meta) => meta.content);
    html.dataset.background = id;
    if ("image" in background) html.style.setProperty("--page-bg", `url("${background.image}")`);
    if (theme) html.dataset.theme = theme;
    if ("color" in background) for (const meta of metas) meta.content = background.color;
    return () => {
      delete html.dataset.background;
      delete html.dataset.theme;
      html.style.removeProperty("--page-bg");
      metas.forEach((meta, i) => (meta.content = before[i]));
    };
  }, [id]);
  useEffect(() => {
    if (bars === "default") return;
    const html = document.documentElement;
    html.dataset.bars = bars;
    return () => {
      delete html.dataset.bars;
    };
  }, [bars]);
  useEffect(() => {
    if (boxes === "default") return;
    const html = document.documentElement;
    html.dataset.boxes = boxes;
    return () => {
      delete html.dataset.boxes;
    };
  }, [boxes]);
}

/** Wraps every logged-in page; sends anonymous visitors to /login. */
export function AppShell() {
  const { user, isLoading, error } = useMe();
  const online = useOnline();
  const usesAppLayout = useAppLayout();
  // The account's fonts, on the page itself so that popups drawn outside the shell follow them too (see index.css).
  useTextFont("boxFont", textFont(user?.boxFont));
  useTextFont("notesFont", textFont(user?.notesFont));
  usePageLook(backgroundIn(user?.profile), barsIn(user?.profile), boxesIn(user?.profile));

  if (isLoading && !online) return <p className="p-8 text-center text-sm text-stone-500">You're offline, and nothing was kept on this device yet.</p>;
  if (isLoading) return <p className="p-8 text-center text-sm text-stone-500" data-loading="app">Loading…</p>;
  // An account kept on the phone still shows when the server can't be asked about it.
  if (error && !user) return <p className="p-8 text-center text-sm text-red-600">Can't reach the server: {error.message}</p>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <>
      {/* The bottom padding is the room the task bar covers (--bar-h, set by NavBar); installed, the top strip's too (--top-h),
          and the "+" standing up out of the bottom bar (24px, PLUS_ABOVE in AppBars). */}
      <main className={`px-4 ${usesAppLayout ? "pt-[calc(var(--top-h,4rem)+1rem)] pb-[calc(var(--bar-h,5rem)+24px+1.5rem)]" : "pt-6 pb-[calc(var(--bar-h,5rem)+1.5rem)]"}`}>
        <Outlet />
      </main>
      <NavBar user={user} />
      <Tutorial user={user} />
      <RefusalPopup />
      <TapTips />
      <LearnHints />
      <BigMoment />
      <BreakReminder />
      <NotificationPlanner />
      <CardPublisher user={user} />
    </>
  );
}
