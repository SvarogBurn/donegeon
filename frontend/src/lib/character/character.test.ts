import { describe, expect, it } from "vitest";
import type { Completion, StatTask } from "../stats";
import { compose, composeFace, FACE, FLOOR, HEIGHT, LIFT, WIDTH, type PartsData } from "./compose";
import { expFor, levelOf, spanOf } from "./levels";
import { BODIES, BODY_BY_ID, DEFAULT_LOOK, materialsWorn, type Body, type Look, type Material } from "./bodies";
import facesData from "./faces.data.json";
import partsData from "./parts.data.json";
import { normalizeLook, normalizeProfile } from "./profile";
import { customStatValue, skillExp } from "./profileStats";
import { recolorRamp } from "./ramps";

describe("levelOf", () => {
  it("starts at level 1 with nothing done", () => {
    expect(levelOf(0)).toEqual({ level: 1, into: 0, span: 5 });
  });

  it("grows each level by 40%: a level takes round(5·1.4^(L−1))", () => {
    expect([1, 2, 3, 4, 10].map(spanOf)).toEqual([5, 7, 10, 14, 103]);
    expect([2, 3, 5, 10, 20, 30, 40].map(expFor)).toEqual([5, 12, 36, 247, 7459, 216071, 6250324]);
    expect(levelOf(4)).toEqual({ level: 1, into: 4, span: 5 });
    expect(levelOf(5)).toEqual({ level: 2, into: 0, span: 7 });
    expect(levelOf(11)).toEqual({ level: 2, into: 6, span: 7 });
    expect(levelOf(12)).toEqual({ level: 3, into: 0, span: 10 });
    expect(levelOf(216070).level).toBe(29);
    expect(levelOf(216071).level).toBe(30);
  });
});

const task = (id: string, extra: Partial<StatTask> = {}): StatTask => ({ id, listId: null, goalIds: [], tagIds: [], ...extra }) as StatTask;
const done = (t: StatTask, day: string): Completion => ({ day, task: t, at: null, isPress: false });

describe("custom stats and skills", () => {
  const today = "2026-10-19";
  const inBoth = task("both", { listId: "study", goalIds: ["exam"] });
  const inList = task("list", { listId: "study" });
  // A subtask carries the goals of the task above it (collectStats puts them on it).
  const inherited = task("sub", { listId: "home", goalIds: ["exam"] });
  const other = task("other", { listId: "home" });
  const completions = [done(inBoth, today), done(inList, "2026-10-18"), done(inherited, "2026-10-01"), done(other, today), done(inList, "2026-01-01")];

  it("counts a task in two of its sources once", () => {
    const stat = { id: "s", name: "INT", lists: ["study"], goals: ["exam"], tags: [], range: "all" as const };
    expect(customStatValue(stat, completions, today)).toBe(4);
  });

  it("counts only the days of its period, today included", () => {
    const stat = { id: "s", name: "INT", lists: ["study"], goals: ["exam"], tags: [], range: "7" as const };
    expect(customStatValue(stat, completions, today)).toBe(2);
    expect(customStatValue({ ...stat, range: "30" }, completions, today)).toBe(3);
  });

  it("gives a skill every task ever done in it", () => {
    expect(skillExp({ kind: "list", id: "study" }, completions)).toBe(3);
    expect(skillExp({ kind: "goal", id: "exam" }, completions)).toBe(2);
    expect(skillExp({ kind: "tag", id: "none" }, completions)).toBe(0);
  });
});

describe("normalizeProfile", () => {
  const known = { lists: new Set(["l1"]), goals: new Set(["g1"]), tags: new Set<string>() };

  it("fills in the defaults for nothing saved", () => {
    expect(normalizeProfile(null)).toEqual({ stats: ["streak", "longest", "year"], custom: [], skills: [] });
  });

  it("drops a name saved before: the character is called by the username", () => {
    expect(normalizeProfile({ name: "Hero", title: "Scholar", stats: [], custom: [], skills: [] })).toEqual({ title: "Scholar", stats: [], custom: [], skills: [] });
  });

  it("drops unknown stats, and lists, goals and tags that no longer exist", () => {
    const profile = normalizeProfile(
      {
        stats: ["streak", "bogus", "open"],
        custom: [{ id: "c", name: "STR", lists: ["l1", "gone"], goals: ["g1"], tags: ["t-gone"], range: "90", target: 20 }],
        skills: [{ kind: "list", id: "l1" }, { kind: "goal", id: "gone" }, { kind: "list", id: "l1" }],
      },
      known,
    );
    expect(profile.stats).toEqual(["streak", "open"]);
    expect(profile.custom).toEqual([{ id: "c", name: "STR", lists: ["l1"], goals: ["g1"], tags: [], range: "90", target: 20 }]);
    expect(profile.skills).toEqual([{ kind: "list", id: "l1" }]);
  });

  it("keeps a skill's own bar colour, and drops one that isn't a colour", () => {
    const profile = normalizeProfile({ stats: [], custom: [], skills: [{ kind: "list", id: "l1", color: "#AD61CB" }, { kind: "goal", id: "g1", color: "pink" }] }, known);
    expect(profile.skills).toEqual([{ kind: "list", id: "l1", color: "#ad61cb" }, { kind: "goal", id: "g1" }]);
  });

  it("keeps everything while the lists, goals and tags are still loading", () => {
    expect(normalizeProfile({ stats: [], custom: [], skills: [{ kind: "tag", id: "t" }] }).skills).toEqual([{ kind: "tag", id: "t" }]);
  });

  it("keeps a look's body, its own choices and real colours; anything else goes back to the default", () => {
    const look = normalizeLook({ v: 2, body: "boar", options: { horns: "none", hat: "tilted" }, colors: { fur: "#abcdef", eyes: "blue" } });
    expect(look).toEqual({ v: 2, body: "boar", options: { horns: "none" }, colors: { fur: "#ABCDEF" } });
    expect(normalizeLook({ v: 2, body: "griffin", options: {}, colors: {} })).toEqual(DEFAULT_LOOK);
    // A look saved before bodies (parts and slots) starts again from the default.
    expect(normalizeLook({ v: 1, parts: { head: "head-hare" }, colors: {} })).toEqual(DEFAULT_LOOK);
  });
});

describe("recolorRamp", () => {
  it("puts the picked colour on the base and keeps the other shades lighter or darker", () => {
    const map = recolorRamp(["#3F394D", "#564A62", "#2A2238"], "#C27A47");
    expect(map.get("#3F394D")).toBe("#C27A47");
    const light = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    expect(light(map.get("#564A62")!)).toBeGreaterThan(light("#C27A47"));
    expect(light(map.get("#2A2238")!)).toBeLessThan(light("#C27A47"));
  });

  it("leaves a ramp as drawn when the pick is its own base", () => {
    const map = recolorRamp(["#F4F2E6", "#C9C2B2"], "#f4f2e6");
    expect([...map.values()]).toEqual(["#F4F2E6", "#C9C2B2"]);
  });

  it("keeps a white pick's shadows apart from it", () => {
    const map = recolorRamp(["#3F394D", "#564A62", "#2A2238"], "#FFFFFF");
    expect(new Set(map.values()).size).toBe(3);
  });
});

/** For each option, the first choice that draws one of the material's layers. */
const showing = (body: Body, material: Material) =>
  Object.fromEntries(
    (body.options ?? []).flatMap((o) => {
      const choice = o.choices.find((c) => c.layers.some((l) => material.layers?.includes(l)));
      return choice ? [[o.id, choice.id]] : [];
    }),
  );

describe("bodies", () => {
  const data = partsData as unknown as PartsData;

  it("each is a drawing in assets/character, with the layers its options name", () => {
    for (const body of BODIES) {
      const drawing = data[body.file];
      expect(drawing, body.file).toBeDefined();
      const layers = new Set(drawing.layers.map((l) => l.name));
      for (const option of body.options ?? []) for (const choice of option.choices) for (const layer of choice.layers) expect(layers.has(layer), `${body.id} ${layer}`).toBe(true);
      for (const material of body.materials) for (const layer of material.layers ?? []) expect(layers.has(layer), `${body.id} ${material.id} ${layer}`).toBe(true);
    }
  });

  it("every material changes something when a colour is picked for it", () => {
    for (const body of BODIES) {
      const allShown: Look = { v: 2, body: body.id, options: {}, colors: {} };
      const plain = compose(allShown, data);
      for (const material of body.materials) {
        // Shown with the choice that draws its layers, if an option holds them.
        const options = showing(body, material);
        const before = compose({ ...allShown, options }, data);
        const after = compose({ ...allShown, options, colors: { [material.id]: "#00FF00" } }, data);
        expect(before.map((p) => p.fill).join() !== after.map((p) => p.fill).join(), `${body.id} ${material.id} (${material.layers ?? "all"})`).toBe(true);
      }
      expect(plain.length).toBeGreaterThan(30);
    }
  });

  it("stands a smaller drawing in the middle of the canvas, lifted off its bottom; one drawn to its edges stays down", () => {
    const cat = compose({ v: 2, body: "whitecat", options: {}, colors: {} }, data);
    expect(Math.max(...cat.map((p) => p.y))).toBe(FLOOR);
    expect(Math.min(...cat.map((p) => p.x))).toBeGreaterThanOrEqual(5);
    const dragon = compose({ v: 2, body: "dragon", options: {}, colors: {} }, data);
    expect(Math.max(...dragon.map((p) => p.y))).toBe(HEIGHT - 1);
  });

  it("fits every drawing on the canvas: lifted ones above the floor, one drawn to its edges whole", () => {
    for (const body of BODIES) {
      const drawing = data[body.file];
      expect(drawing.width, body.id).toBeLessThanOrEqual(32);
      expect(drawing.height, body.id).toBeLessThanOrEqual(body.toEdge ? HEIGHT : HEIGHT - LIFT);
    }
  });

  it("draws the human taller than every animal but the dragon", () => {
    const height = (body: string) => {
      const pixels = compose({ v: 2, body, options: {}, colors: {} }, data);
      return Math.max(...pixels.map((p) => p.y)) - Math.min(...pixels.map((p) => p.y)) + 1;
    };
    const human = height("human");
    for (const body of BODIES) if (body.id !== "human" && body.id !== "dragon") expect(height(body.id), body.id).toBeLessThan(human);
  });

  const BUNNY: Look = { v: 2, body: "bunny", options: {}, colors: {} };

  it("draws the chosen hat and not the other", () => {
    const tilted = compose(BUNNY, data);
    const none = compose({ ...BUNNY, options: { hat: "none" } }, data);
    const upright = compose({ ...BUNNY, options: { hat: "upright" } }, data);
    expect(none.length).toBeLessThan(tilted.length);
    expect(upright.map((p) => p.fill).join()).not.toBe(tilted.map((p) => p.fill).join());
  });

  it("dresses every animal in the human's clothes instead of its own", () => {
    const fills = (look: Look) => compose(look, data).map((p) => p.fill);
    const wolf: Look = { v: 2, body: "wolf", options: {}, colors: {} };
    expect(fills(wolf)).toContain("#564A62");
    expect(fills({ ...wolf, options: { top: "shirt", bottoms: "skirt", shoes: "flats" } })).not.toContain("#564A62");
    for (const body of BODIES) {
      const has = (id: string, choice: string) => body.options?.some((o) => o.id === id && o.choices.some((c) => c.id === choice));
      const look: Look = { v: 2, body: body.id, options: {}, colors: {} };
      if (has("top", "shirt")) expect(fills({ ...look, options: { top: "shirt" } }), body.id).toContain("#722120");
      if (has("bottoms", "trousers")) expect(fills({ ...look, options: { bottoms: "trousers" } }), body.id).toContain("#3D3D3D");
    }
  });

  it("lets the mice take their coat off and go bare-headed until a hat is picked", () => {
    const fills = (look: Look) => compose(look, data).map((p) => p.fill);
    const mice: Look = { v: 2, body: "mice", options: {}, colors: {} };
    expect(fills(mice)).toContain("#B88C58");
    expect(fills(mice)).not.toContain("#2A2630");
    expect(fills({ ...mice, options: { hat: "own" } })).toContain("#2A2630");
    expect(fills({ ...mice, options: { top: "none" } })).not.toContain("#B88C58");
  });

  it("draws the user's cat and the first deer as they were drawn until something else is picked", () => {
    const at = (pixels: { x: number; y: number; w: number; fill: string }[]) => {
      const out = new Map<string, string>();
      for (const p of pixels) for (let i = 0; i < p.w; i++) out.set(`${p.x + i},${p.y}`, p.fill);
      return [...out].sort().join();
    };
    for (const [id, old] of [["whitecat", "40x15_whitecat_user"], ["deer", "48x32_deer_v1"]]) {
      // The old drawing as the app drew it: its visible layers but the drawn shadow, centred, lifted off the floor.
      const drawing = data[old];
      const dx = Math.floor((WIDTH - drawing.width) / 2);
      const dy = HEIGHT - LIFT - drawing.height;
      const before = drawing.layers.filter((l) => l.visible && l.name !== "shadow").flatMap((l) => l.runs.map(([x, y, w, fill]) => ({ x: x + dx, y: y + dy, w, fill })));
      expect(at(compose({ v: 2, body: id, options: {}, colors: {} }, data)), id).toBe(at(before));
    }
  });

  it("keeps every piece the user drew or changed in the bunny, the boar and the deer", () => {
    const runs = (file: string, layer: string) => JSON.stringify(data[file].layers.find((l) => l.name === layer)?.runs);
    const kept: [string, string, string[]][] = [
      ["40x15_bunnyman_v2", "40x15_bunnyman_v4", ["back ear", "back ear up", "body", "bunny trousers", "bunny boots", "head", "ears", "ears up", "headwear", "headwear Copy", "hoodie", "shirt", "blouse"]],
      ["48x32_boar_v3", "48x32_boar_v5", ["body", "boar shoes", "boar trousers", "boar apron", "boar ruff", "head", "headwear", "hoodie", "shirt", "dress", "coat", "shooes boots"]],
      ["48x32_deer_v3", "48x32_deer_v4", ["overalls", "body", "head", "hair", "deer shirt", "deer shorts", "deer socks", "deer shoes", "deer scarf"]],
    ];
    for (const [before, after, layers] of kept) for (const layer of layers) expect(runs(after, layer), `${after} ${layer}`).toBe(runs(before, layer));
  });

  it("puts the chosen thing in the hand of every body, the dragon's too", () => {
    const holders = BODIES.filter((body) => body.options?.some((o) => o.id === "held"));
    expect(holders).toEqual(BODIES);
    for (const body of holders) {
      const look: Look = { v: 2, body: body.id, options: {}, colors: {} };
      const empty = compose(look, data).map((p) => `${p.x},${p.y},${p.w}${p.fill}`).join();
      for (const held of ["sword", "dagger", "gun", "bow", "staff", "laptop", "pencil"]) {
        const holding = compose({ ...look, options: { held } }, data).map((p) => `${p.x},${p.y},${p.w}${p.fill}`).join();
        expect(holding, `${body.id} ${held}`).not.toBe(empty);
      }
    }
  });

  it("offers colours only for what the look has on", () => {
    const wolf = BODY_BY_ID.get("wolf")!;
    const ids = (look: Look) => materialsWorn(BODY_BY_ID.get(look.body)!, look).map((m) => m.id);
    const own: Look = { v: 2, body: "wolf", options: {}, colors: {} };
    expect(ids(own)).toEqual(expect.arrayContaining(["fur", "eyes", "coat", "trousers", "boots"]));
    for (const id of ["sweater", "socks", "hat", "glasses", "blade", "laptop"]) expect(ids(own)).not.toContain(id);
    const dressed = ids({ ...own, options: { top: "hoodie", held: "sword" } });
    expect(dressed).toEqual(expect.arrayContaining(["sweater", "blade", "handle", "trousers"]));
    expect(dressed).not.toContain("coat");
    const blouse = materialsWorn(BODY_BY_ID.get("human")!, { ...own, body: "human", options: { top: "blouse" } }).find((m) => m.id === "sweater");
    expect(blouse?.hexes[0]).toBe("#E7DEDE");
    expect(materialsWorn(wolf, own).length).toBeLessThan(wolf.materials.length);
  });

  it("recolours only what the material claims: the bunny's fur, not its coat", () => {
    const plain = compose(BUNNY, data);
    const furred = compose({ ...BUNNY, colors: { fur: "#C27A47" } }, data);
    const count = (pixels: { fill: string; w: number }[], hex: string) => pixels.filter((p) => p.fill === hex).reduce((n, p) => n + p.w, 0);
    expect(count(furred, "#A63A3A")).toBe(count(plain, "#A63A3A"));
    expect(count(furred, "#C27A47")).toBeGreaterThan(50);
  });
});

describe("faces", () => {
  const faces = facesData as unknown as PartsData;
  const withFace = BODIES.filter((body) => body.face);
  const fills = (look: Look) => composeFace(look, faces)!.map((p) => `${p.x},${p.y},${p.w}${p.fill}`).join();

  it("each is a drawing in assets/character/faces, 21x21 at most, its layers named like its body's", () => {
    expect(withFace).toEqual(BODIES);
    for (const body of withFace) {
      const drawing = faces[body.face!.file];
      expect(drawing, body.face!.file).toBeDefined();
      expect(drawing.width).toBeLessThanOrEqual(FACE);
      expect(drawing.height).toBeLessThanOrEqual(FACE);
      // A layer that isn't always shown must be one a choice of the body names, or nothing would ever show it.
      const chosen = new Set((body.options ?? []).flatMap((o) => o.choices.flatMap((c) => c.layers)));
      for (const layer of drawing.layers) expect(layer.visible || chosen.has(layer.name), `${body.id} ${layer.name}`).toBe(true);
    }
  });

  it("every material of its own changes something when a colour is picked for it", () => {
    for (const body of withFace) {
      for (const material of body.face!.materials ?? []) {
        // Shown with the choice that draws its layers (the glasses), if an option holds them.
        const look: Look = { v: 2, body: body.id, options: showing(body, material), colors: {} };
        expect(fills({ ...look, colors: { [material.id]: "#00FF00" } }), `${body.id} ${material.id}`).not.toBe(fills(look));
      }
    }
  });

  it("shows the human's chosen hair, glasses and ears in the body's colours, and never a hat", () => {
    const human: Look = { v: 2, body: "human", options: {}, colors: {} };
    const dressed: Look = { ...human, options: { hair: "afro", glasses: "glasses2", ears: "cat", beard: "full" } };
    expect(fills(dressed)).not.toBe(fills(human));
    expect(fills({ ...dressed, options: { ...dressed.options, hat: "fedora" } })).toBe(fills(dressed));
    for (const id of ["hair", "skin", "eyes", "glasses", "fur"]) {
      expect(fills({ ...dressed, colors: { [id]: "#00FF00" } }), id).not.toBe(fills(dressed));
    }
  });

  it("shows the boar's horns and the deer's hair only when chosen", () => {
    for (const [body, option] of [["boar", "horns"], ["deer", "hair"]]) {
      const look: Look = { v: 2, body, options: {}, colors: {} };
      expect(fills({ ...look, options: { [option]: "none" } }), body).not.toBe(fills(look));
    }
  });
});
