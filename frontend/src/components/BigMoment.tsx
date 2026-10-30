import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useSoundOff } from "../hooks/useAuth";
import { getBigMoment, onBigMoment } from "../lib/bigMoment";
import { playSound } from "../lib/sounds";
import { Confetti } from "./Confetti";

// The bolt, in rows of a 9x24 grid: where each row's pixels start and how many there are.
const BOLT = [[5, 3], [4, 3], [4, 3], [3, 3], [3, 3], [2, 3], [2, 6], [3, 5], [4, 3], [3, 3], [3, 3], [2, 3], [2, 3], [1, 3], [1, 6], [2, 5], [3, 3], [2, 3], [2, 2], [1, 2], [1, 2], [0, 2], [0, 1], [0, 1]];

// The smaller bolts down each side: where, how tall, a little after the big one and one after another.
const SIDE_BOLTS = [
  { side: "left", at: "4%", height: "min(38svh, 30vw)", delay: 0.2, flip: false },
  { side: "right", at: "6%", height: "min(46svh, 36vw)", delay: 0.28, flip: true },
  { side: "left", at: "17%", height: "min(28svh, 24vw)", delay: 0.38, flip: true },
  { side: "right", at: "19%", height: "min(32svh, 26vw)", delay: 0.46, flip: false },
  { side: "left", at: "29%", height: "min(20svh, 18vw)", delay: 0.56, flip: false },
  { side: "right", at: "30%", height: "min(24svh, 20vw)", delay: 0.64, flip: true },
];

function Bolt({ className, style }: { className: string; style?: CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 9 24" shapeRendering="crispEdges">
      {BOLT.map(([x, width], y) => (
        <g key={y}>
          <rect x={x} y={y} width={width} height={1} fill="#ffd23f" />
          {width > 2 && <rect x={x + 1} y={y} width={width - 2} height={1} fill="#fffbe6" />}
        </g>
      ))}
    </svg>
  );
}

const Words = ({ count }: { count: number }) => <p className="big-moment-words font-pixel">{count} {count === 1 ? "task" : "tasks"} today!</p>;

/** Every so many tasks of a day, lightning and confetti in turn. It takes no clicks, and with reduced motion it stays the sound. */
export function BigMoment() {
  const moment = useSyncExternalStore(onBigMoment, getBigMoment);
  const soundOff = useSoundOff();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!moment) return;
    if (!soundOff) playSound(moment.kind === "lightning" ? "lightning" : "fanfare");
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setShown(moment.id);
    // Only a new moment plays: not a change of the setting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moment]);

  if (!moment || shown !== moment.id) return null;
  const end = () => setShown(0);
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
    ) : (
      <div key={moment.id} className="big-moment" aria-hidden data-big-moment={moment.id} data-kind="confetti">
        <Confetti onEnd={end} />
        <Words count={moment.count} />
      </div>
    ),
    document.body,
  );
}
