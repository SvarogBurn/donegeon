import "dotenv/config";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { RESTORABLE_MS } from "../../../shared/constants.js";
import { prisma } from "../lib/prisma.js";

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
  await prisma.$disconnect();
  await new Promise((resolve) => server.close(resolve));
});

/** A signed-up user with a session of its own, who sends requests as the app does (on `TODAY`). */
async function user() {
  let cookie = "";
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(base + path, {
      method,
      headers: { "X-Local-Date": TODAY, Cookie: cookie, ...(body !== undefined && { "Content-Type": "application/json" }) },
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
