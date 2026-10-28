import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { countWords, eventFromFile, eventState, storyWordCap } from "../../../shared/events.js";
import { fileSlug, parseFrontMatter } from "../../../shared/frontMatter.js";
import { eventById, readEvents } from "./events.js";

const EVENT = "---\ntitle: The lighthouse\nopens: 2026-11-01\ncloses: 2026-11-07\n---\nWrite about a lighthouse.\n";

describe("parseFrontMatter", () => {
  it("reads the settings between the --- lines and the text after them", () => {
    expect(parseFrontMatter('---\ntitle: A: b\ncommits: 1a2b3c4 5d6e7f8\nquoted: " x "\n# a comment: skipped\n---\n\nThe text.\n')).toEqual({
      data: { title: "A: b", commits: "1a2b3c4 5d6e7f8", quoted: " x " },
      body: "The text.",
    });
  });

  it("is all text without them, or when they never close", () => {
    expect(parseFrontMatter("Just text\n")).toEqual({ data: {}, body: "Just text" });
    expect(parseFrontMatter("---\ntitle: x\n")).toEqual({ data: {}, body: "---\ntitle: x" });
  });

  it("names a file by its slug", () => {
    expect(fileSlug("../../news/events/2026-11.md")).toBe("2026-11");
  });
});

describe("eventFromFile", () => {
  it("reads an event, about 1000 words unless it says", () => {
    expect(eventFromFile("news/events/lighthouse.md", EVENT)).toEqual({ id: "lighthouse", title: "The lighthouse", opens: "2026-11-01", closes: "2026-11-07", words: 1000, prompt: "Write about a lighthouse." });
    expect(eventFromFile("x.md", EVENT.replace("---\nW", "words: 500\n---\nW"))?.words).toBe(500);
  });

  it("skips a template and an event with wrong dates", () => {
    expect(eventFromFile("_example.md", EVENT)).toBeNull();
    expect(eventFromFile("x.md", EVENT.replace("2026-11-07", "2026-10-30"))).toBeNull();
    expect(eventFromFile("x.md", EVENT.replace("2026-11-01", "soon"))).toBeNull();
  });
});

describe("eventState", () => {
  const event = { opens: "2026-11-01", closes: "2026-11-07" };
  it("is open from its first to its last day, closed after", () => {
    expect(eventState(event, "2026-10-31")).toBe("upcoming");
    expect(eventState(event, "2026-11-01")).toBe("open");
    expect(eventState(event, "2026-11-07")).toBe("open");
    expect(eventState(event, "2026-11-08")).toBe("closed");
  });
});

describe("countWords", () => {
  it("counts words, not dashes or markup on their own", () => {
    expect(countWords("  It was a dark — and stormy  night.\n\n* **Rain** fell ")).toBe(9);
    expect(countWords("")).toBe(0);
    expect(storyWordCap(1000)).toBe(1500);
  });
});

describe("readEvents", () => {
  it("reads the events of a folder, leaving out the rest", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "events-"));
    try {
      await writeFile(path.join(dir, "lighthouse.md"), EVENT);
      await writeFile(path.join(dir, "_example.md"), EVENT);
      await writeFile(path.join(dir, "notes.txt"), EVENT);
      expect((await readEvents(dir)).map((event) => event.id)).toEqual(["lighthouse"]);
      expect((await eventById("lighthouse", dir))?.title).toBe("The lighthouse");
      expect(await eventById("nope", dir)).toBeNull();
      expect(await readEvents(path.join(dir, "missing"))).toEqual([]);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
