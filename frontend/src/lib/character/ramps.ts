// Recolouring a part: a material is drawn in a few shades of one colour (its ramp). A picked colour takes the place of
// the ramp's base, and every other shade keeps its distance from the base in lightness, colourfulness and hue
// (OKLCH), so the drawn light and shadow, and the warmer lights and cooler shadows, carry over to any colour.

type Lch = [l: number, c: number, h: number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToLch(hex: string): Lch {
  const [r, g, b] = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180) / Math.PI];
}

function lchToRgb([L, C, H]: Lch): [number, number, number] {
  const A = C * Math.cos((H * Math.PI) / 180);
  const B = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: number[]) => rgb.every((c) => c >= -0.0005 && c <= 1.0005);

/** The nearest colour the screen can show: the same lightness and hue, less colourful until it fits. */
function lchToHex(lch: Lch): string {
  let [L, C] = lch;
  L = Math.min(1, Math.max(0, L));
  let rgb = lchToRgb([L, C, lch[2]]);
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = C;
    for (let i = 0; i < 20; i++) {
      C = (lo + hi) / 2;
      if (inGamut(lchToRgb([L, C, lch[2]]))) lo = C;
      else hi = C;
    }
    rgb = lchToRgb([L, lo, lch[2]]);
  }
  return "#" + rgb.map((c) => Math.round(Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, c))))) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

// Below this much colour a hue means nothing (whites, greys, the ink).
const GREY = 0.02;
const LIGHTEST = 0.97;
const DARKEST = 0.12;
const MIN_ROOM = 0.06;

/**
 * The ramp `hexes` (its base first) moved onto `target`: a map from each drawn hex to its new one. Lightness offsets
 * that would run past white or black are squeezed to fit.
 */
export function recolorRamp(hexes: string[], target: string): Map<string, string> {
  const base = hexes[0];
  const out = new Map<string, string>();
  if (!base || base.toUpperCase() === target.toUpperCase()) {
    for (const hex of hexes) out.set(hex, hex);
    return out;
  }
  const [bl, bc, bh] = hexToLch(base);
  const [tl, tc, th] = hexToLch(target);
  const shades = hexes.map(hexToLch);
  const up = Math.max(0, ...shades.map(([l]) => l - bl));
  const down = Math.max(0, ...shades.map(([l]) => bl - l));
  // Room above and below the base for its lighter and darker shades. A pick too near white or black to leave any is
  // moved in a little, so its shading still shows.
  const upRoom = Math.max(LIGHTEST - tl, Math.min(up, MIN_ROOM));
  const downRoom = Math.max(tl - DARKEST, Math.min(down, MIN_ROOM));
  const l0 = Math.min(Math.max(tl, downRoom), 1 - upRoom);
  const ceiling = Math.min(1, l0 + upRoom);
  const floor = Math.max(0, l0 - downRoom);
  const upScale = up > 0 && l0 + up > ceiling ? (ceiling - l0) / up : 1;
  const downScale = down > 0 && l0 - down < floor ? (l0 - floor) / down : 1;
  hexes.forEach((hex, i) => {
    if (i === 0) return out.set(hex, l0 === tl ? target.toUpperCase() : lchToHex([l0, tc, th]));
    const [l, c, h] = shades[i];
    const dl = l - bl;
    const hueShift = bc > GREY && c > GREY && tc > GREY ? ((h - bh + 540) % 360) - 180 : 0;
    // A grey pick stays grey; a colourful one takes the shade's own extra or lesser colour.
    const dc = tc > GREY ? c - bc : 0;
    out.set(hex, lchToHex([l0 + dl * (dl > 0 ? upScale : downScale), Math.max(0, tc + dc), th + hueShift]));
  });
  return out;
}

/** Colours offered for fur, and for everything else (clothes, markings, eyes); any other comes from the browser's picker. */
export const FUR_COLORS: [name: string, hex: string][] = [
  ["White", "#F4F2E6"],
  ["Cream", "#E1D3B4"],
  ["Sand", "#BB9E8E"],
  ["Ginger", "#C27A47"],
  ["Brown", "#8E5C57"],
  ["Grey", "#9C9585"],
  ["Slate", "#564A62"],
  ["Black", "#2A2238"],
  ["Wine", "#80354D"],
  ["Moss", "#84937B"],
  ["Teal", "#6F9C8C"],
  ["Lilac", "#8B6E9B"],
];

export const CLOTH_COLORS: [name: string, hex: string][] = [
  ["Red", "#A63A3A"],
  ["Wine", "#80354D"],
  ["Rust", "#B0603A"],
  ["Mustard", "#C9A24A"],
  ["Moss", "#84937B"],
  ["Teal", "#6F9C8C"],
  ["Dusk", "#465A80"],
  ["Purple", "#6A3570"],
  ["Slate", "#3F394D"],
  ["Black", "#2A2238"],
  ["Cream", "#E1D3B4"],
  ["White", "#F4F2E6"],
];
