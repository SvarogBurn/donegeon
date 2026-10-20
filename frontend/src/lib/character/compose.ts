import { bodyOf, choiceOf, type Look, type Material } from "./bodies";
import { recolorRamp } from "./ramps";

/** A row of pixels of one colour: x, y, width, "#RRGGBB". */
export type Run = [x: number, y: number, w: number, hex: string];
/** What `npm run parts` exports: every layer of every drawing, bottom to top. */
export type PartsData = Record<string, { width: number; height: number; layers: { name: string; visible: boolean; runs: Run[] }[] }>;

export interface Pixel {
  x: number;
  y: number;
  w: number;
  fill: string;
}

/**
 * The canvas every character stands on: a drawing is at most 32x48 and stands LIFT rows above the canvas's bottom; one
 * drawn out to its edges (`toEdge`, the dragon) is at most 32x52 and stands on the bottom.
 */
export const WIDTH = 32;
export const HEIGHT = 52;
export const LIFT = 3;
/** The row a lifted drawing's feet are on. */
export const FLOOR = HEIGHT - LIFT - 1;

const claims = (m: Material, layer: string, x: number, y: number, hex: string) =>
  m.hexes.includes(hex) &&
  (!m.layers || m.layers.includes(layer)) &&
  (!m.rows || (y >= m.rows[0] && y <= m.rows[1])) &&
  (!m.at || m.at.some(([ax, ay]) => ax === x && ay === y));

const cache = new Map<string, Pixel[]>();

/**
 * The look as rows of pixels on the 32x48 canvas: its body's layers bottom to top (those its options leave out
 * skipped), each pixel in the colour picked for the material that claims it (see bodies.ts), or as drawn.
 */
export function compose(look: Look, data: PartsData): Pixel[] {
  const key = JSON.stringify(look);
  const kept = cache.get(key);
  if (kept) return kept;

  const body = bodyOf(look);
  const drawing = data[body.file];
  const pixels: Pixel[] = [];
  if (!drawing) return pixels;
  const shown = new Set<string>();
  const optional = new Set<string>();
  for (const option of body.options ?? []) {
    for (const choice of option.choices) choice.layers.forEach((l) => optional.add(l));
    choiceOf(look, option).layers.forEach((l) => shown.add(l));
  }
  // Each material's swap, made once: drawn hex → picked shade.
  const swaps = body.materials.map((m) => (look.colors[m.id] ? recolorRamp(m.hexes, look.colors[m.id]) : null));
  const dx = Math.floor((WIDTH - drawing.width) / 2);
  // Lifted, so the feet and the shadow under them aren't cut off by the stage's bottom; a drawing out to its edges stays down.
  const dy = HEIGHT - (body.toEdge ? 0 : LIFT) - drawing.height;

  for (const layer of drawing.layers) {
    if (body.skip?.includes(layer.name)) continue;
    if (optional.has(layer.name) ? !shown.has(layer.name) : !layer.visible) continue;
    for (const [x0, y, w, hex] of layer.runs) {
      for (let x = x0; x < x0 + w; x++) {
        const i = body.materials.findIndex((m) => claims(m, layer.name, x, y, hex));
        const fill = (i >= 0 && swaps[i]?.get(hex)) || hex;
        const last = pixels[pixels.length - 1];
        if (last && last.y === y + dy && last.fill === fill && last.x + last.w === x + dx) last.w++;
        else pixels.push({ x: x + dx, y: y + dy, w: 1, fill });
      }
    }
  }
  if (cache.size > 200) cache.clear();
  cache.set(key, pixels);
  return pixels;
}

/** The same as an SVG document, for tests and for saving. */
export function toSvg(pixels: Pixel[]) {
  const rects = pixels.map(({ x, y, w, fill }) => `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${fill}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" shape-rendering="crispEdges">${rects}</svg>`;
}
