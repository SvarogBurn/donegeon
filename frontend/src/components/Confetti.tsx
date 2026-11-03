import { useEffect, useRef } from "react";
import { hasLanded, makePieces, makePop, pieceAt, showerOpacity, SHOWER_SECONDS, stepPiece } from "../lib/confetti";

// A frame after a stall (the tab in the background) moves on by this at most, so nothing jumps.
const LONGEST_STEP = 1 / 30;

/** A shower of confetti over the page, or with `pop` a quick burst that falls to the ground: it plays once, then says so. */
export function Confetti({ pop = false, onEnd }: { pop?: boolean; onEnd: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d");
    if (!ctx) return onEnd();
    el.width = window.innerWidth;
    el.height = window.innerHeight;
    let pieces = (pop ? makePop : makePieces)(el.width, el.height);
    let time = 0;
    let last = performance.now();
    let frame = requestAnimationFrame(function draw(now) {
      const dt = Math.min(LONGEST_STEP, (now - last) / 1000);
      last = now;
      time += dt;
      if (pop ? hasLanded(pieces, el.height) : time >= SHOWER_SECONDS) return onEnd();
      pieces = pieces.map((piece) => stepPiece(piece, dt));
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.globalAlpha = pop ? 1 : showerOpacity(time);
      for (const piece of pieces) {
        const { x, y, width, height, color } = pieceAt(piece, time);
        ctx.fillStyle = color;
        ctx.fillRect(x, y, width, height);
      }
      frame = requestAnimationFrame(draw);
    });
    return () => cancelAnimationFrame(frame);
    // Once: `onEnd` changing mustn't start the shower over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvas} className="big-moment-confetti" data-confetti />;
}
