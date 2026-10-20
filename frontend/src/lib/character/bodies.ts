// The characters a user can be. Each is one of the user's own drawings in assets/character/ (exported to parts.data.json
// with `npm run parts`), whole: its body and its clothes belong to it, so bodies can be as different as a bunny, a boar
// and a human. What can change is listed here:
// - options: pieces that come and go, or are swapped for another drawn in the same file (the bunny's two hats). A
//   choice names the layers it shows; a layer named in no choice is shown when it is visible in the file.
// - materials: the colours the user can change. A material's first hex is its base, the shade the picked colour lands
//   on; its other shades keep their distance from it (see ramps.ts). A material may be limited to some layers, to some
//   rows, or to single pixels (`at`), where the same hex is something else elsewhere (a white eye in white wool). Each
//   pixel takes the first material that claims it; a colour no material claims stays as drawn.
// Coordinates are the file's own; a drawing smaller than the canvas is centred on it, its feet on the bottom row. A drawing is
// at most 32x48 (32x52 if it is drawn out to its edges, `toEdge`).
// Sizes are kept true to each other: one pixel is the same size on every body, so the human is drawn the tallest.

export interface Material {
  /** The same id on two bodies keeps the picked colour when the body changes ("fur", "eyes"). */
  id: string;
  name: string;
  hexes: string[];
  layers?: string[];
  /** First and last row, both counted. */
  rows?: [number, number];
  at?: [number, number][];
}

export interface Choice {
  id: string;
  name: string;
  layers: string[];
}

export interface BodyOption {
  id: string;
  name: string;
  /** The first is what the body has until the user picks. */
  choices: Choice[];
}

export interface Body {
  id: string;
  name: string;
  /** Its file in assets/character/, without ".aseprite". */
  file: string;
  /** Layers never drawn: the drawn shadow (the page draws one), drafts. */
  skip?: string[];
  /**
   * Drawn out to the canvas's edges (the dragon, cut off at the bottom): it stays on the stage's floor instead of being
   * lifted off it, and the stage has no room at its sides, so it fills the box's whole width.
   */
  toEdge?: boolean;
  options?: BodyOption[];
  materials: Material[];
}

const NONE = (id = "none"): Choice => ({ id, name: "None", layers: [] });

/** The boar's apron: its purple, and the jacket's dark and the shirt's reds where they are drawn on it. */
const APRON = ["#4A2755", "#140B26", "#80354D", "#5A2238"];

export const BODIES: Body[] = [
  {
    id: "bunny",
    name: "Bunny",
    file: "40x15_bunnyman_user",
    skip: ["shadow"],
    options: [
      {
        id: "hat",
        name: "Hat",
        choices: [
          { id: "tilted", name: "Tilted hat", layers: ["headwear Copy"] },
          { id: "upright", name: "Upright hat", layers: ["headwear"] },
          NONE(),
        ],
      },
      {
        id: "shirt",
        name: "Front",
        choices: [
          { id: "white", name: "White shirt", layers: ["torso Copy"] },
          { id: "red", name: "Buttoned up", layers: ["torso"] },
        ],
      },
    ],
    materials: [
      { id: "fur", name: "Fur", hexes: ["#3F394D", "#140B26"], layers: ["back", "ears", "head", "outer"] },
      { id: "eyes", name: "Eyes", hexes: ["#F4F2E6"], layers: ["head"] },
      { id: "markings", name: "Nose & ear tips", hexes: ["#F4F2E6", "#C9C2B2", "#BB9E8E"], layers: ["back", "ears", "head"] },
      { id: "coat", name: "Coat", hexes: ["#A63A3A", "#6B2228", "#C9605A", "#451115"], layers: ["torso", "torso Copy", "outer"] },
      { id: "shirt", name: "Shirt", hexes: ["#F4F2E6", "#C9C2B2"], layers: ["torso", "torso Copy"] },
      { id: "trousers", name: "Trousers", hexes: ["#140B26"], layers: ["torso", "torso Copy"] },
      // A gap in the white shirt's trousers shows the boots' layer under it: still the trouser leg.
      { id: "trousers", name: "Trousers", hexes: ["#140B26"], layers: ["legs"], at: [[22, 43]] },
      { id: "fur", name: "Fur", hexes: ["#3F394D"], layers: ["legs"] },
      { id: "boots", name: "Boots", hexes: ["#140B26"], layers: ["legs"] },
      { id: "hat", name: "Hat", hexes: ["#A63A3A", "#6B2228", "#C9605A"], layers: ["headwear", "headwear Copy"] },
    ],
  },
  {
    // The user's human (40x15_default_user), drawn again bigger, every piece on a layer of its own.
    id: "human",
    name: "Human",
    file: "48x32_human_v2",
    options: [
      {
        id: "hair",
        name: "Hair",
        choices: [
          { id: "messy", name: "Messy", layers: ["hair messy"] },
          { id: "long", name: "Long", layers: ["hair long"] },
          { id: "bob", name: "Bob", layers: ["hair bob"] },
          { id: "bun", name: "Bun", layers: ["hair bun"] },
          { id: "short", name: "Short", layers: ["hair short"] },
          { id: "bald", name: "Bald", layers: [] },
        ],
      },
      {
        id: "beard",
        name: "Beard",
        choices: [
          NONE(),
          { id: "stubble", name: "Stubble", layers: ["stubble"] },
          { id: "moustache", name: "Moustache", layers: ["moustache"] },
          { id: "full", name: "Full beard", layers: ["beard"] },
        ],
      },
      {
        id: "top",
        name: "Top",
        choices: [
          { id: "hoodie", name: "Hoodie", layers: ["hoodie"] },
          { id: "shirt", name: "T-shirt", layers: ["shirt"] },
          { id: "dress", name: "Dress", layers: ["dress"] },
          { id: "coat", name: "Long coat", layers: ["coat"] },
        ],
      },
      {
        id: "bottoms",
        name: "Bottoms",
        choices: [
          { id: "shorts", name: "Shorts", layers: ["shorts"] },
          { id: "trousers", name: "Trousers", layers: ["trousers"] },
          { id: "skirt", name: "Skirt", layers: ["skirt"] },
        ],
      },
    ],
    materials: [
      // Stubble is a shade of the skin, so it suits any skin colour.
      { id: "skin", name: "Skin", hexes: ["#D9B089", "#C99960", "#B1866A"], layers: ["body", "stubble"] },
      { id: "eyes", name: "Eyes", hexes: ["#6A87C2"], layers: ["body"] },
      { id: "hair", name: "Hair", hexes: ["#683931", "#41261D"], layers: ["hair messy", "hair long", "hair bob", "hair bun", "hair short", "beard", "moustache"] },
      // The old ids, so a colour picked for the first human's sweater and shorts stays.
      { id: "sweater", name: "Top", hexes: ["#722120", "#591D1B", "#91282C", "#4F1616"], layers: ["hoodie", "shirt", "dress", "coat"] },
      { id: "shorts", name: "Bottoms", hexes: ["#353536", "#3D3D3D", "#242425"], layers: ["shorts", "trousers", "skirt"] },
      { id: "socks", name: "Socks", hexes: ["#722120"], layers: ["socks"] },
      { id: "shoes", name: "Shoes", hexes: ["#353536", "#3D3D3D"], layers: ["shoes"] },
    ],
  },
  {
    id: "whitecat",
    name: "White cat",
    file: "40x15_whitecat_user",
    materials: [
      { id: "cloak", name: "Cloak", hexes: ["#CBDBFC", "#93AFE9", "#6A87C2"], layers: ["Layer 6"] },
      { id: "cloak", name: "Cloak", hexes: ["#6A87C2"], layers: ["Layer 3 Copy Copy Copy"] },
      { id: "fur", name: "Fur", hexes: ["#FFFFFF", "#CBDBFC", "#9AA2D4"] },
      { id: "eyes", name: "Eyes", hexes: ["#9FACC8"] },
      { id: "markings", name: "Nose", hexes: ["#3F3F74"] },
      { id: "scarf", name: "Scarf", hexes: ["#D9A066", "#EEC39A"] },
      { id: "boots", name: "Boots", hexes: ["#45283C", "#311F2B"] },
    ],
  },
  {
    id: "boar",
    name: "Boar",
    file: "48x32_boar_user_v2",
    skip: ["shadow"],
    options: [{ id: "horns", name: "Horns", choices: [{ id: "curly", name: "Curly horns", layers: ["headwear"] }, NONE()] }],
    materials: [
      { id: "fur", name: "Fur", hexes: ["#80354D", "#5A2238"], layers: ["head"] },
      { id: "eyes", name: "Eyes", hexes: ["#140B26"], layers: ["head"] },
      { id: "markings", name: "Snout", hexes: ["#BB9E8E", "#94736E"], layers: ["head"] },
      { id: "horns", name: "Horns", hexes: ["#E1D3B4", "#747064"], layers: ["headwear"] },
      { id: "collar", name: "Ruff", hexes: ["#F4F2E6", "#C9C2B2"], layers: ["outer"] },
      // The stripes are the rows across the chest; the jacket is only the arms (the folded one across the belly too); the rest is apron,
      // its dark lines (the jacket's colour) and the red under the stripes with it.
      { id: "shirt", name: "Stripes", hexes: ["#80354D", "#5A2238"], layers: ["torso"], rows: [0, 25] },
      { id: "apron", name: "Apron", hexes: APRON, layers: ["torso"], at: [[12, 27], [12, 28], [12, 29], [22, 27], [22, 28], [23, 29], [8, 34], [8, 35]] },
      { id: "coat", name: "Jacket", hexes: ["#140B26"], layers: ["torso"] },
      { id: "apron", name: "Apron", hexes: APRON, layers: ["torso"] },
      { id: "trousers", name: "Trousers", hexes: ["#140B26", "#3F394D"], layers: ["legs"] },
    ],
  },
  {
    id: "deer",
    name: "Deer",
    file: "48x32_deer_v1",
    skip: ["shadow"],
    options: [{ id: "hair", name: "Hair", choices: [{ id: "long", name: "Long hair", layers: ["hair"] }, NONE()] }],
    materials: [
      { id: "fur", name: "Fur", hexes: ["#BB9E8E", "#94736E"], layers: ["head", "torso", "legs"] },
      { id: "eyes", name: "Eyes", hexes: ["#140B26"], layers: ["head"] },
      { id: "markings", name: "Nose", hexes: ["#8E5C57"], layers: ["head"] },
      { id: "horns", name: "Antlers", hexes: ["#5E6B58"], layers: ["head"] },
      { id: "hair", name: "Hair", hexes: ["#80354D", "#5A2238"], layers: ["hair"] },
      { id: "scarf", name: "Neckerchief", hexes: ["#80354D", "#5A2238"], layers: ["torso", "outer"] },
      { id: "shirt", name: "Shirt", hexes: ["#F4F2E6", "#9C9585"], layers: ["torso"] },
      { id: "shorts", name: "Shorts", hexes: ["#84937B", "#5E6B58"], layers: ["torso"] },
      { id: "socks", name: "Socks", hexes: ["#564A62", "#3F394D"], layers: ["legs"] },
      { id: "shoes", name: "Shoes", hexes: ["#6A3570"], layers: ["legs"] },
    ],
  },
  {
    id: "frog",
    name: "Frog",
    file: "48x32_frog_v1",
    skip: ["shadow"],
    materials: [
      { id: "fur", name: "Skin", hexes: ["#80354D", "#A35468", "#5A2238"], layers: ["head"] },
      { id: "eyes", name: "Eyes", hexes: ["#140B26"], layers: ["head"], rows: [16, 16] },
      { id: "collar", name: "Collar", hexes: ["#F4F2E6", "#9C9585"], layers: ["outer"] },
      { id: "coat", name: "Robe", hexes: ["#3F394D", "#564A62", "#140B26"], layers: ["torso"] },
      { id: "trousers", name: "Legs", hexes: ["#140B26"], layers: ["legs"] },
      { id: "shoes", name: "Shoes", hexes: ["#4A2755"], layers: ["legs"] },
    ],
  },
  {
    id: "sheep",
    name: "Sheep",
    file: "48x32_sheep_v1",
    skip: ["shadow"],
    materials: [
      { id: "eyes", name: "Eyes", hexes: ["#F4F2E6"], layers: ["head"], at: [[18, 17]] },
      { id: "wool", name: "Wool", hexes: ["#F4F2E6", "#C9C2B2", "#9C9585"], layers: ["head"] },
      { id: "fur", name: "Face", hexes: ["#564A62", "#3F394D"], layers: ["head"] },
      { id: "fur", name: "Face", hexes: ["#564A62"], layers: ["torso"] },
      { id: "fur", name: "Face", hexes: ["#564A62", "#3F394D"], layers: ["legs"] },
      { id: "shirt", name: "Collar", hexes: ["#F4F2E6"], layers: ["torso"] },
      { id: "coat", name: "Coat", hexes: ["#140B26", "#3F394D"], layers: ["torso"] },
      { id: "shoes", name: "Shoes", hexes: ["#140B26"], layers: ["legs"] },
    ],
  },
  {
    id: "wolf",
    name: "Wolf",
    file: "48x32_wolf_v2",
    options: [{ id: "tail", name: "Tail", choices: [{ id: "bushy", name: "Bushy tail", layers: ["back"] }, NONE()] }],
    materials: [
      { id: "eyes", name: "Eyes", hexes: ["#140B26"], layers: ["head"], at: [[23, 13], [19, 14]] },
      { id: "fur", name: "Fur", hexes: ["#F4F2E6", "#C9C2B2", "#9C9585"], layers: ["head", "back"] },
      { id: "fur", name: "Fur", hexes: ["#F4F2E6", "#9C9585"], layers: ["outer"] },
      { id: "coat", name: "Coat", hexes: ["#3F394D", "#2A2238", "#564A62", "#140B26"], layers: ["torso", "outer"] },
      { id: "shirt", name: "Collar", hexes: ["#F4F2E6", "#C9C2B2"], layers: ["torso"] },
      { id: "buttons", name: "Buttons", hexes: ["#9C9585"], layers: ["torso"] },
      { id: "trousers", name: "Trousers", hexes: ["#2A2238", "#140B26", "#3F394D"], layers: ["legs"] },
    ],
  },
  {
    id: "dragon",
    name: "Dragon",
    file: "48x32_dragon_v1",
    toEdge: true,
    materials: [
      // The eyes are the two light pink pixels; the near-black ones on the snout are its nostrils, and scales.
      { id: "eyes", name: "Eyes", hexes: ["#A74D4D"], layers: ["Layer 6"] },
      // The horns' dark red, down to their roots on the head; under that row the same red outlines the head.
      { id: "horns", name: "Horns", hexes: ["#411414"], rows: [0, 7] },
      { id: "fur", name: "Scales", hexes: ["#803535", "#80354D", "#541C1C", "#451010", "#411414", "#2D0D0D"] },
    ],
  },
];

export const BODY_BY_ID = new Map(BODIES.map((body) => [body.id, body]));

export interface Look {
  v: 2;
  body: string;
  /** option id → choice id; an option left out has its first choice. */
  options: Record<string, string>;
  /** material id → "#RRGGBB"; a material left out is as drawn. */
  colors: Record<string, string>;
}

/** The user's red mage bunny, until they make another. */
export const DEFAULT_LOOK: Look = { v: 2, body: "bunny", options: {}, colors: {} };

/** The body of a look, the default one if it is gone. */
export const bodyOf = (look: Look) => BODY_BY_ID.get(look.body) ?? BODY_BY_ID.get(DEFAULT_LOOK.body)!;

/** The choice a look has made for an option. */
export const choiceOf = (look: Look, option: BodyOption) => option.choices.find((c) => c.id === look.options[option.id]) ?? option.choices[0];

/** A body's materials one per id, in the order first listed: the colour rows of the creator. */
export function materialsOf(body: Body): Material[] {
  const seen = new Map<string, Material>();
  for (const material of body.materials) if (!seen.has(material.id)) seen.set(material.id, material);
  return [...seen.values()];
}
