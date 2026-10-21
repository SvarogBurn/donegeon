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
// A body may have a face (assets/character/faces/, 21x21), shown in the task bar instead of the user icon: its layers
// are named like the body's, so the same choices show its hair, glasses and ears (a hat has no layer there, so it is
// never shown), and the colours picked for the body recolour it.

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
  face?: Face;
}

export interface Face {
  /** Its file in assets/character/faces/, without ".aseprite". */
  file: string;
  /**
   * Its own materials, under the body's ids, where it is drawn in other hexes or on other layers than the body; else
   * the body's are used.
   */
  materials?: Material[];
}

const NONE = (id = "none"): Choice => ({ id, name: "None", layers: [] });

/** The boar's apron: its purple, and the jacket's dark and the shirt's reds where they are drawn on it. */
const APRON = ["#4A2755", "#140B26", "#80354D", "#5A2238"];

/** Every layer drawn in the human's hair colour: the hairstyles, the fringes and the beards. */
const HUMAN_HAIR = [
  ...["messy", "messy shorter", "short", "short 2", "punk", "bob", "bun", "ponytail", "low pony", "loose", "long loose straight"].map((h) => `hair ${h}`),
  "curly", "afro",
  ...[1, 2, 3, 4, 5, 6].map((n) => `Hair front ${n}`),
  "beard", "beard flatter", "moustache",
];
const HUMAN_EYES = [1, 2, 3, 4, 5].map((n) => `eyes ${n}`);
const HUMAN_NOSES = [1, 2, 3, 4, 5].map((n) => `nose ${n}`);
const HUMAN_EARS = ["bunny", "cat", "puppy"].map((a) => `deco ${a} headwear`);
const HUMAN_TAILS = ["bunny", "cat", "puppy", "bushy", "cow", "dragon"].map((a) => `deco ${a} tail`);

export const BODIES: Body[] = [
  {
    id: "bunny",
    name: "Bunny",
    file: "40x15_bunnyman_user",
    skip: ["shadow"],
    face: {
      file: "21x21_bunny_face_v1",
      materials: [
        { id: "fur", name: "Fur", hexes: ["#3F394D", "#2C2638", "#140B26", "#544D64"] },
        { id: "eyes", name: "Eyes", hexes: ["#F7F2F4"] },
        { id: "markings", name: "Nose & ear tips", hexes: ["#F4F2E6", "#C9C2B2", "#D2A4BA"] },
      ],
    },
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
    // The user's human (40x15_default_user), drawn again bigger, every piece on a layer of its own over a whole skin body.
    id: "human",
    name: "Human",
    file: "48x32_human_v2",
    // Its layers and hexes are the body's: the body's materials fit it.
    face: { file: "21x21_human_face_v1" },
    options: [
      {
        // Eyes 1 is what the body had drawn on it before the eyes were layers of their own.
        id: "eyes",
        name: "Eyes",
        choices: HUMAN_EYES.map((layer, i) => ({ id: `eyes${i + 1}`, name: `Eyes ${i + 1}`, layers: [layer] })),
      },
      {
        id: "nose",
        name: "Nose",
        choices: [NONE(), ...HUMAN_NOSES.map((layer, i) => ({ id: `nose${i + 1}`, name: `Nose ${i + 1}`, layers: [layer] }))],
      },
      {
        id: "hair",
        name: "Hair",
        choices: [
          { id: "messy", name: "Messy", layers: ["hair messy"] },
          { id: "messyShort", name: "Messy short", layers: ["hair messy shorter"] },
          { id: "short", name: "Short", layers: ["hair short"] },
          { id: "swept", name: "Swept", layers: ["hair short 2"] },
          { id: "punk", name: "Punk", layers: ["hair punk"] },
          { id: "bob", name: "Bob", layers: ["hair bob"] },
          { id: "bun", name: "Bun", layers: ["hair bun"] },
          { id: "ponytail", name: "Ponytail", layers: ["hair ponytail"] },
          { id: "lowPony", name: "Low ponytail", layers: ["hair low pony"] },
          { id: "loose", name: "Loose", layers: ["hair loose"] },
          { id: "long", name: "Long", layers: ["hair long loose straight"] },
          { id: "curly", name: "Curly", layers: ["curly"] },
          { id: "afro", name: "Afro", layers: ["afro"] },
          { id: "bald", name: "Bald", layers: [] },
        ],
      },
      {
        id: "fringe",
        name: "Fringe",
        choices: [NONE(), ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: `front${n}`, name: `Fringe ${n}`, layers: [`Hair front ${n}`] }))],
      },
      {
        id: "beard",
        name: "Beard",
        choices: [
          NONE(),
          { id: "stubble", name: "Stubble", layers: ["stubble"] },
          { id: "moustache", name: "Moustache", layers: ["moustache"] },
          { id: "full", name: "Full beard", layers: ["beard"] },
          { id: "flat", name: "Short beard", layers: ["beard flatter"] },
        ],
      },
      {
        id: "hat",
        name: "Hat",
        choices: [NONE(), { id: "fancy", name: "Fancy hat", layers: ["headwear fancy hat"] }, { id: "fedora", name: "Fedora", layers: ["headwear fedora"] }],
      },
      {
        id: "ears",
        name: "Ears",
        choices: [
          NONE(),
          { id: "bunny", name: "Bunny ears", layers: ["deco bunny headwear"] },
          { id: "cat", name: "Cat ears", layers: ["deco cat headwear"] },
          { id: "puppy", name: "Puppy ears", layers: ["deco puppy headwear"] },
        ],
      },
      { id: "horns", name: "Horns", choices: [NONE(), { id: "curly", name: "Horns", layers: ["deco horns"] }] },
      {
        id: "tail",
        name: "Tail",
        choices: [
          NONE(),
          { id: "bunny", name: "Bunny tail", layers: ["deco bunny tail"] },
          { id: "cat", name: "Cat tail", layers: ["deco cat tail"] },
          { id: "puppy", name: "Puppy tail", layers: ["deco puppy tail"] },
          { id: "bushy", name: "Bushy tail", layers: ["deco bushy tail"] },
          { id: "cow", name: "Cow tail", layers: ["deco cow tail"] },
          { id: "dragon", name: "Dragon tail", layers: ["deco dragon tail"] },
        ],
      },
      {
        id: "top",
        name: "Top",
        choices: [
          { id: "hoodie", name: "Hoodie", layers: ["hoodie"] },
          { id: "shirt", name: "T-shirt", layers: ["shirt"] },
          { id: "blouse", name: "Blouse", layers: ["blouse"] },
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
          { id: "overalls", name: "Overalls", layers: ["overalls"] },
        ],
      },
      {
        id: "socks",
        name: "Socks",
        choices: [{ id: "plain", name: "Socks", layers: ["socks"] }, { id: "striped", name: "Striped socks", layers: ["socks stripes horizontal"] }, NONE()],
      },
      {
        id: "shoes",
        name: "Shoes",
        choices: [
          { id: "shoes", name: "Shoes", layers: ["shooes normal"] },
          { id: "boots", name: "Boots", layers: ["shooes boots"] },
          { id: "flats", name: "Flats", layers: ["shoes flats"] },
          { id: "none", name: "Barefoot", layers: [] },
        ],
      },
      {
        id: "jewellery",
        name: "Jewellery",
        choices: [
          NONE(),
          { id: "choker", name: "Choker", layers: ["neckwear choker"] },
          { id: "nosering", name: "Nose ring", layers: ["jewlery nosering"] },
        ],
      },
      {
        id: "glasses",
        name: "Glasses",
        choices: [NONE(), { id: "glasses1", name: "Glasses 1", layers: ["glasses 1"] }, { id: "glasses2", name: "Glasses 2", layers: ["glasses 2"] }],
      },
      {
        id: "cane",
        name: "Cane",
        choices: [NONE(), { id: "metal", name: "Metal cane", layers: ["metal cane"] }, { id: "fancy", name: "Fancy cane", layers: ["fancy cane"] }],
      },
    ],
    materials: [
      // Stubble and the noses are shades of the skin, so they suit any skin colour.
      { id: "skin", name: "Skin", hexes: ["#D9B089", "#C99960", "#B1866A", "#A86666"], layers: ["body", "stubble", ...HUMAN_NOSES] },
      // Only the iris: the whites and the dark lashes over some of the eyes stay as drawn.
      { id: "eyes", name: "Eyes", hexes: ["#6A87C2"], layers: HUMAN_EYES },
      { id: "hair", name: "Hair", hexes: ["#683931", "#41261D", "#522A23", "#2D1912"], layers: HUMAN_HAIR },
      // The old ids, so a colour picked for the first human's sweater and shorts stays. The blouse is drawn white.
      { id: "sweater", name: "Top", hexes: ["#722120", "#591D1B", "#91282C", "#4F1616"], layers: ["hoodie", "shirt", "dress", "coat"] },
      { id: "sweater", name: "Top", hexes: ["#E7DEDE", "#FFFFFF", "#D6C9C9"], layers: ["blouse"] },
      // The overalls' two buttons are drawn in a skin shade; they stay as drawn.
      { id: "shorts", name: "Bottoms", hexes: ["#353536", "#3D3D3D", "#242425", "#19191D"], layers: ["shorts", "trousers", "skirt", "overalls"] },
      { id: "socks", name: "Socks", hexes: ["#722120"], layers: ["socks", "socks stripes horizontal"] },
      { id: "stripes", name: "Stripes", hexes: ["#A63A3A"], layers: ["socks stripes horizontal"] },
      { id: "shoes", name: "Shoes", hexes: ["#353536", "#3D3D3D"], layers: ["shooes normal", "shooes boots", "shoes flats"] },
      { id: "hat", name: "Hat", hexes: ["#A63A3A", "#6B2228", "#C9605A"], layers: ["headwear fancy hat", "headwear fedora"] },
      // Ears and tails share the animals' "fur", so a fur colour picked on one carries over. On the ears only the lighter
      // grey is fur: the darker one is the inside of the bunny's and the cat's (the puppy's hang, inside hidden), which
      // shares the bunny's "markings" (its ear tips).
      { id: "fur", name: "Ears & tail", hexes: ["#3D3D3D"], layers: HUMAN_EARS },
      { id: "fur", name: "Ears & tail", hexes: ["#3D3D3D", "#353536"], layers: HUMAN_TAILS },
      { id: "markings", name: "Inner ears", hexes: ["#353536"], layers: HUMAN_EARS },
      { id: "horns", name: "Horns", hexes: ["#3D3D3D"], layers: ["deco horns"] },
      { id: "jewellery", name: "Jewellery", hexes: ["#3D3D3D"], layers: ["neckwear choker", "jewlery nosering"] },
      { id: "glasses", name: "Glasses", hexes: ["#2B2B2B"], layers: ["glasses 1", "glasses 2"] },
      // The fancy cane's gold handle is a colour of its own; its dark tip goes with the stick.
      { id: "handle", name: "Handle", hexes: ["#9F651D", "#6C4310"], layers: ["fancy cane"] },
      { id: "cane", name: "Cane", hexes: ["#5E5858", "#333030"], layers: ["metal cane"] },
      { id: "cane", name: "Cane", hexes: ["#524E49", "#2D1C08"], layers: ["fancy cane"] },
    ],
  },
  {
    id: "whitecat",
    name: "White cat",
    file: "40x15_whitecat_user",
    face: { file: "21x21_cat_face_v1" },
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
    // Its layers and hexes are the body's: the body's materials fit it.
    face: { file: "21x21_boar_face_v1" },
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
    // Its layers and hexes are the body's: the body's materials fit it.
    face: { file: "21x21_deer_face_v1" },
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
    face: {
      file: "21x21_frog_face_v1",
      materials: [
        { id: "fur", name: "Skin", hexes: ["#80354D", "#A35468", "#5A2238"] },
        // The pupils; the mouth is drawn in the same dark.
        { id: "eyes", name: "Eyes", hexes: ["#140B26"], at: [[6, 7], [14, 7]] },
      ],
    },
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
    face: {
      file: "21x21_sheep_face_v1",
      materials: [
        // The eyes are drawn in the wool's white.
        { id: "eyes", name: "Eyes", hexes: ["#F4F2E6"], at: [[7, 11], [13, 11]] },
        { id: "wool", name: "Wool", hexes: ["#F4F2E6", "#C9C2B2", "#9C9585"] },
        { id: "fur", name: "Face", hexes: ["#564A62", "#3F394D"] },
      ],
    },
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
    face: {
      file: "21x21_wolf_face_v1",
      materials: [
        // The nose is drawn in the same dark.
        { id: "eyes", name: "Eyes", hexes: ["#140B26"], at: [[7, 9], [13, 9]] },
        { id: "fur", name: "Fur", hexes: ["#F4F2E6", "#C9C2B2", "#9C9585"] },
      ],
    },
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
    // The user's v1 body with the head of its face (21x21_dragon_face_v4) on it.
    file: "48x32_dragon_v3",
    toEdge: true,
    // Its fangs stay as drawn.
    face: {
      file: "21x21_dragon_face_v5",
      materials: [
        { id: "eyes", name: "Eyes", hexes: ["#D9756B"] },
        { id: "horns", name: "Horns", hexes: ["#411414", "#5C2424"] },
        { id: "fur", name: "Scales", hexes: ["#803535", "#6E2828", "#541C1C", "#2D0D0D"] },
      ],
    },
    materials: [
      // The glowing eyes; the near-black on the snout is its nostrils, and scales. Its fangs stay as drawn.
      { id: "eyes", name: "Eyes", hexes: ["#D9756B"] },
      // The horns' dark red, down to their roots on the head; under that row the same red outlines the head.
      { id: "horns", name: "Horns", hexes: ["#411414", "#5C2424"], rows: [0, 6] },
      { id: "fur", name: "Scales", hexes: ["#803535", "#80354D", "#A74D4D", "#6E2828", "#541C1C", "#451010", "#411414", "#2D0D0D"] },
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
