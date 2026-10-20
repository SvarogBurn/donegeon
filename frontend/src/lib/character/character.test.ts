import { describe, expect, it } from "vitest";
import type { Completion, StatTask } from "../stats";
import { compose, FLOOR, HEIGHT, LIFT, type PartsData } from "./compose";
import { expFor, levelOf } from "./levels";
import { BODIES, DEFAULT_LOOK, type Look } from "./bodies";
import partsData from "./parts.data.json";
import { normalizeLook, normalizeProfile } from "./profile";
import { customStatValue, skillExp } from "./profileStats";
import { recolorRamp } from "./ramps";

describe("levelOf", () => {
  it("starts at level 1 with nothing done", () => {
    expect(levelOf(0)).toEqual({ level: 1, into: 0, span: 5 });
  });

  it("reaches each level at 5·L(L−1)/2 exp, and a level takes 5·L", () => {
    expect([2, 3, 5, 10, 20, 30].map(expFor)).toEqual([5, 15, 50, 225, 950, 2175]);
    expect(levelOf(4)).toEqual({ level: 1, into: 4, span: 5 });
    expect(levelOf(5)).toEqual({ level: 2, into: 0, span: 10 });
    expect(levelOf(14)).toEqual({ level: 2, into: 9, span: 10 });
    expect(levelOf(15)).toEqual({ level: 3, into: 0, span: 15 });
    expect(levelOf(2174).level).toBe(29);
    expect(levelOf(2175).level).toBe(30);
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
        const options = Object.fromEntries(
          (body.options ?? []).flatMap((o) => {
            const choice = o.choices.find((c) => c.layers.some((l) => material.layers?.includes(l)));
            return choice ? [[o.id, choice.id]] : [];
          }),
        );
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

  it("draws the chosen hat and not the other", () => {
    const tilted = compose(DEFAULT_LOOK, data);
    const none = compose({ ...DEFAULT_LOOK, options: { hat: "none" } }, data);
    const upright = compose({ ...DEFAULT_LOOK, options: { hat: "upright" } }, data);
    expect(none.length).toBeLessThan(tilted.length);
    expect(upright.map((p) => p.fill).join()).not.toBe(tilted.map((p) => p.fill).join());
  });

  it("recolours only what the material claims: the bunny's fur, not its coat", () => {
    const plain = compose(DEFAULT_LOOK, data);
    const furred = compose({ ...DEFAULT_LOOK, colors: { fur: "#C27A47" } }, data);
    const count = (pixels: { fill: string; w: number }[], hex: string) => pixels.filter((p) => p.fill === hex).reduce((n, p) => n + p.w, 0);
    expect(count(furred, "#A63A3A")).toBe(count(plain, "#A63A3A"));
    expect(count(furred, "#C27A47")).toBeGreaterThan(50);
  });
});
