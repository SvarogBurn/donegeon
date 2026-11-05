import "dotenv/config";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { RESTORABLE_MS } from "../../../shared/constants.js";
import { prisma } from "../lib/prisma.js";
import { closeSessions } from "../lib/sessions.js";

/*
 * The routes against the real database: what only shows with the server, Postgres and two requests at once.
 * Every user made here is called "uitestint…" and removed at the end.
 */

const TODAY = "2026-10-20";
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

/** A signed-up user with a session of its own, who sends requests as the app does (on `TODAY`, or on `day`). */
async function user() {
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
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  const username = `uitestint${Math.random().toString(36).slice(2, 10)}`;
  await call("POST", "/auth/signup", { username, password: "password123" });
  const lists = await call("GET", "/lists");
  return { call, username, listId: lists.body.lists[0].id as string };
}

const balance = async (call: Awaited<ReturnType<typeof user>>["call"]) => (await call("GET", "/points")).body.balance as number;

describe("ticking", () => {
  it("waits for everything beneath, and books a tick once however many requests come at once", async () => {
    const { call, listId } = await user();
    const main = (await call("POST", "/tasks", { title: "Main", listId })).body.task;
    const sub = (await call("POST", "/tasks", { title: "Sub", parentId: main.id })).body.task;

    const early = await call("PATCH", `/tasks/${main.id}/toggle`, { done: true });
    expect(early.status).toBe(400);
    expect(early.body.error).toBe("Tick its subtasks first");

    await call("PATCH", `/tasks/${sub.id}/toggle`, { done: true });
    const both = await Promise.all([1, 2, 3].map(() => call("PATCH", `/tasks/${main.id}/toggle`, { done: true })));
    expect(both.every((res) => res.status === 200 && res.body.task.isComplete)).toBe(true);
    // The list's default of 1 for the main task; a subtask without an amount of its own is worth nothing.
    expect(await balance(call)).toBe(1);

    await call("PATCH", `/tasks/${main.id}/toggle`, { done: false });
    expect(await balance(call)).toBe(0);
  });
});

describe("pressing a persistent task", () => {
  it("unticks its subtasks and moves its round on; the undo puts both back as they were", async () => {
    const { call, listId } = await user();
    const weekly = (await call("POST", "/tasks", { title: "Weekly", listId, repeatEvery: 1, repeatUnit: "week", nextDue: TODAY })).body.task;
    const step = (await call("POST", "/tasks", { title: "Step", parentId: weekly.id })).body.task;
    const ticked = (await call("PATCH", `/tasks/${step.id}/toggle`, { done: true })).body.task;

    const press = await call("POST", `/tasks/${weekly.id}/completions`, { id: crypto.randomUUID() });
    expect(press.status).toBe(201);
    expect((await call("GET", `/tasks/${step.id}`)).body.task.isComplete).toBe(false);
    expect((await call("GET", `/tasks/${weekly.id}`)).body.task.nextDue).toBe("2026-10-27");

    // Sent twice, as a change that waited offline may be: the same press, not a second one.
    const again = await call("POST", `/tasks/${weekly.id}/completions`, { id: press.body.completion.id });
    expect(again.status).toBe(200);
    expect(again.body.completion.id).toBe(press.body.completion.id);

    expect((await call("DELETE", `/tasks/${weekly.id}/completions/${press.body.completion.id}`)).status).toBe(204);
    const back = (await call("GET", `/tasks/${step.id}`)).body.task;
    expect(back).toMatchObject({ isComplete: true, completedOn: ticked.completedOn, completedAt: ticked.completedAt });
    expect((await call("GET", `/tasks/${weekly.id}`)).body.task.nextDue).toBe(TODAY);
    expect((await call("DELETE", `/tasks/${weekly.id}/completions/${press.body.completion.id}`)).status).toBe(204);
  });

  /** A weekly task worth nothing itself, with a subtask worth 5. */
  async function withStep() {
    const made = await user();
    const weekly = (await made.call("POST", "/tasks", { title: "Weekly", listId: made.listId, points: 0, repeatEvery: 1, repeatUnit: "week", nextDue: TODAY })).body.task;
    const step = (await made.call("POST", "/tasks", { title: "Step", parentId: weekly.id, points: 5 })).body.task;
    const tick = (done: boolean, day = TODAY) => made.call("PATCH", `/tasks/${step.id}/toggle`, { done }, day);
    const press = (day = TODAY) => made.call("POST", `/tasks/${weekly.id}/completions`, { id: crypto.randomUUID() }, day);
    const balance = async () => (await made.call("GET", "/points")).body.balance as number;
    return { ...made, weekly, step, tick, press, balance };
  }

  it("a subtask pays every round; an untick takes back that round's points only", async () => {
    const { tick, press, balance } = await withStep();
    await tick(true);
    expect(await balance()).toBe(5);
    await press();

    await tick(true, "2026-10-27");
    expect(await balance()).toBe(10);
    await tick(false, "2026-10-27");
    expect(await balance()).toBe(5);
    await tick(true, "2026-10-27");
    expect(await balance()).toBe(10);
  });

  it("an undone press gives the tick back whole: an untick then takes its points back", async () => {
    const { call, weekly, tick, press, balance } = await withStep();
    await tick(true);
    const { completion } = (await press()).body;
    await call("DELETE", `/tasks/${weekly.id}/completions/${completion.id}`);
    expect(await prisma.roundTick.count({ where: { completionId: completion.id } })).toBe(0);
    await tick(false);
    expect(await balance()).toBe(0);
  });

  it("a tick stays done after the press: in the exp, the stats and the day's count", async () => {
    const { call, step, tick, press } = await withStep();
    await tick(true);
    const { doneToday } = (await press()).body;
    expect(doneToday).toBe(2);
    expect((await call("GET", "/tasks/progress")).body.days).toEqual([{ day: TODAY, count: 2 }]);
    const { tasks } = (await call("GET", "/tasks/stats")).body;
    expect(tasks.find((task: { id: string }) => task.id === step.id).roundTicks).toMatchObject([{ day: TODAY }]);
  });

  it("a round the Skip rule dropped keeps its tick as a press does, and the subtask pays again", async () => {
    const { call, step, tick, balance } = await withStep();
    await tick(true);
    const later = "2026-11-03";
    const tree = (await call("GET", "/tasks", undefined, later)).body.tasks;
    expect(tree[0].children[0].isComplete).toBe(false);
    await call("GET", "/tasks", undefined, later);
    expect(await prisma.roundTick.count({ where: { taskId: step.id } })).toBe(1);
    await tick(true, later);
    expect(await balance()).toBe(10);
  });

  it("gives the days it was pressed on", async () => {
    const { call, weekly, press } = await withStep();
    await press();
    await press("2026-10-27");
    expect((await call("GET", `/tasks/${weekly.id}/completions`)).body.days).toEqual([TODAY, "2026-10-27"]);
  });

  it("refuses a new deadline under a persistent task; one it has from before can move, or go", async () => {
    const { call, weekly, step } = await withStep();
    expect((await call("POST", "/tasks", { title: "Dated", parentId: weekly.id, deadlineDate: "2026-11-01" })).status).toBe(400);
    expect((await call("PATCH", `/tasks/${step.id}`, { deadlineDate: "2026-11-01" })).status).toBe(400);

    await prisma.task.update({ where: { id: step.id }, data: { deadlineDate: "2026-11-01", deadlineType: "soft" } });
    expect((await call("PATCH", `/tasks/${step.id}`, { deadlineDate: "2026-11-02" })).status).toBe(200);
    expect((await call("PATCH", `/tasks/${step.id}`, { deadlineDate: null })).status).toBe(200);
  });
});

describe("progress", () => {
  it("counts each day's ticks at any depth and presses, as the stats do: not a reward list's, not a deleted task's", async () => {
    const { call, listId } = await user();
    const main = (await call("POST", "/tasks", { title: "Main", listId })).body.task;
    const sub = (await call("POST", "/tasks", { title: "Sub", parentId: main.id })).body.task;
    await call("PATCH", `/tasks/${sub.id}/toggle`, { done: true });
    await call("PATCH", `/tasks/${main.id}/toggle`, { done: true });
    const daily = (await call("POST", "/tasks", { title: "Daily", listId, isPersistent: true })).body.task;
    await call("POST", `/tasks/${daily.id}/completions`, { id: crypto.randomUUID() });
    await call("POST", `/tasks/${daily.id}/completions`, { id: crypto.randomUUID() });
    const rewards = (await call("POST", "/lists", { name: "Treats", kind: "reward", defaultPoints: 0 })).body.list;
    const treat = (await call("POST", "/tasks", { title: "Treat", listId: rewards.id })).body.task;
    const bought = await call("PATCH", `/tasks/${treat.id}/toggle`, { done: true });
    expect(bought.status).toBe(200);
    // The day's count, for the break reminder and the big moments, leaves it out too.
    expect(bought.body.doneToday).toBe(4);
    const gone = (await call("POST", "/tasks", { title: "Gone", listId })).body.task;
    await call("PATCH", `/tasks/${gone.id}/toggle`, { done: true });
    await call("DELETE", `/tasks/${gone.id}`);

    expect((await call("GET", "/tasks/progress")).body).toEqual({ days: [{ day: TODAY, count: 4 }] });
  });
});

describe("a habit's place on the Stats page", () => {
  it("is on until it is switched off, and the stats say so", async () => {
    const { call, listId } = await user();
    const habit = (await call("POST", "/tasks", { title: "Habit", listId, isPersistent: true })).body.task;
    const row = async () => (await call("GET", "/tasks/stats")).body.tasks.find((other: { id: string }) => other.id === habit.id);
    expect((await row()).hideInStats).toBe(false);
    expect((await call("PATCH", `/tasks/${habit.id}`, { hideInStats: true })).status).toBe(200);
    expect((await row()).hideInStats).toBe(true);
  });
});

describe("deleting and bringing back", () => {
  it("brings a task back with its subtasks, and a restore sent twice is no error", async () => {
    const { call, listId } = await user();
    const main = (await call("POST", "/tasks", { title: "Main", listId })).body.task;
    await call("POST", "/tasks", { title: "Sub", parentId: main.id });
    expect((await call("DELETE", `/tasks/${main.id}`)).status).toBe(204);
    expect((await call("GET", `/tasks/${main.id}`)).status).toBe(404);
    expect((await call("POST", `/tasks/${main.id}/restore`)).status).toBe(204);
    expect((await call("POST", `/tasks/${main.id}/restore`)).status).toBe(204);
    const trees = (await call("GET", "/tasks")).body.tasks;
    expect(trees.find((t: { id: string }) => t.id === main.id)?.children).toHaveLength(1);
  });

  it("refuses a restore once the minute is over", async () => {
    const { call, listId } = await user();
    const task = (await call("POST", "/tasks", { title: "Gone", listId })).body.task;
    await call("DELETE", `/tasks/${task.id}`);
    await prisma.task.update({ where: { id: task.id }, data: { deletedAt: new Date(Date.now() - RESTORABLE_MS - 1000) } });
    expect((await call("POST", `/tasks/${task.id}/restore`)).status).toBe(410);
  });

  it("answers a list restore sent twice as one", async () => {
    const { call } = await user();
    const list = (await call("POST", "/lists", { name: "Spare" })).body.list;
    await call("DELETE", `/lists/${list.id}`);
    expect((await call("POST", `/lists/${list.id}/restore`)).status).toBe(204);
    expect((await call("POST", `/lists/${list.id}/restore`)).status).toBe(204);
  });
});

describe("one user's things", () => {
  it("are not found by another, and an id another user's row has is refused", async () => {
    const owner = await user();
    const other = await user();
    const task = (await owner.call("POST", "/tasks", { title: "Mine", listId: owner.listId })).body.task;
    expect((await other.call("GET", `/tasks/${task.id}`)).status).toBe(404);
    expect((await other.call("PATCH", `/tasks/${task.id}/toggle`, { done: true })).status).toBe(404);
    expect((await other.call("POST", "/tasks", { id: task.id, title: "Theirs", listId: other.listId })).status).toBe(409);
  });
});

describe("dividers", () => {
  it("sit among a list's tasks but are no tasks: no tick, no place elsewhere, not counted", async () => {
    const { call, listId } = await user();
    const made = async (body: object) => (await call("POST", "/tasks", body)).body.task;
    const first = await made({ title: "First", listId });
    const divider = await made({ title: "Evenings", listId, isDivider: true });
    const second = await made({ title: "Second", listId });

    expect((await call("GET", "/tasks")).body.tasks.map((t: { title: string }) => t.title)).toEqual(["First", "Evenings", "Second"]);
    expect((await call("GET", "/lists")).body.lists[0].taskCount).toBe(2);
    expect((await call("GET", "/tasks/stats")).body.tasks).toHaveLength(2);
    expect((await call("GET", "/tasks/search?q=evening")).body.results).toEqual([]);

    expect((await call("POST", "/tasks", { title: "Lost", isDivider: true })).status).toBe(400);
    expect((await call("POST", "/tasks", { title: "Under", parentId: first.id, isDivider: true })).status).toBe(400);
    expect((await call("POST", "/tasks", { title: "Dated", listId, isDivider: true, deadlineDate: "2026-11-01" })).status).toBe(400);
    expect((await call("POST", "/tasks", { title: "Beneath", parentId: divider.id })).status).toBe(400);
    expect((await call("PATCH", `/tasks/${divider.id}/toggle`, { done: true })).status).toBe(400);
    expect((await call("PATCH", `/tasks/${divider.id}`, { today: true })).status).toBe(400);
    expect((await call("POST", `/tasks/${divider.id}/week`, { day: TODAY })).status).toBe(400);
    expect((await call("POST", `/tasks/${divider.id}/move`, { parentId: first.id, listId: null, index: 0 })).status).toBe(400);
    expect((await call("POST", `/tasks/${second.id}/move`, { parentId: divider.id, listId: null, index: 0 })).status).toBe(400);

    expect((await call("PATCH", `/tasks/${divider.id}`, { title: "Mornings" })).status).toBe(200);
    expect((await call("POST", `/tasks/${divider.id}/move`, { parentId: null, listId, index: 0 })).status).toBe(204);
    await call("DELETE", `/tasks/${first.id}`);
    expect((await call("GET", "/tasks")).body.tasks.map((t: { title: string }) => t.title)).toEqual(["Mornings", "Second"]);
  });
});

describe("a place in a list", () => {
  /** Ticked two weeks before `TODAY`: in the list still, but not among the rows the app is sent. */
  const OLD_DAY = "2026-10-06";
  const titles = async (call: Awaited<ReturnType<typeof user>>["call"]) => (await call("GET", "/tasks")).body.tasks.map((t: { title: string }) => t.title);

  it("goes by the row named, with old ticked tasks hidden above it", async () => {
    const { call, listId } = await user();
    const made = async (body: object) => (await call("POST", "/tasks", body)).body.task;
    for (const title of ["Old 1", "Old 2"]) {
      const old = await made({ title, listId });
      await call("PATCH", `/tasks/${old.id}/toggle`, { done: true }, OLD_DAY);
    }
    const divider = await made({ title: "Part", listId, isDivider: true });
    await made({ title: "Below", listId });
    const moved = await made({ title: "Moved", listId });
    expect(await titles(call)).toEqual(["Part", "Below", "Moved"]);

    // As the app sends it: one row down from the divider, among the rows it has.
    await call("POST", `/tasks/${moved.id}/move`, { parentId: null, listId, index: 1, after: divider.id });
    expect(await titles(call)).toEqual(["Part", "Moved", "Below"]);

    await made({ title: "New", listId, index: 1, after: divider.id });
    expect(await titles(call)).toEqual(["Part", "New", "Moved", "Below"]);

    await call("POST", `/tasks/${moved.id}/move`, { parentId: null, listId, index: 0, after: null });
    expect(await titles(call)).toEqual(["Moved", "Part", "New", "Below"]);
  });

  it("falls back on the count if the row named has gone, or none is named", async () => {
    const { call, listId } = await user();
    const made = async (title: string) => (await call("POST", "/tasks", { title, listId })).body.task;
    const [first, gone] = [await made("First"), await made("Gone")];
    const last = await made("Last");
    await call("DELETE", `/tasks/${gone.id}`);

    await call("POST", `/tasks/${last.id}/move`, { parentId: null, listId, index: 0, after: gone.id });
    expect(await titles(call)).toEqual(["Last", "First"]);
    await call("POST", `/tasks/${first.id}/move`, { parentId: null, listId, index: 0 });
    expect(await titles(call)).toEqual(["First", "Last"]);
  });
});

describe("folders", () => {
  it("go back to the default arrangement when the layout is set to null", async () => {
    const { call } = await user();
    const folder = (await call("POST", "/folders", { name: "Work" })).body.folder;
    const layout = { pinned: [], byColumns: { wide: [["today"]] } };
    expect((await call("PATCH", `/folders/${folder.id}`, { layout })).body.folder.layout).toEqual(layout);
    expect((await call("PATCH", `/folders/${folder.id}`, { layout: null })).body.folder.layout).toBeNull();
  });

  it("take a new order in one go, a folder left out keeping its place after the others", async () => {
    const { call } = await user();
    const [a, b, c] = await Promise.all(["A", "B", "C"].map(async (name) => (await call("POST", "/folders", { name })).body.folder));
    expect((await call("PUT", "/folders/order", { ids: [c.id, a.id] })).status).toBe(204);
    const names = (await call("GET", "/folders")).body.folders.map((f: { id: string }) => f.id);
    expect(names).toEqual([c.id, a.id, b.id]);
  });
});

describe("logging in", () => {
  it("makes someone guessing a password wait after too many wrong ones", async () => {
    const { username } = await user();
    const login = (password: string) =>
      fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    for (let i = 0; i < 10; i++) expect((await login("wrong-password")).status).toBe(401);
    const blocked = await login("password123");
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toMatch(/Try again in 15 minutes/);
    // Each wrong password costs a full bcrypt check.
  }, 30_000);
});

describe("health", () => {
  it("a deadline gone by costs half a heart when the trees are next read, and moving it after takes nothing back", async () => {
    const { call, listId } = await user();
    const essay = (await call("POST", "/tasks", { title: "Essay", listId, points: 3, deadlineDate: "2026-11-02", deadlineType: "soft" })).body.task;
    await call("POST", "/tasks", { title: "Draft", parentId: essay.id, points: 2 });
    const later = "2026-11-04";

    expect((await call("GET", "/tasks/hp", undefined, later)).body).toMatchObject({ hp: 10, max: 10, recent: [] });
    await Promise.all([1, 2].map(() => call("GET", "/tasks", undefined, later)));
    const hit = (await call("GET", "/tasks/hp", undefined, later)).body;
    expect(hit).toMatchObject({ off: false, hp: 9, lost: 0, recent: [{ title: "Essay", kind: "deadline", day: "2026-11-03", damage: 1 }] });

    await call("PATCH", `/tasks/${essay.id}`, { deadlineDate: "2026-11-20" }, later);
    await call("GET", "/tasks", undefined, later);
    expect((await call("GET", "/tasks/hp", undefined, later)).body.hp).toBe(9);

    await call("PATCH", "/auth/me", { healthOff: true }, later);
    expect((await call("GET", "/tasks/hp", undefined, later)).body.off).toBe(true);
  });

  it("a rest day: what is missed on it costs nothing, and only the days from today on can be changed", async () => {
    const { call, listId } = await user();
    await call("PATCH", "/auth/me", { restDays: [{ from: "2026-11-02", to: "2026-11-02" }] }, "2026-11-02");
    await call("POST", "/tasks", { title: "Essay", listId, deadlineDate: "2026-11-02" });
    await call("GET", "/tasks", undefined, "2026-11-04");
    expect((await call("GET", "/tasks/hp", undefined, "2026-11-04")).body).toMatchObject({ hp: 10, recent: [] });
    // Taken back after the day: it stays.
    const after = (await call("PATCH", "/auth/me", { restDays: [] }, "2026-11-04")).body.user;
    expect(after.restDays).toEqual([{ from: "2026-11-02", to: "2026-11-02" }]);
  });
});
