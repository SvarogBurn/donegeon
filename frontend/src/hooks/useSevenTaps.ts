import { useRef } from "react";

/** A tap counter for what is hidden behind seven quick taps (2 s at most): call what it returns on each tap. */
export function useSevenTaps(onDone: () => void) {
  const taps = useRef<number[]>([]);
  return () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 2000), now];
    if (taps.current.length < 7) return;
    taps.current = [];
    onDone();
  };
}
