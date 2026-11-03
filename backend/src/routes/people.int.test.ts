import "dotenv/config";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FACE_ICON_MAX } from "../../../shared/constants.js";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { closeSessions } from "../lib/sessions.js";

/*
 * People against the real database: who sees whom, what of them, and that nothing private leaves the server. Nothing
 * is pushed (no device is turned on). Every user made here is called "uitestint…" and removed at the end.
 */

const TODAY = "2026-11-02";
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

const look = { v: 2, body: "human", options: {}, colors: {} };
const CARD = { level: 4, into: 2, span: 14, title: "Outsider", look, activity: { day: TODAY, streak: 3, week: 9 }, hearts: { hp: 6, max: 10 }, skills: [{ name: "Reading", level: 2, into: 1, span: 7 }], stats: { day: TODAY, rows: [{ key: "ever", value: 40 }] } };

async function user(settings: Record<string, unknown> = {}) {
  let cookie = "";
  const call = async (method: string, path: string, body?: unknown, day = TODAY) => {
    const res = await fetch(base + path, {
      method,
      headers: { "X-Local-Date": day, Cookie: cookie, ...(body !== undefined && { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, text };
  };
  const username = `uitestint${Math.random().toString(36).slice(2, 10)}`;
  const me = await call("POST", "/auth/signup", { username, password: "password123" });
  if (Object.keys(settings).length) await call("PATCH", "/auth/me", settings);
  await call("PUT", "/people/card", CARD);
  const set = (change: Record<string, unknown>) => call("PATCH", "/auth/me", change);
  return { call, set, id: me.body.user.id as string, username };
}

type Someone = Awaited<ReturnType<typeof user>>;

async function befriend(one: Someone, other: Someone) {
  expect((await one.call("POST", "/people/friends", { username: other.username })).body.status).toBe("sent");
  expect((await other.call("POST", `/people/friends/${one.id}/accept`)).status).toBe(204);
}

const friendsOf = async (person: Someone) => (await person.call("GET", "/people")).body.friends as { id: string; card: Record<string, unknown> }[];
const idsIn = (people: { id: string }[]) => people.map((person) => person.id);

describe("who sees whom", () => {
  it("a new account is on, sharing nothing and seen by nobody", async () => {
    const stranger = await user();
    const fresh = await user();
    const me = (await fresh.call("GET", "/auth/me")).body.user;
    expect(me).toMatchObject({ peopleOff: false, shares: [], cheersOff: false });
    expect(await friendsOf(stranger)).toEqual([]);
    expect(await friendsOf(fresh)).toEqual([]);
  });

  it("there is no way left to see strangers or follow anyone", async () => {
    const one = await user();
    const other = await user();
    expect((await one.call("GET", "/people/everyone")).status).toBe(404);
    expect((await one.call("POST", `/people/follow/${other.id}`)).status).toBe(404);
    expect((await one.call("POST", "/people/friends", { id: other.id })).status).toBe(400);
  });

  it("Off hides both ways and clears the card; friends wait for when they're back", async () => {
    const one = await user();
    const other = await user();
    await befriend(one, other);
    await other.set({ peopleOff: true });
    expect(await friendsOf(one)).toEqual([]);
    expect((await other.call("GET", "/people")).body).toMatchObject({ isOff: true, friends: [] });
    expect((await prisma.user.findUnique({ where: { id: other.id } }))?.card).toBeNull();
    expect((await other.call("PUT", "/people/card", CARD)).status).toBe(204);
    expect((await prisma.user.findUnique({ where: { id: other.id } }))?.card).toBeNull();
    await other.set({ peopleOff: false });
    expect(idsIn(await friendsOf(one))).toEqual([other.id]);
  });
});

describe("friend requests", () => {
  it("only an accepted request shows anyone's card", async () => {
    const one = await user();
    const other = await user();
    await one.call("POST", "/people/friends", { username: other.username });
    expect(await friendsOf(one)).toEqual([]);
    expect((await one.call("GET", "/people")).body.sent).toEqual([{ id: other.id, username: other.username }]);
    expect((await other.call("GET", "/people/inbox")).body.requests).toEqual([{ id: one.id, username: one.username }]);
    await other.call("POST", `/people/friends/${one.id}/accept`);
    expect(idsIn(await friendsOf(one))).toEqual([other.id]);
    expect(idsIn(await friendsOf(other))).toEqual([one.id]);
    expect((await other.call("GET", "/people/inbox")).body.requests).toEqual([]);
  });

  it("the one asked can't be accepted by the one asking", async () => {
    const one = await user();
    const other = await user();
    await one.call("POST", "/people/friends", { username: other.username });
    expect((await one.call("POST", `/people/friends/${other.id}/accept`)).status).toBe(404);
  });

  it("asking back is a yes, and so is both asking at once", async () => {
    const one = await user();
    const other = await user();
    await one.call("POST", "/people/friends", { username: other.username });
    expect((await other.call("POST", "/people/friends", { username: one.username })).body.status).toBe("friends");
    const third = await user();
    const fourth = await user();
    await Promise.all([third.call("POST", "/people/friends", { username: fourth.username }), fourth.call("POST", "/people/friends", { username: third.username })]);
    expect(await prisma.friendship.count({ where: { OR: [{ userA: third.id }, { userB: third.id }] } })).toBe(1);
    expect(idsIn(await friendsOf(third))).toEqual([fourth.id]);
  });

  it("an ignored request looks like it's still waiting, and can't come again", async () => {
    const one = await user();
    const other = await user();
    await one.call("POST", "/people/friends", { username: other.username });
    await other.call("POST", `/people/friends/${one.id}/ignore`);
    expect((await other.call("GET", "/people/inbox")).body.requests).toEqual([]);
    expect((await one.call("GET", "/people")).body.sent).toHaveLength(1);
    await one.call("DELETE", `/people/friends/${other.id}`);
    expect((await one.call("GET", "/people")).body.sent).toHaveLength(0);
    expect((await one.call("POST", "/people/friends", { username: other.username })).body.status).toBe("sent");
    expect((await other.call("GET", "/people/inbox")).body.requests).toEqual([]);
  });

  it("a request taken back leaves the inbox, and stays one row when asked again", async () => {
    const one = await user();
    const other = await user();
    await one.call("POST", "/people/friends", { username: other.username });
    await one.call("DELETE", `/people/friends/${other.id}`);
    expect((await other.call("GET", "/people/inbox")).body.requests).toEqual([]);
    await one.call("POST", "/people/friends", { username: other.username });
    expect((await other.call("GET", "/people/inbox")).body.requests).toHaveLength(1);
  });

  it("no name, Off, blocked and yourself all get the same answer", async () => {
    const me = await user();
    const off = await user({ peopleOff: true });
    const blocker = await user();
    await blocker.call("POST", `/people/blocks/${me.id}`);
    const answers = await Promise.all([`uitestintnobody${Date.now()}`, off.username, blocker.username, me.username].map((username) => me.call("POST", "/people/friends", { username })));
    expect(answers.map((answer) => answer.status)).toEqual([404, 404, 404, 404]);
    expect(new Set(answers.map((answer) => answer.text)).size).toBe(1);
  });

  it("nothing can be asked while Off", async () => {
    const off = await user({ peopleOff: true });
    const other = await user();
    expect((await off.call("POST", "/people/friends", { username: other.username })).status).toBe(409);
  });

  it("unfriending hides the card, both ways", async () => {
    const one = await user();
    const other = await user();
    await befriend(one, other);
    await other.call("DELETE", `/people/friends/${one.id}`);
    expect(await friendsOf(one)).toEqual([]);
    expect(await friendsOf(other)).toEqual([]);
  });
});

describe("what a card shows", () => {
  it("only the base until shared, then what both share, gone at once when either stops", async () => {
    const one = await user({ shares: ["skills", "activity"] });
    await one.call("PUT", "/people/card", CARD);
    const other = await user();
    await befriend(one, other);
    expect(Object.keys((await friendsOf(other))[0].card).sort()).toEqual(["into", "level", "look", "span", "title"]);

    await other.set({ shares: ["skills"] });
    const shown = (await friendsOf(other))[0].card;
    expect(shown.skills).toEqual(CARD.skills);
    expect(shown).not.toHaveProperty("activity");
    expect(shown).not.toHaveProperty("hearts");

    await other.set({ shares: [] });
    expect((await friendsOf(other))[0].card).not.toHaveProperty("skills");
    await other.set({ shares: ["skills"] });
    await one.set({ shares: ["activity"] });
    expect((await friendsOf(other))[0].card).not.toHaveProperty("skills");
    expect((await prisma.user.findUnique({ where: { id: one.id } }))?.card).not.toHaveProperty("skills");
  });

  it("keeps nothing that isn't shared", async () => {
    const one = await user({ shares: ["activity"] });
    await one.call("PUT", "/people/card", CARD);
    const stored = (await prisma.user.findUnique({ where: { id: one.id } }))?.card;
    expect(stored).toHaveProperty("activity");
    expect(stored).not.toHaveProperty("hearts");
    expect(stored).not.toHaveProperty("skills");
  });

  it("two parts published apart add up", async () => {
    const one = await user({ shares: ["skills"] });
    await one.call("PUT", "/people/card", { level: 9 });
    await one.call("PUT", "/people/card", { skills: CARD.skills });
    expect((await one.call("GET", "/people")).body.me.card).toMatchObject({ level: 9, title: "Outsider", skills: CARD.skills });
  });

  it("health off takes the hearts", async () => {
    const one = await user({ shares: ["hearts"] });
    await one.call("PUT", "/people/card", CARD);
    const after = (await one.set({ healthOff: true })).body.user;
    expect(after.shares).toEqual([]);
    expect((await one.call("GET", "/people")).body.me.card).not.toHaveProperty("hearts");
  });

  it("nothing private is in any answer", async () => {
    const one = await user({ shares: ["activity", "stats", "skills", "hearts"] });
    await one.call("PUT", "/people/card", CARD);
    await one.set({ notifications: { reminders: [{ id: "r", on: true, kind: "text", days: "all", times: ["08:00"], text: "PRIVATEREMINDER" }] } });
    const lists = await one.call("GET", "/lists");
    await one.call("POST", "/tasks", { title: "PRIVATETASK", listId: lists.body.lists[0].id });
    const other = await user({ shares: ["activity", "stats", "skills", "hearts"] });
    await befriend(one, other);
    await other.call("POST", `/people/cheers/${one.id}`, { line: "Well done!" });
    const answers = await Promise.all([other.call("GET", "/people"), one.call("GET", "/people/inbox")]);
    for (const { text } of answers) {
      for (const secret of ["PRIVATEREMINDER", "PRIVATETASK", "passwordHash", "notifications", "taskBar", "profile", "deadlineTable", lists.body.lists[0].id, "peopleOff", "shares", "cheersOff"]) {
        expect(text).not.toContain(secret);
      }
      expect(text).not.toMatch(/count|total/i);
    }
  });
});

describe("cheers", () => {
  it("one a day per person, into the bell, read once", async () => {
    const one = await user();
    const other = await user();
    await befriend(one, other);
    expect((await friendsOf(one))[0]).toMatchObject({ canCheer: true, hasCheered: false });
    expect((await one.call("POST", `/people/cheers/${other.id}`, { line: "Keep going!" })).status).toBe(201);
    expect((await one.call("POST", `/people/cheers/${other.id}`, { line: "Well done!" })).status).toBe(409);
    expect((await friendsOf(one))[0]).toMatchObject({ hasCheered: true });
    expect((await one.call("POST", `/people/cheers/${other.id}`, { line: "Well done!" }, "2026-11-03")).status).toBe(201);

    const { cheers } = (await other.call("GET", "/people/inbox")).body;
    expect(cheers.map((cheer: { username: string; line: string }) => [cheer.username, cheer.line]).sort()).toEqual([[one.username, "Keep going!"], [one.username, "Well done!"]]);
    await other.call("POST", "/people/cheers/seen", { ids: [cheers[0].id] });
    expect((await other.call("GET", "/people/inbox")).body.cheers).toHaveLength(1);
  });

  it("shows the sender's look in the bell", async () => {
    const one = await user();
    const other = await user();
    await befriend(one, other);
    const look = { v: 2, body: "boar", options: {}, colors: {} };
    await one.call("PUT", "/people/card", { look });
    await one.call("POST", `/people/cheers/${other.id}`, { line: "Keep going!" });
    expect((await other.call("GET", "/people/inbox")).body.cheers[0].look).toMatchObject(look);
  });

  it("takes a face for the push, only a PNG of a small size, and keeps it nowhere", async () => {
    const one = await user();
    const other = await user();
    await befriend(one, other);
    const cheer = (face: string) => one.call("POST", `/people/cheers/${other.id}`, { line: "Keep going!", face });
    expect((await cheer("data:image/svg+xml;base64,AAAA")).status).toBe(400);
    expect((await cheer("https://example.com/face.png")).status).toBe(400);
    expect((await cheer(`data:image/png;base64,${"A".repeat(FACE_ICON_MAX)}`)).status).toBe(400);
    expect((await cheer("data:image/png;base64,AAAA")).status).toBe(201);
    const { cheers } = (await other.call("GET", "/people/inbox")).body;
    expect(cheers[0]).not.toHaveProperty("face");
  });

  it("only the receiver can mark one read", async () => {
    const one = await user();
    const other = await user();
    await befriend(one, other);
    await one.call("POST", `/people/cheers/${other.id}`, { line: "Keep going!" });
    const { cheers } = (await other.call("GET", "/people/inbox")).body;
    await one.call("POST", "/people/cheers/seen", { ids: [cheers[0].id] });
    expect((await other.call("GET", "/people/inbox")).body.cheers).toHaveLength(1);
  });

  it("refuses a line of its own, a stranger, and cheers off on either side", async () => {
    const one = await user();
    const other = await user();
    const stranger = await user();
    await befriend(one, other);
    expect((await one.call("POST", `/people/cheers/${other.id}`, { line: "typed" })).status).toBe(400);
    expect((await one.call("POST", `/people/cheers/${stranger.id}`, { line: "Keep going!" })).status).toBe(404);
    await other.set({ cheersOff: true });
    expect((await friendsOf(one))[0]).toMatchObject({ canCheer: false });
    expect((await one.call("POST", `/people/cheers/${other.id}`, { line: "Keep going!" })).status).toBe(404);
    expect((await other.call("POST", `/people/cheers/${one.id}`, { line: "Keep going!" })).status).toBe(404);
  });
});

describe("cheering everyone", () => {
  const cheersTo = async (person: Someone) => (await person.call("GET", "/people/inbox")).body.cheers as { username: string; line: string }[];

  it("reaches each friend once, and not strangers or a request left unanswered", async () => {
    const me = await user();
    const one = await user();
    const other = await user();
    const stranger = await user();
    const asked = await user();
    await befriend(me, one);
    await befriend(me, other);
    await me.call("POST", "/people/friends", { username: asked.username });
    const answer = await me.call("POST", "/people/cheers", { line: "Well done!" });
    expect(answer.status).toBe(201);
    expect(answer.text).toBe("");
    expect((await cheersTo(one)).map((cheer) => [cheer.username, cheer.line])).toEqual([[me.username, "Well done!"]]);
    expect(await cheersTo(other)).toHaveLength(1);
    expect(await cheersTo(stranger)).toEqual([]);
    expect(await cheersTo(asked)).toEqual([]);
  });

  it("leaves out whoever was cheered today, and can't be sent twice in a day", async () => {
    const me = await user();
    const one = await user();
    const other = await user();
    await befriend(me, one);
    await befriend(me, other);
    await me.call("POST", `/people/cheers/${one.id}`, { line: "Keep going!" });
    expect((await me.call("POST", "/people/cheers", { line: "Well done!" })).status).toBe(201);
    expect((await cheersTo(one)).map((cheer) => cheer.line)).toEqual(["Keep going!"]);
    expect((await cheersTo(other)).map((cheer) => cheer.line)).toEqual(["Well done!"]);
    expect((await me.call("POST", "/people/cheers", { line: "Well done!" })).status).toBe(409);
    expect((await me.call("POST", "/people/cheers", { line: "Well done!" }, "2026-11-03")).status).toBe(201);
    expect(await cheersTo(one)).toHaveLength(2);
  });

  it("leaves out friends who are Off or have cheers off", async () => {
    const me = await user();
    const off = await user();
    const quiet = await user();
    const on = await user();
    for (const friend of [off, quiet, on]) await befriend(me, friend);
    await off.set({ peopleOff: true });
    await quiet.set({ cheersOff: true });
    expect((await me.call("POST", "/people/cheers", { line: "Well done!" })).status).toBe(201);
    expect(await prisma.cheer.count({ where: { fromId: me.id } })).toBe(1);
    expect(await cheersTo(on)).toHaveLength(1);
  });

  it("refuses a line of its own, and while Off or with cheers off", async () => {
    const me = await user();
    const friend = await user();
    await befriend(me, friend);
    expect((await me.call("POST", "/people/cheers", { line: "typed" })).status).toBe(400);
    await me.set({ cheersOff: true });
    expect((await me.call("POST", "/people/cheers", { line: "Well done!" })).status).toBe(409);
    await me.set({ cheersOff: false, peopleOff: true });
    expect((await me.call("POST", "/people/cheers", { line: "Well done!" })).status).toBe(409);
  });
});

describe("blocks", () => {
  it("end everything between the two, both ways", async () => {
    const one = await user();
    const other = await user();
    await befriend(one, other);
    await other.call("POST", `/people/cheers/${one.id}`, { line: "Keep going!" });
    await one.call("POST", `/people/blocks/${other.id}`);
    expect(await friendsOf(one)).toEqual([]);
    expect(await friendsOf(other)).toEqual([]);
    expect((await one.call("GET", "/people/inbox")).body.cheers).toEqual([]);
    expect((await other.call("POST", "/people/friends", { username: one.username })).status).toBe(404);
    expect((await one.call("GET", "/people/blocks")).body.blocks).toEqual([{ id: other.id, username: other.username }]);
    expect((await other.call("GET", "/people/blocks")).body.blocks).toEqual([]);
    await one.call("DELETE", `/people/blocks/${other.id}`);
    expect((await other.call("POST", "/people/friends", { username: one.username })).body.status).toBe("sent");
  });
});

describe("deleting an account", () => {
  it("takes everything about it along", async () => {
    const one = await user();
    const other = await user();
    await befriend(one, other);
    await other.call("POST", `/people/cheers/${one.id}`, { line: "Keep going!" });
    expect((await one.call("DELETE", "/auth/me", { confirm: `donegeon/${one.username}` })).status).toBe(204);
    expect(await friendsOf(other)).toEqual([]);
    expect(await prisma.friendship.count({ where: { OR: [{ userA: one.id }, { userB: one.id }] } })).toBe(0);
    expect(await prisma.cheer.count({ where: { OR: [{ fromId: one.id }, { toId: one.id }] } })).toBe(0);
  });
});
