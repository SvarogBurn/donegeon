import { describe, expect, it } from "vitest";
import { hasPlainWords, isSealed, newNotesKey, openKey, openNote, openWords, sealKey, sealNote, sealWords, usableKey } from "./noteCrypto";

// Few rounds: the real number takes a second each time, and the rounds are kept with the sealed key.
const ROUNDS = 1000;
const key = await usableKey(newNotesKey());

describe("sealing a note's words", () => {
  it.each([
    ["plain", "Buy milk"],
    ["accents, Cyrillic and emoji", "Café — привет 🐉🗡️"],
    ["several lines", "# Title\n- one\n- two\n<> centred"],
    ["long", "é".repeat(100_000)],
  ])("opens %s words as they were", async (_, words) => {
    const sealed = await sealWords(key, words);
    expect(isSealed(sealed)).toBe(true);
    expect(sealed).not.toContain(words.slice(0, 4));
    expect(await openWords(key, sealed)).toBe(words);
  });

  it("leaves empty words empty", async () => {
    expect(await sealWords(key, "")).toBe("");
  });

  it("seals the same words differently each time", async () => {
    expect(await sealWords(key, "same")).not.toBe(await sealWords(key, "same"));
  });

  it("doesn't seal words twice", async () => {
    const sealed = await sealWords(key, "once");
    expect(await sealWords(key, sealed)).toBe(sealed);
  });

  it("reads words not sealed as they are", async () => {
    expect(await openWords(key, "never sealed")).toBe("never sealed");
  });

  it("won't open with another key", async () => {
    const other = await usableKey(newNotesKey());
    await expect(openWords(other, await sealWords(key, "secret"))).rejects.toThrow();
  });

  it("seals only the words a change has", async () => {
    const change = await sealNote(key, { text: "new text", noteFolderId: null });
    expect(change.title).toBeUndefined();
    expect(change.noteFolderId).toBeNull();
    expect(isSealed(change.text!)).toBe(true);
    expect(await openNote(key, { id: "a", title: "", text: change.text! })).toEqual({ id: "a", title: "", text: "new text" });
  });

  it("tells a note with words not sealed", async () => {
    expect(hasPlainWords({ title: "", text: "" })).toBe(false);
    expect(hasPlainWords({ title: await sealWords(key, "t"), text: "" })).toBe(false);
    expect(hasPlainWords({ title: await sealWords(key, "t"), text: "plain" })).toBe(true);
  });
});

describe("the notes key sealed with the passphrase", () => {
  it("opens with the passphrase, and the notes it sealed open again", async () => {
    const raw = newNotesKey();
    const sealed = await sealKey(raw, "key-1", "correct horse", ROUNDS);
    expect(sealed).toMatchObject({ id: "key-1", rounds: ROUNDS });
    const opened = await openKey(sealed, "correct horse");
    expect(opened).toEqual(raw);
    const words = await sealWords(await usableKey(raw), "hello");
    expect(await openWords(await usableKey(opened!), words)).toBe("hello");
  });

  it("is null with another passphrase", async () => {
    const sealed = await sealKey(newNotesKey(), "key-1", "correct horse", ROUNDS);
    expect(await openKey(sealed, "Correct horse")).toBeNull();
    expect(await openKey(sealed, "")).toBeNull();
  });

  it("sealed again with a new passphrase, it is the same key, and the old one no longer opens it", async () => {
    const raw = newNotesKey();
    const first = await sealKey(raw, "key-1", "old passphrase", ROUNDS);
    const second = await sealKey((await openKey(first, "old passphrase"))!, first.id, "new passphrase", ROUNDS);
    expect(second.id).toBe("key-1");
    expect(second.salt).not.toBe(first.salt);
    expect(await openKey(second, "new passphrase")).toEqual(raw);
    expect(await openKey(second, "old passphrase")).toBeNull();
  });

  it("takes a passphrase however its accents were typed", async () => {
    const sealed = await sealKey(newNotesKey(), "key-1", "café au lait", ROUNDS);
    expect(await openKey(sealed, "café au lait")).not.toBeNull();
  });
});
