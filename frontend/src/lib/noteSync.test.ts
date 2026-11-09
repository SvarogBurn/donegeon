import { describe, expect, it } from "vitest";
import type { Note } from "../types";
import { mergeNotes } from "./noteSync";

const note = (id: string, text = id) => ({ id, title: "", text, noteFolderId: null, position: 0, createdAt: "", updatedAt: "" }) as Note;
const kept = { notes: [note("a"), note("b"), note("c")], noteFolders: [], syncedAt: "2026-11-09T10:00:00.000Z" };
const answer = (ids: string[], notes: Note[] = []) => ({ notes, noteFolders: [], syncedAt: "2026-11-09T11:00:00.000Z", ids });
const texts = (data: ReturnType<typeof mergeNotes>) => data?.notes.map((n) => n.text);

describe("mergeNotes", () => {
  it("replaces a changed note and keeps the others", () => {
    expect(texts(mergeNotes(kept, answer(["a", "b", "c"], [note("b", "new")])))).toEqual(["a", "new", "c"]);
  });
  it("drops a note no longer there, and adds a new one", () => {
    expect(texts(mergeNotes(kept, answer(["d", "a", "c"], [note("d")])))).toEqual(["d", "a", "c"]);
  });
  it("follows the server's order", () => {
    expect(texts(mergeNotes(kept, answer(["c", "a", "b"])))).toEqual(["c", "a", "b"]);
  });
  it("takes the new answer's time and folders", () => {
    expect(mergeNotes(kept, answer(["a"]))?.syncedAt).toBe("2026-11-09T11:00:00.000Z");
  });
  it("is null when a note is neither changed nor kept", () => {
    expect(mergeNotes(kept, answer(["a", "x"]))).toBeNull();
  });
});
