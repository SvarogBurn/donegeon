// The characters a user can be. Each is one of the user's own drawings in assets/character/ or, drawn since the
// wardrobe came to the animals, assets/character/body2/ (exported to parts.data.json with `npm run parts`), whole, so
// bodies can be as different as a bunny, a boar and a human. Every body but the dragon also has the human's clothes
// drawn again on it, fitted to its build, under the human's layer names and hexes (`outfit`, `OUTFIT_MATERIALS`), its
// own outfit first. What can change is listed here:
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
  /** Its file in assets/character/ or assets/character/body2/, without ".aseprite". */
  file: string;
  /** Layers never drawn: the drawn shadow (the page draws one), drafts. */
  skip?: string[];
  /**
   * Drawn out to the canvas's edges (the dragon, cut off at the bottom): it stays on the stage's floor instead of being
   * lifted off it. Its stage is as big as every other body's, and it is zoomed in to fill it (CharacterSprite's `cover`).
   */
  toEdge?: boolean;
  options?: BodyOption[];
  materials: Material[];
  face?: Face;
}

export interface Face {
  /** Its file in assets/character/faces/ or assets/character/body2/faces/, without ".aseprite". */
  file: string;
  /**
   * Its own materials, under the body's ids, where it is drawn in other hexes or on other layers than the body; else
   * the body's are used.
   */
  materials?: Material[];
}

const NONE = (id = "none"): Choice => ({ id, name: "None", layers: [] });

/** The bunny's ears, hanging (its own) and up (the user's, 2026-10-21), each with the ear behind its head. */
const BUNNY_EARS = ["ears", "back ear", "ears up", "back ear up"];

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

// The human's clothes and things, which every body but the dragon has: each drawn again on that body under the same
// layer name in the same hexes, so one choice and one colour fit them all. A body's own outfit comes first.
const TOPS: Choice[] = [
  { id: "hoodie", name: "Hoodie", layers: ["hoodie"] },
  { id: "shirt", name: "T-shirt", layers: ["shirt"] },
  { id: "blouse", name: "Blouse", layers: ["blouse"] },
  { id: "dress", name: "Dress", layers: ["dress"] },
  { id: "coat", name: "Long coat", layers: ["coat"] },
  // The frog's robe, drawn again on every other body (2026-10-21, the user's ask).
  { id: "robe", name: "Robe", layers: ["robe"] },
];
const BOTTOMS: Choice[] = [
  { id: "shorts", name: "Shorts", layers: ["shorts"] },
  { id: "trousers", name: "Trousers", layers: ["trousers"] },
  { id: "skirt", name: "Skirt", layers: ["skirt"] },
  { id: "overalls", name: "Overalls", layers: ["overalls"] },
];
const SOCKS: Choice[] = [{ id: "plain", name: "Socks", layers: ["socks"] }, { id: "striped", name: "Striped socks", layers: ["socks stripes horizontal"] }];
const SHOES: Choice[] = [
  { id: "shoes", name: "Shoes", layers: ["shooes normal"] },
  { id: "boots", name: "Boots", layers: ["shooes boots"] },
  { id: "flats", name: "Flats", layers: ["shoes flats"] },
  { id: "none", name: "Barefoot", layers: [] },
];
/** The hat every body has; the human's first two are the bunny's own, which keeps its own instead. */
const TOP_HAT: Choice = { id: "tophat", name: "Top hat", layers: ["top hat"] };
const HATS: Choice[] = [{ id: "fancy", name: "Fancy hat", layers: ["headwear fancy hat"] }, { id: "fedora", name: "Fedora", layers: ["headwear fedora"] }, TOP_HAT];
/** The frog's collar, drawn again on every other body (2026-10-21, the user's ask). */
const SCARVES: Choice[] = [{ id: "ruffle", name: "Ruffled collar", layers: ["collar ruffle"] }];
const GLASSES: Choice[] = [
  { id: "glasses2", name: "Round glasses", layers: ["glasses 2"] },
  { id: "sunglasses", name: "Sunglasses", layers: ["sunglasses"] },
];
const HELD_LAYERS = ["held sword", "held dagger", "held laptop", "held pencil", "held gun", "held staff", "held bow"];

/** What the far hand holds; the dragon's claw too. */
const HELD: BodyOption = {
  id: "held",
  name: "In hand",
  choices: [
    NONE(),
    { id: "sword", name: "Sword", layers: ["held sword"] },
    { id: "dagger", name: "Dagger", layers: ["held dagger"] },
    { id: "gun", name: "Gun", layers: ["held gun"] },
    { id: "bow", name: "Bow", layers: ["held bow"] },
    { id: "staff", name: "Staff", layers: ["held staff"] },
    { id: "laptop", name: "Laptop", layers: ["held laptop"] },
    { id: "pencil", name: "Pencil", layers: ["held pencil"] },
  ],
};

/** A body's own pieces, first in their option, so a body is drawn as it always was until the user picks. */
interface Own {
  /** Its own hats, instead of the human's first two (the bunny's are the very hats the human was given). */
  hat?: Choice[];
  top?: Choice[];
  /** A scarf, collar or ruff of its own, which can come off. */
  scarf?: Choice[];
  /** May start with None: bare fur under a cloak. */
  bottoms?: Choice[];
  /** Its own socks, or "none": no socks until picked. */
  socks?: Choice[] | "none";
  shoes?: Choice[];
  /** The human's nose ring, which fits no snout. */
  nosering?: boolean;
  /** The half-rim glasses ("Glasses 1"), which only the human and the frog keep (the user's call). */
  halfRims?: boolean;
  /** Layers of the shared clothes it doesn't have (the boar's shoes and flats, which didn't fit it; the deer's robe). */
  without?: string[];
  /** Only these options (the mice in their coat wear a hat and glasses and hold things, nothing else). */
  only?: string[];
}

/** The clothes and things a body can wear and hold, its own first. */
function outfit(own: Own = {}): BodyOption[] {
  const socks = own.socks === "none" ? [NONE(), ...SOCKS] : [...(own.socks ?? []), ...SOCKS, NONE()];
  const options: BodyOption[] = [
    { id: "hat", name: "Hat", choices: own.hat ? [...own.hat, TOP_HAT, NONE()] : [NONE(), ...HATS] },
    { id: "top", name: "Top", choices: [...(own.top ?? []), ...TOPS] },
    { id: "scarf", name: "Scarf", choices: own.scarf ? [...own.scarf, ...SCARVES, NONE()] : [NONE(), ...SCARVES] },
    { id: "bottoms", name: "Bottoms", choices: [...(own.bottoms ?? []), ...BOTTOMS] },
    { id: "socks", name: "Socks", choices: socks },
    { id: "shoes", name: "Shoes", choices: [...(own.shoes ?? []), ...SHOES] },
    {
      id: "jewellery",
      name: "Jewellery",
      choices: [
        NONE(),
        { id: "choker", name: "Choker", layers: ["neckwear choker"] },
        ...(own.nosering ? [{ id: "nosering", name: "Nose ring", layers: ["jewlery nosering"] }] : []),
      ],
    },
    {
      id: "glasses",
      name: "Glasses",
      choices: [NONE(), ...(own.halfRims ? [{ id: "glasses1", name: "Half rims", layers: ["glasses 1"] }] : []), ...GLASSES],
    },
    {
      id: "cane",
      name: "Cane",
      choices: [NONE(), { id: "metal", name: "Metal cane", layers: ["metal cane"] }, { id: "fancy", name: "Fancy cane", layers: ["fancy cane"] }],
    },
    HELD,
  ];
  const without = new Set(own.without ?? []);
  return options
    .filter((o) => !own.only || own.only.includes(o.id))
    .map((o) => ({ ...o, choices: o.choices.filter((c) => !c.layers.some((l) => without.has(l))) }));
}

/** The held things' colours: the blades' steel, the hilts in the fancy cane's golds, the laptop's case, the pencil's
 * yellow, the gun's barrel, the staff's wood and gem, the bow. The grips' wrap, the screen and its code, the pencil's
 * wood, band and eraser, the gun's stock and brass, the bow's string stay as drawn. */
const HELD_MATERIALS: Material[] = [
  { id: "blade", name: "Blade", hexes: ["#8E97A3", "#C3C9CF", "#5E6672"], layers: ["held sword", "held dagger"] },
  { id: "handle", name: "Handle", hexes: ["#9F651D", "#6C4310"], layers: ["held sword", "held dagger"] },
  { id: "laptop", name: "Laptop", hexes: ["#4F535C", "#33363D"], layers: ["held laptop"] },
  { id: "pencil", name: "Pencil", hexes: ["#EBC04A", "#C4962E"], layers: ["held pencil"] },
  { id: "gun", name: "Gun", hexes: ["#5B616B", "#3B3F47"], layers: ["held gun"] },
  { id: "staff", name: "Staff", hexes: ["#9C7A52", "#6E5236"], layers: ["held staff"] },
  { id: "gem", name: "Gem", hexes: ["#6FB3D2", "#B9E3F0", "#3F7C9E"], layers: ["held staff"] },
  { id: "bow", name: "Bow", hexes: ["#A87E4E", "#74532F"], layers: ["held bow"] },
];

/** The colours of the shared clothes, as drawn on every body (ids `sweater` and `shorts` kept from the first human). */
const OUTFIT_MATERIALS: Material[] = [
  { id: "sweater", name: "Top", hexes: ["#722120", "#591D1B", "#91282C", "#4F1616"], layers: ["hoodie", "shirt", "dress", "coat"] },
  // The blouse is drawn white.
  { id: "sweater", name: "Top", hexes: ["#E7DEDE", "#FFFFFF", "#D6C9C9"], layers: ["blouse"] },
  { id: "robe", name: "Robe", hexes: ["#3F394D", "#564A62", "#140B26"], layers: ["robe"] },
  { id: "ruffle", name: "Collar", hexes: ["#F4F2E6", "#9C9585"], layers: ["collar ruffle"] },
  // The overalls' two buttons are drawn in a skin shade; they stay as drawn.
  { id: "shorts", name: "Bottoms", hexes: ["#353536", "#3D3D3D", "#242425", "#19191D"], layers: ["shorts", "trousers", "skirt", "overalls"] },
  { id: "socks", name: "Socks", hexes: ["#722120"], layers: ["socks", "socks stripes horizontal"] },
  { id: "stripes", name: "Stripes", hexes: ["#A63A3A"], layers: ["socks stripes horizontal"] },
  { id: "shoes", name: "Shoes", hexes: ["#353536", "#3D3D3D"], layers: ["shooes normal", "shooes boots", "shoes flats"] },
  { id: "hat", name: "Hat", hexes: ["#A63A3A", "#6B2228", "#C9605A"], layers: ["headwear fancy hat", "headwear fedora"] },
  // The top hat's band stays red.
  { id: "hat", name: "Hat", hexes: ["#2A2630", "#3E3846", "#55505E"], layers: ["top hat"] },
  { id: "jewellery", name: "Jewellery", hexes: ["#3D3D3D"], layers: ["neckwear choker"] },
  // The sunglasses' lenses and their glint stay as drawn.
  { id: "glasses", name: "Glasses", hexes: ["#2B2B2B"], layers: ["glasses 1", "glasses 2", "sunglasses"] },
  // The fancy cane's gold handle is a colour of its own; its dark tip goes with the stick.
  { id: "handle", name: "Handle", hexes: ["#9F651D", "#6C4310"], layers: ["fancy cane"] },
  { id: "cane", name: "Cane", hexes: ["#5E5858", "#333030"], layers: ["metal cane"] },
  { id: "cane", name: "Cane", hexes: ["#524E49", "#2D1C08"], layers: ["fancy cane"] },
  ...HELD_MATERIALS,
];

/**
 * A body with the shared colours added after its own, each limited to the layers its options can draw (a body without
 * glasses 1, the boar without the human's shoes, the dragon with only things to hold).
 */
function withWardrobe(body: Body): Body {
  const drawn = new Set((body.options ?? []).flatMap((o) => o.choices.flatMap((c) => c.layers)));
  const shared = OUTFIT_MATERIALS.flatMap((m) => {
    const layers = m.layers!.filter((l) => drawn.has(l));
    return layers.length ? [{ ...m, layers }] : [];
  });
  return { ...body, materials: [...body.materials, ...shared] };
}

/** The dragon's own layers, so its colours don't reach the held things. */
const DRAGON = ["Flattened", "Layer 1", "Layer 2"];

/** The glasses on a face that has materials of its own. */
const FACE_GLASSES: Material = { id: "glasses", name: "Glasses", hexes: ["#2B2B2B"], layers: ["glasses 1", "glasses 2", "sunglasses"] };
/** On a dark face or dark fur (the bunny's, the sheep's) the glasses and the sunglasses are drawn light, the lenses lighter. */
const LIGHT_GLASSES: Material = { id: "glasses", name: "Glasses", hexes: ["#C9C2B2"], layers: ["glasses 2", "sunglasses"] };

export const BODIES: Body[] = ([
  {
    id: "bunny",
    name: "Bunny",
    // v4: the user's v2 as they left it (thicker, stronger legs; their touches to the tops; the buttoned coat gone;
    // ears that stand up as well as its own hanging ones), over the user's red mage (40x15_bunnyman_user); the bottoms,
    // socks and shoes fitted again to the new legs, its coat and sleeves one layer.
    file: "40x15_bunnyman_v4",
    face: {
      file: "21x21_bunny_face_v4",
      materials: [
        { id: "fur", name: "Fur", hexes: ["#3F394D", "#2C2638", "#140B26", "#544D64"], layers: ["face"] },
        { id: "eyes", name: "Eyes", hexes: ["#F7F2F4"], layers: ["face"] },
        { id: "markings", name: "Nose & ear tips", hexes: ["#F4F2E6", "#C9C2B2", "#D2A4BA"], layers: ["face"] },
        LIGHT_GLASSES,
      ],
    },
    options: [
      {
        id: "ears",
        name: "Ears",
        choices: [
          { id: "down", name: "Hanging ears", layers: ["ears", "back ear"] },
          { id: "up", name: "Ears up", layers: ["ears up", "back ear up"] },
        ],
      },
      ...outfit({
        hat: [
          { id: "tilted", name: "Tilted hat", layers: ["headwear Copy"] },
          { id: "upright", name: "Upright hat", layers: ["headwear"] },
        ],
        top: [{ id: "own", name: "Red mage coat", layers: ["bunny coat"] }],
        bottoms: [{ id: "own", name: "Its trousers", layers: ["bunny trousers"] }],
        socks: "none",
        shoes: [{ id: "own", name: "Its boots", layers: ["bunny boots"] }],
      }),
    ],
    materials: [
      // The hand over a held thing is fur.
      { id: "fur", name: "Fur", hexes: ["#3F394D", "#140B26", "#2C2638"], layers: [...BUNNY_EARS, "head", "body", ...HELD_LAYERS] },
      // Its near hand, drawn at the end of its sleeve on the coat's layer.
      { id: "fur", name: "Fur", hexes: ["#3F394D", "#140B26"], layers: ["bunny coat"], at: [[11, 31], [12, 31], [13, 31], [12, 32], [13, 32]] },
      { id: "eyes", name: "Eyes", hexes: ["#F4F2E6"], layers: ["head"] },
      { id: "markings", name: "Nose & ear tips", hexes: ["#F4F2E6", "#C9C2B2", "#BB9E8E"], layers: [...BUNNY_EARS, "head"] },
      { id: "coat", name: "Coat", hexes: ["#A63A3A", "#6B2228", "#C9605A", "#451115"], layers: ["bunny coat"] },
      { id: "shirt", name: "Shirt", hexes: ["#F4F2E6", "#C9C2B2"], layers: ["bunny coat"] },
      { id: "trousers", name: "Trousers", hexes: ["#140B26"], layers: ["bunny coat", "bunny trousers"] },
      // A gap in the trousers shows the boots' layer under it: still the trouser leg.
      { id: "trousers", name: "Trousers", hexes: ["#140B26"], layers: ["bunny boots"], at: [[22, 43]] },
      { id: "boots", name: "Boots", hexes: ["#140B26"], layers: ["bunny boots"] },
      { id: "hat", name: "Hat", hexes: ["#A63A3A", "#6B2228", "#C9605A"], layers: ["headwear", "headwear Copy"] },
      LIGHT_GLASSES,
    ],
  },
  {
    // The user's human (40x15_default_user), drawn again bigger, every piece on a layer of its own over a whole skin body
    // (v3: v2 with the held things; v5: the robe, the ruffled collar, a top hat, sunglasses, a gun, a staff, a bow).
    id: "human",
    name: "Human",
    file: "48x32_human_v5",
    // Its layers and hexes are the body's: the body's materials fit it.
    face: { file: "21x21_human_face_v3" },
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
      ...outfit({ nosering: true, halfRims: true }),
    ],
    materials: [
      // Stubble and the noses are shades of the skin, so they suit any skin colour; the hand over a held thing is skin.
      { id: "skin", name: "Skin", hexes: ["#D9B089", "#C99960", "#B1866A", "#A86666"], layers: ["body", "stubble", ...HUMAN_NOSES, ...HELD_LAYERS] },
      // Only the iris: the whites and the dark lashes over some of the eyes stay as drawn.
      { id: "eyes", name: "Eyes", hexes: ["#6A87C2"], layers: HUMAN_EYES },
      { id: "hair", name: "Hair", hexes: ["#683931", "#41261D", "#522A23", "#2D1912"], layers: HUMAN_HAIR },
      { id: "jewellery", name: "Jewellery", hexes: ["#3D3D3D"], layers: ["jewlery nosering"] },
      // Ears and tails share the animals' "fur", so a fur colour picked on one carries over. On the ears only the lighter
      // grey is fur: the darker one is the inside of the bunny's and the cat's (the puppy's hang, inside hidden), which
      // shares the bunny's "markings" (its ear tips).
      { id: "fur", name: "Ears & tail", hexes: ["#3D3D3D"], layers: HUMAN_EARS },
      { id: "fur", name: "Ears & tail", hexes: ["#3D3D3D", "#353536"], layers: HUMAN_TAILS },
      { id: "markings", name: "Inner ears", hexes: ["#353536"], layers: HUMAN_EARS },
      { id: "horns", name: "Horns", hexes: ["#3D3D3D"], layers: ["deco horns"] },
    ],
  },
  {
    id: "whitecat",
    name: "White cat",
    // v2: the user's (40x15_whitecat_user), every pixel kept, moved onto a 32x48 canvas (5 right, 7 down: where the app
    // centred it) over a fur body that shows nowhere past it; its cloak, scarf and boots on layers of their own.
    // v4: the robe, the ruffled collar, the top hat, sunglasses, the new things to hold; no half rims.
    file: "40x15_whitecat_v4",
    face: { file: "21x21_cat_face_v4" },
    options: outfit({
      // Its near paw comes out of the cloak, under two of the cloak's folds.
      top: [{ id: "own", name: "Cloak", layers: ["cat cloak", "cat paw", "cat cloak front"] }],
      scarf: [{ id: "own", name: "Scarf", layers: ["cat scarf"] }],
      bottoms: [NONE()],
      socks: "none",
      shoes: [{ id: "own", name: "Its boots", layers: ["cat boots"] }],
    }),
    materials: [
      { id: "cloak", name: "Cloak", hexes: ["#CBDBFC", "#93AFE9", "#6A87C2"], layers: ["cat cloak"] },
      { id: "cloak", name: "Cloak", hexes: ["#6A87C2"], layers: ["cat cloak front"] },
      // Its face is drawn in these hexes on a layer named "head".
      { id: "fur", name: "Fur", hexes: ["#FFFFFF", "#CBDBFC", "#9AA2D4"], layers: ["back", "body", "head", "cat paw", ...HELD_LAYERS] },
      { id: "eyes", name: "Eyes", hexes: ["#9FACC8"], layers: ["head"] },
      { id: "markings", name: "Nose", hexes: ["#3F3F74"], layers: ["head"] },
      { id: "scarf", name: "Scarf", hexes: ["#D9A066", "#EEC39A"], layers: ["cat scarf"] },
      { id: "boots", name: "Boots", hexes: ["#45283C", "#311F2B"], layers: ["cat boots"] },
    ],
  },
  {
    id: "boar",
    name: "Boar",
    // v3: the user's (48x32_boar_user_v2), every pixel kept, over a fur body that shows nowhere past it; its apron and
    // jacket, ruff, trousers and shoes on layers of their own.
    // v4: the user's v3 as they left it (its body and own shoes touched up, the human's shoes and flats taken out:
    // they didn't fit it), with the new clothes.
    file: "48x32_boar_v5",
    // Its layers and hexes are the body's: the body's materials fit it.
    face: { file: "21x21_boar_face_v4" },
    options: [
      { id: "horns", name: "Horns", choices: [{ id: "curly", name: "Curly horns", layers: ["headwear"] }, NONE()] },
      ...outfit({
        top: [{ id: "own", name: "Apron & jacket", layers: ["boar apron"] }],
        scarf: [{ id: "own", name: "Ruff", layers: ["boar ruff"] }],
        bottoms: [{ id: "own", name: "Its trousers", layers: ["boar trousers"] }],
        socks: "none",
        shoes: [{ id: "own", name: "Its shoes", layers: ["boar shoes"] }],
        without: ["shooes normal", "shoes flats"],
      }),
    ],
    materials: [
      { id: "fur", name: "Fur", hexes: ["#80354D", "#5A2238"], layers: ["head", "body", ...HELD_LAYERS] },
      { id: "eyes", name: "Eyes", hexes: ["#140B26"], layers: ["head"] },
      { id: "markings", name: "Snout", hexes: ["#BB9E8E", "#94736E"], layers: ["head"] },
      { id: "horns", name: "Horns", hexes: ["#E1D3B4", "#747064"], layers: ["headwear"] },
      { id: "collar", name: "Ruff", hexes: ["#F4F2E6", "#C9C2B2"], layers: ["boar ruff"] },
      // The stripes are the rows across the chest; the jacket is only the arms (the folded one across the belly too); the rest is apron,
      // its dark lines (the jacket's colour) and the red under the stripes with it.
      { id: "shirt", name: "Stripes", hexes: ["#80354D", "#5A2238"], layers: ["boar apron"], rows: [0, 25] },
      { id: "apron", name: "Apron", hexes: APRON, layers: ["boar apron"], at: [[12, 27], [12, 28], [12, 29], [22, 27], [22, 28], [23, 29], [8, 34], [8, 35]] },
      { id: "coat", name: "Jacket", hexes: ["#140B26"], layers: ["boar apron"] },
      { id: "apron", name: "Apron", hexes: APRON, layers: ["boar apron"] },
      { id: "trousers", name: "Trousers", hexes: ["#140B26", "#3F394D"], layers: ["boar trousers"] },
      { id: "boots", name: "Shoes", hexes: ["#140B26"], layers: ["boar shoes"] },
    ],
  },
  {
    id: "deer",
    name: "Deer",
    // v3: v1 again, to the pixel (the user: v2 "looks disfigured and taken apart", the human's build forced on it), its
    // clothes split into layers over a fur body; the human's clothes fitted to its own build: a front view, thin arms
    // a pixel from its body (a sleeve covers both as one piece), thin legs, both feet on the floor. v4: the user fixed
    // its overalls; every other piece closed over its body the same way (a leg is two pixels, so is a boot), its tiny
    // hand closing round what it holds, which goes behind its head.
    file: "48x32_deer_v4",
    // Its layers and hexes are the body's: the body's materials fit it.
    face: { file: "21x21_deer_face_v4" },
    options: [
      { id: "hair", name: "Hair", choices: [{ id: "long", name: "Long hair", layers: ["hair"] }, NONE()] },
      ...outfit({
        top: [{ id: "own", name: "Its shirt", layers: ["deer shirt"] }],
        scarf: [{ id: "own", name: "Neckerchief", layers: ["deer scarf"] }],
        bottoms: [{ id: "own", name: "Its shorts", layers: ["deer shorts"] }],
        socks: [{ id: "own", name: "Its socks", layers: ["deer socks"] }],
        shoes: [{ id: "own", name: "Its shoes", layers: ["deer shoes"] }],
        // The robe doesn't suit it (the user's call).
        without: ["robe"],
      }),
    ],
    materials: [
      { id: "fur", name: "Fur", hexes: ["#BB9E8E", "#94736E"], layers: ["head", "body", ...HELD_LAYERS] },
      { id: "eyes", name: "Eyes", hexes: ["#140B26"], layers: ["head"] },
      { id: "markings", name: "Nose", hexes: ["#8E5C57"], layers: ["head"] },
      { id: "horns", name: "Antlers", hexes: ["#5E6B58"], layers: ["head"] },
      { id: "hair", name: "Hair", hexes: ["#80354D", "#5A2238"], layers: ["hair"] },
      { id: "scarf", name: "Neckerchief", hexes: ["#80354D", "#5A2238"], layers: ["deer scarf"] },
      { id: "shirt", name: "Shirt", hexes: ["#F4F2E6", "#9C9585"], layers: ["deer shirt"] },
      { id: "shorts", name: "Shorts", hexes: ["#84937B", "#5E6B58"], layers: ["deer shorts"] },
      { id: "socks", name: "Socks", hexes: ["#564A62", "#3F394D"], layers: ["deer socks"] },
      { id: "shoes", name: "Shoes", hexes: ["#6A3570"], layers: ["deer shoes"] },
    ],
  },
  {
    id: "frog",
    name: "Frog",
    // v3: v1's head, robe, collar, tights and shoes as they were, over a skin body (the human's, fitted to the frog:
    // squat, both feet on the floor). Its robe and collar are the ones every other body now has; it keeps the half rims.
    file: "48x32_frog_v4",
    face: {
      file: "21x21_frog_face_v4",
      materials: [
        { id: "fur", name: "Skin", hexes: ["#80354D", "#A35468", "#5A2238"], layers: ["head"] },
        // The pupils; the mouth is drawn in the same dark.
        { id: "eyes", name: "Eyes", hexes: ["#140B26"], at: [[6, 7], [14, 7]] },
        FACE_GLASSES,
      ],
    },
    options: outfit({
      top: [{ id: "own", name: "Robe", layers: ["frog robe"] }],
      scarf: [{ id: "own", name: "Collar", layers: ["frog collar"] }],
      bottoms: [{ id: "own", name: "Its tights", layers: ["frog tights"] }],
      socks: "none",
      shoes: [{ id: "own", name: "Its shoes", layers: ["frog shoes"] }],
      halfRims: true,
      without: ["robe", "collar ruffle"],
    }),
    materials: [
      { id: "fur", name: "Skin", hexes: ["#80354D", "#A35468", "#5A2238"], layers: ["head", "body", ...HELD_LAYERS] },
      { id: "eyes", name: "Eyes", hexes: ["#140B26"], layers: ["head"], rows: [16, 16] },
      { id: "collar", name: "Collar", hexes: ["#F4F2E6", "#9C9585"], layers: ["frog collar"] },
      { id: "coat", name: "Robe", hexes: ["#3F394D", "#564A62", "#140B26"], layers: ["frog robe"] },
      { id: "trousers", name: "Tights", hexes: ["#140B26"], layers: ["frog tights"] },
      { id: "shoes", name: "Shoes", hexes: ["#4A2755"], layers: ["frog shoes"] },
    ],
  },
  {
    id: "sheep",
    name: "Sheep",
    // v2: v1's head, coat and shoes as they were, over a body of wool on the chest and the dark face's colour on the
    // arms and legs (the human's, fitted to the sheep).
    // v3: both feet on the floor with its shoes and socks (the user: they didn't line up).
    file: "48x32_sheep_v4",
    face: {
      file: "21x21_sheep_face_v4",
      materials: [
        // The eyes are drawn in the wool's white.
        { id: "eyes", name: "Eyes", hexes: ["#F4F2E6"], at: [[7, 11], [13, 11]] },
        { id: "wool", name: "Wool", hexes: ["#F4F2E6", "#C9C2B2", "#9C9585"], layers: ["head"] },
        { id: "fur", name: "Face", hexes: ["#564A62", "#3F394D"], layers: ["head"] },
        LIGHT_GLASSES,
      ],
    },
    options: outfit({
      top: [{ id: "own", name: "Coat", layers: ["sheep coat"] }],
      bottoms: [NONE()],
      socks: "none",
      shoes: [{ id: "own", name: "Its shoes", layers: ["sheep shoes"] }],
    }),
    materials: [
      { id: "eyes", name: "Eyes", hexes: ["#F4F2E6"], layers: ["head"], at: [[18, 17]] },
      { id: "wool", name: "Wool", hexes: ["#F4F2E6", "#C9C2B2", "#9C9585"], layers: ["head", "body"] },
      { id: "fur", name: "Face", hexes: ["#564A62", "#3F394D"], layers: ["head", "body", ...HELD_LAYERS] },
      { id: "shirt", name: "Collar", hexes: ["#F4F2E6"], layers: ["sheep coat"] },
      { id: "coat", name: "Coat", hexes: ["#140B26", "#3F394D"], layers: ["sheep coat"] },
      { id: "shoes", name: "Shoes", hexes: ["#140B26"], layers: ["sheep shoes"] },
      LIGHT_GLASSES,
    ],
  },
  {
    id: "wolf",
    name: "Wolf",
    // v3: v2's head and greatcoat over a whole fur body (the human's, moved to the wolf's shoulders and floor), with the
    // human's clothes drawn on it; its trousers and boots drawn again on the new legs.
    // v5: the robe, the ruffled collar, the top hat, sunglasses, the new things to hold; no half rims.
    file: "48x32_wolf_v5",
    face: {
      file: "21x21_wolf_face_v4",
      materials: [
        // The nose is drawn in the same dark.
        { id: "eyes", name: "Eyes", hexes: ["#140B26"], at: [[7, 9], [13, 9]] },
        { id: "fur", name: "Fur", hexes: ["#F4F2E6", "#C9C2B2", "#9C9585"], layers: ["head"] },
        FACE_GLASSES,
      ],
    },
    options: [
      { id: "tail", name: "Tail", choices: [{ id: "bushy", name: "Bushy tail", layers: ["back"] }, NONE()] },
      ...outfit({
        top: [{ id: "own", name: "Greatcoat", layers: ["wolf coat"] }],
        bottoms: [{ id: "own", name: "Its trousers", layers: ["wolf trousers"] }],
        socks: "none",
        shoes: [{ id: "own", name: "Its boots", layers: ["wolf boots"] }],
      }),
    ],
    materials: [
      { id: "eyes", name: "Eyes", hexes: ["#140B26"], layers: ["head"], at: [[23, 13], [19, 14]] },
      // The hand over a held thing is fur.
      { id: "fur", name: "Fur", hexes: ["#F4F2E6", "#C9C2B2", "#9C9585"], layers: ["head", "back", "body", ...HELD_LAYERS] },
      { id: "coat", name: "Coat", hexes: ["#3F394D", "#2A2238", "#564A62", "#140B26"], layers: ["wolf coat"] },
      { id: "shirt", name: "Collar", hexes: ["#F4F2E6", "#C9C2B2"], layers: ["wolf coat"] },
      { id: "buttons", name: "Buttons", hexes: ["#9C9585"], layers: ["wolf coat"] },
      { id: "trousers", name: "Trousers", hexes: ["#2A2238", "#140B26", "#3F394D"], layers: ["wolf trousers"] },
      { id: "boots", name: "Boots", hexes: ["#140B26", "#2A2238"], layers: ["wolf boots"] },
    ],
  },
  {
    id: "mice",
    name: "Three mice",
    // Drawn 2026-10-21 (the user's ask): three mice stacked in a trenchcoat, one under a hat, two looking out of the
    // coat's front, a tail out of its hem. The coat is them: they wear a hat and glasses and hold things, nothing else.
    file: "48x32_mice_v2",
    // Its layers and hexes are the body's: the body's materials fit it.
    face: { file: "21x21_mice_face_v2" },
    options: outfit({ hat: [{ id: "own", name: "Its hat", layers: ["mice hat"] }, ...HATS.slice(0, 2)], only: ["hat", "glasses", "held"] }),
    materials: [
      { id: "fur", name: "Fur", hexes: ["#8C7B70", "#6B5C52", "#6E6058", "#54483F"], layers: ["head", "mice", "mice paws", ...HELD_LAYERS] },
      { id: "eyes", name: "Eyes", hexes: ["#140B26"], layers: ["head", "mice"] },
      { id: "markings", name: "Ears, noses & tail", hexes: ["#D9A0A0", "#E8B4B4", "#D98C98"], layers: ["head", "mice", "back"] },
      // The belt and its buckle stay as drawn.
      { id: "coat", name: "Trenchcoat", hexes: ["#B8955E", "#8F7144", "#D1B07A", "#6E5432", "#3A2C1E"], layers: ["mice coat"] },
      { id: "hat", name: "Hat", hexes: ["#2A2630", "#3E3846", "#55505E"], layers: ["mice hat"] },
      { id: "shoes", name: "Shoes", hexes: ["#3A2C1E"], layers: ["body"] },
    ],
  },
  {
    id: "dragon",
    name: "Dragon",
    // The user's v1 body with the head of its face (21x21_dragon_face_v4) on it; v4 adds the held things in its claw,
    // v5 the gun, the staff and the bow.
    // It wears nothing: the held things are all it has of the outfit.
    file: "48x32_dragon_v5",
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
    options: [HELD],
    materials: [
      // The glowing eyes; the near-black on the snout is its nostrils, and scales. Its fangs stay as drawn.
      { id: "eyes", name: "Eyes", hexes: ["#D9756B"], layers: DRAGON },
      // The horns' dark red, down to their roots on the head; under that row the same red outlines the head.
      { id: "horns", name: "Horns", hexes: ["#411414", "#5C2424"], layers: DRAGON, rows: [0, 6] },
      // The claw over a held thing is scales.
      { id: "fur", name: "Scales", hexes: ["#803535", "#80354D", "#A74D4D", "#6E2828", "#541C1C", "#451010", "#411414", "#2D0D0D"], layers: [...DRAGON, ...HELD_LAYERS] },
    ],
  },
] as Body[]).map(withWardrobe);

export const BODY_BY_ID = new Map(BODIES.map((body) => [body.id, body]));

export interface Look {
  v: 2;
  body: string;
  /** option id → choice id; an option left out has its first choice. */
  options: Record<string, string>;
  /** material id → "#RRGGBB"; a material left out is as drawn. */
  colors: Record<string, string>;
}

/** The user's human, with each option's first choice, until they make another. */
export const DEFAULT_LOOK: Look = { v: 2, body: "human", options: {}, colors: {} };

/** The body of a look, the default one if it is gone. */
export const bodyOf = (look: Look) => BODY_BY_ID.get(look.body) ?? BODY_BY_ID.get(DEFAULT_LOOK.body)!;

/** The choice a look has made for an option. */
export const choiceOf = (look: Look, option: BodyOption) => option.choices.find((c) => c.id === look.options[option.id]) ?? option.choices[0];

/** A body's materials one per id, in the order first listed. */
export function materialsOf(body: Body): Material[] {
  const seen = new Map<string, Material>();
  for (const material of body.materials) if (!seen.has(material.id)) seen.set(material.id, material);
  return [...seen.values()];
}

/**
 * The materials of what a look has on, one per id (the first one drawn: the white blouse's, not the red tops'): the
 * creator's colour rows. A material on layers no choice of the look draws (a hat taken off, socks not worn) has none;
 * a colour picked for it stays.
 */
export function materialsWorn(body: Body, look: Look): Material[] {
  const optional = new Set<string>();
  const shown = new Set<string>();
  for (const option of body.options ?? []) {
    for (const choice of option.choices) choice.layers.forEach((l) => optional.add(l));
    choiceOf(look, option).layers.forEach((l) => shown.add(l));
  }
  const worn = (m: Material) => !m.layers || m.layers.some((l) => !optional.has(l) || shown.has(l));
  const seen = new Map<string, Material>();
  for (const material of body.materials) if (!seen.has(material.id) && worn(material)) seen.set(material.id, material);
  return [...seen.values()];
}
