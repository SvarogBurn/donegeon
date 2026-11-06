import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useMe, useTutorialRunning, useUpdateMe } from "../../hooks/useAuth";
import { normalizeProfile } from "../../lib/character/profile";
import { startChapter } from "../../lib/tutorialRun";
import { useProfile } from "../Character/useProfile";
import { TileFrame } from "../Tiles/TileFrame";
import { CHAPTERS, type Chapter } from "./steps";
import { forgetTutorialPlace } from "./Tutorial";

/**
 * The user page's Learn Donegeon box: the chapters of the tutorial that aren't in its short core, each started from
 * here and ticked once finished (profile.learned), and the core again. The words are drafts (Claude).
 */
export function LearnBox() {
  const { user } = useMe();
  const { profile } = useProfile();
  const update = useUpdateMe();
  const navigate = useNavigate();
  const running = useTutorialRunning();
  const { hash } = useLocation();
  // Opened from the pill: brought into sight.
  useEffect(() => {
    if (hash === "#learn") document.querySelector("[data-learn]")?.scrollIntoView({ block: "start" });
  }, [hash]);
  if (!user) return null;
  const learned = profile.learned ?? [];
  const done = CHAPTERS.filter((chapter) => learned.includes(chapter.id)).length;
  return (
    <TileFrame title="Learn Donegeon" aria-label="Learn Donegeon" data-learn>
      <p className="text-xs text-stone-500">
        The rest of the tutorial, a chapter at a time, whenever you like: {done} of {CHAPTERS.length} done.
      </p>
      <ul className="space-y-1 text-sm">
        {CHAPTERS.map((chapter) => {
          const isDone = learned.includes(chapter.id);
          return (
            <li key={chapter.id} className="flex items-center gap-2" data-learn-chapter={chapter.id} data-learned={isDone || undefined}>
              <span className="w-4 flex-none text-emerald-700 dark:text-emerald-400" aria-label={isDone ? "Done" : undefined}>
                {isDone ? "✓" : ""}
              </span>
              <span className="min-w-0 flex-1">{chapter.name}</span>
              <button type="button" className="btn-quiet text-xs" disabled={running} title={running ? "The tutorial is on: finish or skip it first" : undefined} onClick={() => startChapter(user.id, chapter.id)}>
                {isDone ? "Again ▸" : "Start ▸"}
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="btn-quiet text-xs"
        disabled={running}
        onClick={() => {
          forgetTutorialPlace();
          update.mutate({ tutorialSeen: false });
          navigate("/");
        }}
        data-learn-basics
      >
        Repeat the basics
      </button>
    </TileFrame>
  );
}

/** What a chapter's first use is: a page opened, or a click on something it is about. Shortcuts has none: the box only. */
const FIRST_USE: Record<string, { path?: (path: string) => boolean; click?: string }> = {
  menu: { click: '[aria-label="Task options"]' },
  boxes: { click: ".tile-button-pin, .tile-button-tab, .tile-button-min" },
  stats: { path: (path) => path === "/stats" },
  week: { click: '[data-tile="today"] .band-tab' },
  calendar: { path: (path) => path === "/calendar" },
  folders: { path: (path) => path.startsWith("/folders/") },
  you: { path: (path) => path === "/user" },
  dressing: { click: "[data-character-edit]" },
  friends: { click: "[data-settings-heading]" },
};

/**
 * After the core: a chapter offered once, the first time what it is about is used ("New here? Learn: Calendar ▸"), and
 * until then (or until dismissed) a pill with how much of Learn Donegeon is done. Only for an account whose core
 * ended in this version (profile.learned set): one that had the whole tutorial before isn't offered what it has
 * seen. Nothing while the tutorial runs. The words are drafts (Claude).
 */
export function LearnHints() {
  const { user } = useMe();
  const update = useUpdateMe();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const running = useTutorialRunning();
  const profile = normalizeProfile(user?.profile);
  const learned = profile.learned;
  const [offered, setOffered] = useState<Chapter | null>(null);
  const isOn = Boolean(learned && !running);

  // Offered once: noted at once, so it isn't offered again whatever is done with it.
  const offer = (found: Chapter) => {
    if (!learned || learned.includes(found.id) || learned.includes(`hint:${found.id}`)) return;
    setOffered(found);
    update.mutate({ profile: { ...profile, learned: [...learned, `hint:${found.id}`] } });
  };

  useEffect(() => {
    if (!isOn || offered) return;
    const found = CHAPTERS.find((one) => FIRST_USE[one.id]?.path?.(pathname));
    if (found) offer(found);
    // Only a new page offers: `offer` is the same in effect each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, isOn]);

  useEffect(() => {
    if (!isOn || offered) return;
    const onClick = (e: MouseEvent) => {
      if (!(e.target instanceof Element)) return;
      const target = e.target;
      const found = CHAPTERS.find((one) => FIRST_USE[one.id]?.click && target.closest(FIRST_USE[one.id].click!));
      if (found) offer(found);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  });

  if (!user || !isOn || !learned) return null;
  const done = CHAPTERS.filter((one) => learned.includes(one.id)).length;
  const showsPill = !offered && !learned.includes("hint:pill") && done < CHAPTERS.length;
  if (!offered && !showsPill) return null;

  const dismiss = () => (offered ? setOffered(null) : update.mutate({ profile: { ...profile, learned: [...learned, "hint:pill"] } }));
  const go = () => {
    if (offered) {
      setOffered(null);
      startChapter(user.id, offered.id);
    } else navigate("/user#learn");
  };
  return (
    <div className="fixed right-2 z-[55] flex items-center gap-1" style={{ bottom: "calc(var(--bar-h, 5rem) + 0.75rem)" }} data-learn-hint={offered?.id ?? "pill"}>
      <button type="button" className="nes-btn is-primary btn-small" onClick={go}>
        {offered ? `New here? Learn: ${offered.name} ▸` : `Learn Donegeon ▸ ${done}/${CHAPTERS.length}`}
      </button>
      <button type="button" className="btn-quiet glyph" aria-label={offered ? "Not now" : "Hide Learn Donegeon's button (the box stays on your page)"} onClick={dismiss}>
        ×
      </button>
    </div>
  );
}
