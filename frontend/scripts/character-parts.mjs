// Exports the characters drawn in Aseprite to the data the app draws them from.
// Every .aseprite file directly in assets/character/ (not its subfolders) is read, every layer of it, hidden ones too
// (a body's alternatives, like a second hat, are often hidden layers). Writes frontend/src/lib/character/parts.data.json:
// { [file name without .aseprite]: { width, height, layers: [{ name, visible, runs }] } }, layers bottom to top, a run
// being [x, y, width, "#RRGGBB"]. A layer whose name an earlier layer of the file has gets " 2", " 3" after it. Which file is which body, and what of it can be changed, is in lib/character/bodies.ts.
// Run: npm run parts (needs aseprite on the PATH).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const artDir = path.resolve(here, "../../assets/character");
const outFile = path.resolve(here, "../src/lib/character/parts.data.json");
const dump = path.join(here, "aseprite-dump.lua");

const runsOf = (pixels) => {
  const sorted = [...pixels].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const runs = [];
  for (const [x, y, hex] of sorted) {
    const last = runs[runs.length - 1];
    if (last && last[1] === y && last[3] === hex && last[0] + last[2] === x) last[2]++;
    else runs.push([x, y, 1, hex]);
  }
  return runs;
};

const out = {};
for (const file of fs.readdirSync(artDir).filter((f) => f.endsWith(".aseprite")).sort()) {
  const json = execFileSync("aseprite", ["-b", "--script-param", `file=${path.join(artDir, file)}`, "--script", dump], {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  const sprite = JSON.parse(json);
  // bodies.ts names layers, so two layers of one name are told apart: the second "hair short" is "hair short 2".
  const named = new Map();
  for (const layer of sprite.layers) {
    const n = (named.get(layer.name) ?? 0) + 1;
    named.set(layer.name, n);
    if (n > 1) {
      console.warn(`${file}: a second layer named "${layer.name}" is exported as "${layer.name} ${n}"`);
      layer.name = `${layer.name} ${n}`;
    }
  }
  // 32x48 for a character that stands on the floor; 32x52 for one drawn out to its edges (`toEdge` in bodies.ts, the dragon).
  if (sprite.width > 32 || sprite.height > 52) throw new Error(`${file} is ${sprite.width}x${sprite.height}: a character is at most 32x52`);
  out[file.replace(/\.aseprite$/, "")] = {
    width: sprite.width,
    height: sprite.height,
    // A cel can reach past the canvas; what is out there isn't seen in Aseprite either.
    layers: sprite.layers
      .map((l) => ({ ...l, pixels: l.pixels.filter(([x, y]) => x >= 0 && y >= 0 && x < sprite.width && y < sprite.height) }))
      .filter((l) => l.pixels.length > 0)
      .map((l) => ({ name: l.name, visible: l.visible, runs: runsOf(l.pixels) })),
  };
}
fs.writeFileSync(outFile, JSON.stringify(out) + "\n");
console.log(`${Object.keys(out).length} characters → ${path.relative(process.cwd(), outFile)}`);
