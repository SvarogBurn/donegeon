import { describe, expect, it } from "vitest";
import { FADE_SECONDS, makePieces, pieceAt, PIXEL, showerOpacity, SHOWER_SECONDS, stepPiece, type Piece } from "./confetti";

const STEP = 1 / 60;
const fly = (piece: Piece, seconds: number) => {
  let flown = piece;
  for (let i = 0; i < seconds / STEP; i++) flown = stepPiece(flown, STEP);
  return flown;
};

describe("makePieces", () => {
  it("throws half in from each top corner, inward", () => {
    const pieces = makePieces(1000, 800);
    const left = pieces.filter((piece) => piece.x <= 0);
    expect(left.length).toBe(pieces.length / 2);
    expect(left.every((piece) => piece.speedX > 0)).toBe(true);
    expect(pieces.filter((piece) => piece.x >= 1000).every((piece) => piece.speedX < 0)).toBe(true);
    expect(pieces.every((piece) => piece.y <= 0)).toBe(true);
  });
});

describe("stepPiece", () => {
  const [piece] = makePieces(1000, 800, () => 0.5);

  it("slows to the speed air lets it fall at", () => {
    const fast = { ...piece, speedY: 900 };
    expect(fly(fast, 3).speedY).toBeCloseTo(piece.falling, 0);
    expect(fly({ ...piece, speedY: 0 }, 3).speedY).toBeCloseTo(piece.falling, 0);
  });
  it("loses its throw across the screen, and stays inside it", () => {
    const flown = fly(piece, 3);
    expect(Math.abs(flown.speedX)).toBeLessThan(5);
    expect(flown.x).toBeGreaterThan(0);
    expect(flown.x).toBeLessThan(1000);
  });
  it("has gone off the bottom before the shower's end", () => {
    for (const p of makePieces(1000, 800)) expect(fly(p, SHOWER_SECONDS).y).toBeGreaterThan(800 * 0.9);
  });
});

describe("the release", () => {
  it("lets the pieces go over time", () => {
    const waits = makePieces(1000, 800).map((piece) => piece.wait);
    expect(Math.max(...waits) - Math.min(...waits)).toBeGreaterThan(1);
  });
  it("holds a piece until its time", () => {
    const [piece] = makePieces(1000, 800, () => 0.5);
    expect(stepPiece({ ...piece, wait: 1 }, 0.1)).toMatchObject({ x: piece.x, y: piece.y, wait: 0.9 });
  });
});

describe("pieceAt", () => {
  const [piece] = makePieces(1000, 800, () => 0.5);

  it("draws on whole art pixels, never to nothing", () => {
    for (let time = 0; time < 3; time += 0.07) {
      const drawn = pieceAt({ ...piece, x: 101.4, y: 53.2 }, time);
      expect(Math.abs(drawn.x % PIXEL)).toBe(0);
      expect(Math.abs(drawn.y % PIXEL)).toBe(0);
      expect(drawn.height).toBeGreaterThanOrEqual(PIXEL);
    }
  });
  it("sways, and shows both of its sides as it tumbles", () => {
    const frames = Array.from({ length: 60 }, (_, i) => pieceAt({ ...piece, x: 300 }, i * 0.05));
    expect(new Set(frames.map((frame) => frame.x)).size).toBeGreaterThan(3);
    expect(new Set(frames.map((frame) => frame.color)).size).toBe(2);
    expect(new Set(frames.map((frame) => frame.height)).size).toBeGreaterThan(1);
  });
});

describe("showerOpacity", () => {
  it("stays whole, then fades out by the end", () => {
    expect(showerOpacity(0)).toBe(1);
    expect(showerOpacity(SHOWER_SECONDS - FADE_SECONDS)).toBeCloseTo(1);
    expect(showerOpacity(SHOWER_SECONDS - FADE_SECONDS / 2)).toBeCloseTo(0.5);
    expect(showerOpacity(SHOWER_SECONDS)).toBe(0);
  });
});
