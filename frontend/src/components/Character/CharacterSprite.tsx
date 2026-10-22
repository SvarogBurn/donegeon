import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { compose, FLOOR, HEIGHT, WIDTH, type PartsData } from "../../lib/character/compose";
import type { Look } from "../../lib/character/bodies";

// The parts' pixels are only loaded where a character is shown.
let loaded: PartsData | null = null;
let loading: Promise<PartsData> | null = null;

function usePartsData() {
  const [data, setData] = useState(loaded);
  useEffect(() => {
    if (data) return;
    loading ??= import("../../lib/character/parts.data.json").then((m) => (loaded = m.default as unknown as PartsData));
    let live = true;
    void loading.then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [data]);
  return data;
}

// The oval shadow under the feet, round the floor row, in art pixels: [x, y, width].
const SHADOW: [number, number, number][] = [
  [11, FLOOR - 1, 11],
  [9, FLOOR, 15],
  [11, FLOOR + 1, 11],
];

/**
 * The character, drawn from its parts, `scale` art pixels of --u each per pixel of the 32x48 canvas, so it stays
 * crisp at any size. Its shadow is drawn under it. With `fit` it is as big as fits across the box it is in, a whole
 * number of screen pixels per pixel of the canvas (and never smaller than `scale`). With `silhouette` it is one grey
 * shape: a body not yet discovered. With `cover` (a body drawn out to its edges, the dragon) it is zoomed in until it
 * fills the whole width of the box it is in, padding included, a whole number of screen pixels per pixel still, from
 * the box's top down; the box keeps its size and cuts off what is beyond it (a little at the sides, some rows at the
 * bottom, where the drawing is cut off anyway).
 */
export function CharacterSprite({ look, scale, label, fit, silhouette, cover }: { look: Look; scale: number; label: string; fit?: boolean; silhouette?: boolean; cover?: boolean }) {
  const data = usePartsData();
  const pixels = data ? compose(look, data) : [];
  const ref = useRef<SVGSVGElement>(null);
  const [fitted, setFitted] = useState<number | null>(null);
  useLayoutEffect(() => {
    const box = ref.current?.parentElement;
    if (!fit || !box) return setFitted(null);
    const measure = () => {
      const style = getComputedStyle(box);
      const width = box.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const least = scale * parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--u"));
      setFitted(Math.max(least, Math.floor(width / WIDTH)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [fit, scale]);
  const [zoom, setZoom] = useState<string | undefined>(undefined);
  useLayoutEffect(() => {
    const svg = ref.current;
    const box = svg?.parentElement;
    if (!cover || !svg || !box) return setZoom(undefined);
    const measure = () => {
      // Screen pixels per pixel of the canvas as laid out, before the zoom (a transform leaves clientWidth alone).
      const pixel = svg.clientWidth / WIDTH;
      if (!pixel) return;
      const top = parseFloat(getComputedStyle(box).paddingTop);
      setZoom(`translateY(${-top}px) scale(${Math.ceil(box.clientWidth / WIDTH) / pixel})`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [cover, fitted, scale]);
  const size = fitted
    ? { width: `${WIDTH * fitted}px`, height: `${HEIGHT * fitted}px` }
    : { width: `calc(var(--u) * ${WIDTH * scale})`, height: `calc(var(--u) * ${HEIGHT * scale})` };
  return (
    <svg ref={ref} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} shapeRendering="crispEdges" className={`mx-auto block flex-none ${silhouette ? "text-stone-400 dark:text-stone-600" : ""}`} style={{ ...size, ...(zoom && { transform: zoom, transformOrigin: "top center" }) }} role="img" aria-label={label} data-character-sprite data-silhouette={silhouette || undefined}>
      {SHADOW.map(([x, y, w]) => (
        <rect key={`s${y}`} x={x} y={y} width={w} height={1} className="fill-black/15 dark:fill-black/40" />
      ))}
      {pixels.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={p.w} height={1} fill={silhouette ? "currentColor" : p.fill} />
      ))}
    </svg>
  );
}
