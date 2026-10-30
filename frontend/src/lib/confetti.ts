// Confetti that falls like confetti: thrown in from the top corners, then air takes over. Each piece slows to a falling
// speed of its own, sways, and tumbles (it shows less and more of itself, and its back). Worked out here without the
// screen; components/Confetti draws it.

/** One art pixel on screen: a piece is drawn to these, so it looks like the rest of the art. */
export const PIXEL = 3;
/** The seconds a shower lasts, the last of them fading out. */
export const SHOWER_SECONDS = 4.8;
export const FADE_SECONDS = 0.6;
const PIECES = 220;
// Pieces are let go over this long, so they come down as a shower and not as one line.
const RELEASE_SECONDS = 1.4;

// The boxes' own colours, each with a darker back.
const COLORS = [
  ["#ad61cb", "#7c3f96"],
  ["#2a9ba8", "#1c6c75"],
  ["#e0b000", "#a07d00"],
  ["#3f9b5c", "#2a6c3f"],
  ["#df7126", "#a34f15"],
  ["#d95f8c", "#a33f65"],
  ["#4a86c8", "#2f5d91"],
  ["#c8423b", "#8f2b26"],
];

export interface Piece {
  x: number;
  y: number;
  /** Seconds until it is thrown. */
  wait: number;
  /** Pixels a second. */
  speedX: number;
  speedY: number;
  /** The speed air lets it fall at. */
  falling: number;
  width: number;
  height: number;
  front: string;
  back: string;
  sway: number;
  swaySpeed: number;
  tumbleSpeed: number;
  /** Where in its sway and tumble it starts. */
  phase: number;
}

// How hard air holds a piece back: past its throw in a fraction of a second, and at its falling speed soon after.
const DRAG_X = 2.5;
const DRAG_Y = 5;

/** A shower for a screen this size: half from each top corner, some thrown far across and some only a little. */
export function makePieces(screenWidth: number, screenHeight: number, random = Math.random): Piece[] {
  const between = (low: number, high: number) => low + random() * (high - low);
  return Array.from({ length: PIECES }, (_, i) => {
    const fromLeft = i % 2 === 0;
    const [front, back] = COLORS[Math.floor(random() * COLORS.length)];
    const isStrip = random() < 0.35;
    return {
      x: fromLeft ? between(-20, 0) : screenWidth + between(0, 20),
      y: between(-40, 0),
      wait: between(0, RELEASE_SECONDS),
      // How far it gets across is its speed over the drag.
      speedX: (fromLeft ? 1 : -1) * between(0.05, 0.8) * screenWidth * DRAG_X,
      speedY: between(0, 500),
      // Over the height of the screen in 1.8 to 3.2 seconds.
      falling: screenHeight / between(1.8, 3.2),
      width: PIXEL * (isStrip ? 2 : 3),
      height: PIXEL * (isStrip ? 5 : 3),
      front,
      back,
      sway: between(10, 34),
      swaySpeed: between(2, 5),
      tumbleSpeed: between(4, 11),
      phase: between(0, Math.PI * 2),
    };
  });
}

/** A piece `dt` seconds on. */
export function stepPiece(piece: Piece, dt: number): Piece {
  if (piece.wait > 0) return { ...piece, wait: piece.wait - dt };
  const speedX = piece.speedX - piece.speedX * Math.min(1, DRAG_X * dt);
  const speedY = piece.speedY + (piece.falling - piece.speedY) * Math.min(1, DRAG_Y * dt);
  return { ...piece, speedX, speedY, x: piece.x + speedX * dt, y: piece.y + speedY * dt };
}

/** What to draw of a piece `time` seconds in: on whole art pixels, as much of it as faces the screen, and which side. */
export function pieceAt(piece: Piece, time: number) {
  const tumble = Math.cos(piece.phase + time * piece.tumbleSpeed);
  const snap = (n: number) => Math.round(n / PIXEL) * PIXEL;
  return {
    x: snap(piece.x + Math.sin(piece.phase + time * piece.swaySpeed) * piece.sway),
    y: snap(piece.y),
    width: piece.width,
    height: Math.max(PIXEL, snap(piece.height * Math.abs(tumble))),
    color: tumble >= 0 ? piece.front : piece.back,
  };
}

/** How see-through the shower is `time` seconds in: whole, then fading out at its end. */
export const showerOpacity = (time: number) => Math.max(0, Math.min(1, (SHOWER_SECONDS - time) / FADE_SECONDS));
