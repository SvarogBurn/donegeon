import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ReceivedCheer } from "../api/people";
import { useCheerPops } from "../hooks/people";
import { useMe, useSoundOff } from "../hooks/useAuth";
import { getBigMoment, onBigMoment, type Moment } from "../lib/bigMoment";
import { DEFAULT_LOOK } from "../lib/character/bodies";
import { normalizeLook, normalizeProfile } from "../lib/character/profile";
import { playSound, type SoundName } from "../lib/sounds";
import { FaceSprite } from "./Character/CharacterFace";
import { CharacterSprite } from "./Character/CharacterSprite";
import { useFaceLook } from "./Character/useUnlocks";
import { Confetti } from "./Confetti";

// The smaller bolts down each side: where, how tall, a little after the big one and one after another.
const SIDE_BOLTS = [
  { side: "left", at: "4%", height: "min(38svh, 30vw)", delay: 0.2, flip: false },
  { side: "right", at: "6%", height: "min(46svh, 36vw)", delay: 0.28, flip: true },
  { side: "left", at: "17%", height: "min(28svh, 24vw)", delay: 0.38, flip: true },
  { side: "right", at: "19%", height: "min(32svh, 26vw)", delay: 0.46, flip: false },
  { side: "left", at: "29%", height: "min(20svh, 18vw)", delay: 0.56, flip: false },
  { side: "right", at: "30%", height: "min(24svh, 20vw)", delay: 0.64, flip: true },
];

/** The bolt (assets/animations/9x24lightning_bolt_v1, .big-moment-bolt in index.css). */
const Bolt = ({ className, style }: { className: string; style?: CSSProperties }) => <span className={className} style={style} />;

const Words = ({ count, still = false }: { count: number; still?: boolean }) => (
  <p className={`big-moment-words font-pixel ${still ? "is-still" : ""}`}>
    {count} {count === 1 ? "task" : "tasks"} today!
  </p>
);

/** With reduced motion: the words alone, still, for this long (no bolts, no confetti). */
const STILL_MS = 1500;

// As many as fit on a phone at their longest: nothing here can be scrolled, and the rest are in the bell.
const MOST_CHEERS = 4;

/** The cheers that came in, one under another on a card, so they read over anything: each friend's face, their line and their name, as in the bell. One alone is shown larger. */
function CheerWords({ cheers }: { cheers: ReceivedCheer[] }) {
  const hidden = cheers.length - MOST_CHEERS;
  const face = cheers.length === 1 ? "size-[63px] flex-none" : "size-[42px] flex-none";
  return (
    <div className="big-moment-cheers card" data-cheer-words>
      {cheers.slice(0, MOST_CHEERS).map(({ id, line, username, look }) => (
        <div key={id} className="flex items-center gap-2" data-cheer-from={username}>
          <FaceSprite look={normalizeLook(look)} className={face} iconClass={`tab-icon tab-icon-user ${face}`} />
          <div className="min-w-0">
            <span className={`block text-pink-700 dark:text-pink-400 ${cheers.length === 1 ? "text-base" : "text-sm"}`}>{line}</span>
            <span className="block truncate text-xs text-stone-500">{username}</span>
          </div>
        </div>
      ))}
      {hidden > 0 && <p className="text-center text-xs text-stone-500">and {hidden} more in the bell</p>}
    </div>
  );
}

/** The user's look, as the task bar's face shows it (less what a knockout took back). */
function useOwnLook() {
  const { user } = useMe();
  const saved = useMemo(() => normalizeProfile(user?.profile).look ?? DEFAULT_LOOK, [user?.profile]);
  return useFaceLook(user, saved);
}

/** The first task of a day: the user's face, as the task bar shows it, pops up from the bottom, hops twice and says the streak in a speech bubble, then drops back down. On a milestone it hops once more and stays longer, over flames (StreakFlames). */
function StreakCheer({ streak, milestone = false, still = false }: { streak: number; milestone?: boolean; still?: boolean }) {
  const look = useOwnLook();
  return (
    <div className={`streak-cheer ${milestone ? "is-milestone" : ""} ${still ? "is-still" : ""}`} data-streak={streak} data-milestone={milestone || undefined}>
      <div className="streak-cheer-bubble">
        <p className="card px-3 py-2 font-pixel text-sm whitespace-nowrap text-stone-900 dark:text-stone-100">{streak}-day streak!</p>
        <span className="streak-cheer-tail" />
      </div>
      <FaceSprite look={look} className="streak-cheer-face" iconClass="tab-icon tab-icon-user streak-cheer-face" />
    </div>
  );
}

// The flames along the bottom of a streak milestone: art pixels per grid pixel, and a little out of step.
const FLAMES = [2, 3, 1, 3, 2, 1, 2, 3, 1, 2, 3, 1, 2, 3].map((size, i) => ({ size, delay: (i * 0.07) % 0.2 }));

/** A flame (assets/animations/7x11flame_v1, .streak-flame in index.css), so many art pixels a pixel of it. */
const Flame = ({ size, delay }: { size: number; delay: number }) => <span className="streak-flame" style={{ "--s": size, animationDelay: `${0.7 + delay}s` } as CSSProperties} />;

/** A row of pixel flames rising along the bottom of the screen, behind the character, flickering. */
const StreakFlames = () => (
  <div className="streak-flames" data-streak-flames>
    {FLAMES.map(({ size, delay }, i) => (
      <Flame key={i} size={size} delay={delay} />
    ))}
  </div>
);

/** A level up's words: "LEVEL UP!", whatever goes under it (the banner's face), and the level. */
const LevelWords = ({ level, children }: { level: number; children?: ReactNode }) => (
  <div className="level-words font-pixel">
    <p className="level-words-big">LEVEL UP!</p>
    {children}
    <p className="level-words-level">Lv {level}</p>
  </div>
);

// The sparkles rising up the pillar: off the middle by so many screen pixels, how big in art pixels, when, and how far they drift.
const SPARKS = Array.from({ length: 10 }, (_, i) => ({ x: (((i * 37) % 7) - 3) * 12, size: [1, 2][i % 2], delay: 0.3 + (i % 5) * 0.2 + Math.floor(i / 5) * 0.1, drift: (((i * 53) % 5) - 2) * 4 }));

interface LevelProps {
  moment: Moment;
  still: boolean;
  onEnd: () => void;
}

/** A level up: the sky dims a little, a flat column of light opens down the middle, the whole character rises into it as a few sparkles go up, and "LEVEL UP!" stamps in over it. */
function LevelPillar({ moment, still, onEnd }: LevelProps) {
  const look = useOwnLook();
  return (
    <div className={`big-moment level-up level-pillar ${still ? "is-still" : ""}`} aria-hidden data-big-moment={moment.id} data-kind={still ? "still" : "pillar"} data-level={moment.count} onAnimationEnd={(e) => e.animationName === "level-dim" && onEnd()}>
      <span className="level-pillar-beam" />
      {SPARKS.map(({ x, size, delay, drift }, i) => (
        <span key={i} className="level-pillar-spark" style={{ "--x": `${x}px`, "--s": size, "--drift": `${drift}px`, animationDelay: `${delay}s` } as CSSProperties} />
      ))}
      <div className="level-pillar-stack">
        <LevelWords level={moment.count} />
        <div className="level-pillar-hero">
          <CharacterSprite look={look} scale={2} label="Your character" />
        </div>
      </div>
    </div>
  );
}

/** A level up: a rod drops in from the top (both drawn in assets/animations: 72x3level_banner_rod_v1, 60x48level_banner_v1), a banner unrolls under it with "LEVEL UP!", the user's face and the level, sways a little, then rolls back up and goes. */
function LevelBanner({ moment, still, onEnd }: LevelProps) {
  const look = useOwnLook();
  return (
    <div className={`big-moment level-up is-banner ${still ? "is-still" : ""}`} aria-hidden data-big-moment={moment.id} data-kind={still ? "still" : "banner"} data-level={moment.count} onAnimationEnd={(e) => e.animationName === "level-dim" && onEnd()}>
      <div className="level-banner">
        <div className="level-banner-sway">
          <span className="level-banner-rod" />
          <div className="level-banner-cloth">
            <LevelWords level={moment.count}>
              <FaceSprite look={look} className="level-banner-face" iconClass="tab-icon tab-icon-user level-banner-face" />
            </LevelWords>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The sound a moment plays. */
function soundOf({ kind, milestone }: Moment): SoundName {
  if (kind === "pillar") return "pillar";
  if (kind === "banner") return "levelup";
  if (kind === "streak") return milestone ? "milestone" : "streak";
  return kind === "lightning" || kind === "cheer" ? kind : "fanfare";
}

/** Every so many tasks of a day, the kinds ticked in Settings in turn (the words alone with none), a pop of confetti for a cheer, saying the cheers that came in, the character cheering the streak at the first task of a day (more on a milestone), and a level up. It takes no clicks; with reduced motion it is the words alone (or the character), still, and the sound. */
export function BigMoment() {
  const moment = useSyncExternalStore(onBigMoment, getBigMoment);
  const soundOff = useSoundOff();
  const [shown, setShown] = useState(0);
  const [still, setStill] = useState(false);
  useCheerPops();

  useEffect(() => {
    if (!moment) return;
    if (!soundOff) playSound(soundOf(moment));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setStill(reduced);
    setShown(moment.id);
    if (!reduced) return;
    const gone = setTimeout(() => setShown(0), STILL_MS);
    return () => clearTimeout(gone);
    // Only a new moment plays: not a change of the setting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moment]);

  if (!moment || shown !== moment.id) return null;
  const end = () => setShown(0);
  if (moment.kind === "pillar" || moment.kind === "banner") {
    const Level = moment.kind === "pillar" ? LevelPillar : LevelBanner;
    return createPortal(<Level key={moment.id} moment={moment} still={still} onEnd={end} />, document.body);
  }
  if (still) {
    return createPortal(
      <div key={moment.id} className={`big-moment ${moment.kind === "streak" ? "is-streak" : ""}`} aria-hidden data-big-moment={moment.id} data-kind="still">
        {moment.kind === "cheer" ? !!moment.cheers?.length && <CheerWords cheers={moment.cheers} /> : moment.kind === "streak" ? <StreakCheer streak={moment.count} milestone={moment.milestone} still /> : <Words count={moment.count} still />}
      </div>,
      document.body,
    );
  }
  return createPortal(
    moment.kind === "lightning" ? (
      <div key={moment.id} className="big-moment big-moment-storm" aria-hidden data-big-moment={moment.id} data-kind="lightning" onAnimationEnd={(e) => e.target === e.currentTarget && end()}>
        <span className="big-moment-flash" />
        <div className="big-moment-sky">
          <Bolt className="big-moment-bolt" />
          {SIDE_BOLTS.map(({ side, at, height, delay, flip }) => (
            <Bolt key={delay} className={`big-moment-side ${flip ? "is-flipped" : ""}`} style={{ [side]: at, height, animationDelay: `${delay}s` }} />
          ))}
        </div>
        <Words count={moment.count} />
      </div>
    ) : moment.kind === "words" ? (
      <div key={moment.id} className="big-moment" aria-hidden data-big-moment={moment.id} data-kind="words" onAnimationEnd={end}>
        <Words count={moment.count} />
      </div>
    ) : moment.kind === "streak" ? (
      <div key={moment.id} className="big-moment is-streak" aria-hidden data-big-moment={moment.id} data-kind="streak" onAnimationEnd={(e) => e.animationName === "streak-cheer-drop" && end()}>
        {moment.milestone && <StreakFlames />}
        <StreakCheer streak={moment.count} milestone={moment.milestone} />
      </div>
    ) : moment.kind === "cheer" ? (
      <div key={moment.id} className="big-moment" aria-hidden data-big-moment={moment.id} data-kind="cheer">
        <Confetti pop onEnd={end} />
        {!!moment.cheers?.length && <CheerWords cheers={moment.cheers} />}
      </div>
    ) : (
      <div key={moment.id} className="big-moment" aria-hidden data-big-moment={moment.id} data-kind="confetti">
        <Confetti onEnd={end} />
        <Words count={moment.count} />
      </div>
    ),
    document.body,
  );
}
