import "dotenv/config";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OPENS_SEALED_HEADER, SEALED_PREFIX } from "../../../shared/constants.js";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { closeSessions } from "../lib/sessions.js";

/*
 * Notes against the real database: how long one can be, and the device asking only for what changed since its last
 * answer. Every user made here is called "uitestint…" and removed at the end.
 */

const TODAY = "2026-11-09";
let server: Server;
let base: string;

beforeAll(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: { startsWith: "uitestint" } } });
  await Promise.all([prisma.$disconnect(), closeSessions()]);
  await new Promise((resolve) => server.close(resolve));
});

async function user() {
  let cookie = "";
  // As today's app sends it; `oldApp`: as one from before notes could be encrypted, without OPENS_SEALED_HEADER.
  const call = async (method: string, path: string, body?: unknown, { oldApp = false } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { "X-Local-Date": TODAY, Cookie: cookie, ...(!oldApp && { [OPENS_SEALED_HEADER]: "1" }), ...(body !== undefined && { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  const username = `uitestint${Math.random().toString(36).slice(2, 10)}`;
  const me = await call("POST", "/auth/signup", { username, password: "password123" });
  return { call, id: me.body.user.id as string };
}

/** Every note of `owner` as if last changed an hour ago, out of the overlap a "since" answer sends again. */
const changedLongAgo = (owner: string) => prisma.$executeRaw`UPDATE "Note" SET "updatedAt" = now() - interval '1 hour' WHERE "userId" = ${owner}`;
const ids = (notes: { id: string }[]) => notes.map((note) => note.id);

describe("a note's length", () => {
  it("takes a million characters, and no more", async () => {
    const { call } = await user();
    const long = await call("POST", "/notes", { text: "é".repeat(1_000_000) });
    expect(long.status).toBe(201);
    expect((await call("GET", "/notes")).body.notes[0].text).toHaveLength(1_000_000);
    expect((await call("POST", "/notes", { text: "a".repeat(1_000_001) })).status).toBe(400);
  });
});

describe("asking for what changed", () => {
  it("sends only the notes changed since, and every note's id in order", async () => {
    const { call, id } = await user();
    const first = (await call("POST", "/notes", { text: "first" })).body.note;
    const second = (await call("POST", "/notes", { text: "second" })).body.note;
    const all = await call("GET", "/notes");
    expect(all.body.ids).toBeUndefined();
    await changedLongAgo(id);

    await call("PATCH", `/notes/${first.id}`, { text: "first, again" });
    const since = await call("GET", `/notes?since=${all.body.syncedAt}`);
    expect(since.status).toBe(200);
    expect(since.body.notes.map((note: { text: string }) => note.text)).toEqual(["first, again"]);
    expect(since.body.ids).toEqual([second.id, first.id]);
    expect(Date.parse(since.body.syncedAt)).toBeGreaterThanOrEqual(Date.parse(all.body.syncedAt));
  });

  it("leaves a deleted note out of the ids", async () => {
    const { call, id } = await user();
    const kept = (await call("POST", "/notes", { text: "kept" })).body.note;
    const gone = (await call("POST", "/notes", { text: "gone" })).body.note;
    const { syncedAt } = (await call("GET", "/notes")).body;
    await changedLongAgo(id);
    await call("DELETE", `/notes/${gone.id}`);
    const since = (await call("GET", `/notes?since=${syncedAt}`)).body;
    expect(since.notes).toEqual([]);
    expect(since.ids).toEqual([kept.id]);
  });

  it("sends a note again once its folder is removed", async () => {
    const { call, id } = await user();
    const folder = (await call("POST", "/notes/folders", { name: "Work" })).body.noteFolder;
    const inside = (await call("POST", "/notes", { text: "inside", noteFolderId: folder.id })).body.note;
    const { syncedAt } = (await call("GET", "/notes")).body;
    await changedLongAgo(id);
    await call("DELETE", `/notes/folders/${folder.id}`);
    const since = (await call("GET", `/notes?since=${syncedAt}`)).body;
    expect(ids(since.notes)).toEqual([inside.id]);
    expect(since.notes[0].noteFolderId).toBeNull();
    expect(since.noteFolders).toEqual([]);
  });

  it("refuses a since that isn't a time", async () => {
    const { call } = await user();
    expect((await call("GET", "/notes?since=yesterday")).status).toBe(400);
  });
});

describe("encrypted notes", () => {
  // What the app sends: the prefix and base64 the server can't read (frontend/src/lib/noteCrypto.ts).
  const sealed = (bytes: number) => `${SEALED_PREFIX}${Buffer.alloc(bytes, 7).toString("base64")}`;
  const notesKey = { id: "key-1", salt: "c2FsdHNhbHRzYWx0c2FsdA==", iv: "aXZpdml2aXZpdml2", key: "a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2V5", rounds: 600_000 };

  it("refuses sealed words while the account has no notes key", async () => {
    const { call } = await user();
    expect((await call("POST", "/notes", { text: sealed(40) })).status).toBe(409);
    const note = (await call("POST", "/notes", { text: "plain" })).body.note;
    expect((await call("PATCH", `/notes/${note.id}`, { title: sealed(40) })).status).toBe(409);
  });

  it("keeps a sealed title longer than a plain one can be, as it was sent", async () => {
    const { call } = await user();
    expect((await call("PATCH", "/auth/me", { notesKey })).body.user.notesKey).toEqual(notesKey);
    const title = sealed(300 + 28);
    const made = await call("POST", "/notes", { title, text: sealed(1000) });
    expect(made.status).toBe(201);
    expect((await call("GET", "/notes")).body.notes[0].title).toBe(title);
    expect((await call("POST", "/notes", { title: "a".repeat(101) })).status).toBe(400);
    expect((await call("POST", "/notes", { title: sealed(1000) })).status).toBe(400);
  });

  it("won't take the key away or swap it while a note is sealed with it", async () => {
    const { call } = await user();
    await call("PATCH", "/auth/me", { notesKey });
    const note = (await call("POST", "/notes", { text: sealed(40) })).body.note;
    expect((await call("PATCH", "/auth/me", { notesKey: null })).status).toBe(409);
    expect((await call("PATCH", "/auth/me", { notesKey: { ...notesKey, id: "key-2" } })).status).toBe(409);
    // A new passphrase seals the same key again: same id.
    expect((await call("PATCH", "/auth/me", { notesKey: { ...notesKey, salt: "bmV3c2FsdG5ld3NhbHQ=" } })).status).toBe(200);
    await call("PATCH", `/notes/${note.id}`, { text: "readable again" });
    const off = await call("PATCH", "/auth/me", { notesKey: null });
    expect(off.status).toBe(200);
    expect(off.body.user.notesKey).toBeNull();
  });

  it("refuses an app from before encryption while the notes are encrypted", async () => {
    const { call } = await user();
    const old = { oldApp: true };
    // Not encrypted: an old app works as it always did.
    const note = (await call("POST", "/notes", { text: "plain" }, old)).body.note;
    expect((await call("GET", "/notes", undefined, old)).status).toBe(200);
    expect((await call("PATCH", `/notes/${note.id}`, { text: "still plain" }, old)).status).toBe(200);
    await call("PATCH", "/auth/me", { notesKey });
    expect((await call("GET", "/notes", undefined, old)).status).toBe(409);
    expect((await call("POST", "/notes", { text: "plain" }, old)).status).toBe(409);
    // What it would save: the sealed words it showed, with more typed after them.
    expect((await call("PATCH", `/notes/${note.id}`, { text: `${sealed(40)} and more` }, old)).status).toBe(409);
    expect((await call("GET", "/notes")).status).toBe(200);
    expect((await call("PATCH", `/notes/${note.id}`, { text: sealed(40) })).status).toBe(200);
  });
});
