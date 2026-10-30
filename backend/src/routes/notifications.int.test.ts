import "dotenv/config";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { closeSessions } from "../lib/sessions.js";
import { recapText, sendDue, snooze } from "../services/notifications.service.js";

/*
 * The planned notifications against the real database: a plan sent again, a sent one never sent twice, the recap's
 * numbers. Nothing is pushed (no device is turned on). Every user made here is called "uitestint…" and removed at the end.
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
  const me = await call("POST", "/auth/signup", { username, password: "password123" });
  const lists = await call("GET", "/lists");
  return { call, id: me.body.user.id as string, listId: lists.body.lists[0].id as string };
}

const HOUR = 60 * 60_000;
const item = (key: string, sendAt: Date, title = key) => ({ key, kind: "reminder", sendAt: sendAt.toISOString(), title, body: "", url: "/" });
const planned = (userId: string) => prisma.scheduledNotification.findMany({ where: { userId }, orderBy: { key: "asc" } });

describe("the plan", () => {
  it("is replaced whole, and a notification already sent stays sent", async () => {
    const { call, id } = await user();
    const soon = new Date(Date.now() + HOUR);
    expect((await call("PUT", "/notifications/schedule", { items: [item("a", soon), item("b", soon)] })).status).toBe(204);
    await prisma.scheduledNotification.updateMany({ where: { userId: id, key: "a" }, data: { sentAt: new Date() } });

    // Sent again: "b" is dropped, "c" is new, "a" keeps its sent text and moment.
    await call("PUT", "/notifications/schedule", { items: [item("a", new Date(Date.now() + 2 * HOUR), "changed"), item("c", soon)] });
    const rows = await planned(id);
    expect(rows.map((row) => row.key)).toEqual(["a", "c"]);
    expect(rows[0].title).toBe("a");
    expect(rows[0].sentAt).not.toBeNull();
    expect(Math.abs(rows[1].sendAt.getTime() - soon.getTime())).toBeLessThan(1000);
  });

  it("refuses what isn't a plan", async () => {
    const { call } = await user();
    const soon = new Date(Date.now() + HOUR);
    expect((await call("PUT", "/notifications/schedule", { items: [item("a", soon), item("a", soon)] })).status).toBe(400);
    expect((await call("PUT", "/notifications/schedule", { items: [{ ...item("a", soon), url: "https://elsewhere.example" }] })).status).toBe(400);
    expect((await call("PUT", "/notifications/schedule", { items: [{ ...item("a", soon), kind: "test" }] })).status).toBe(400);
  });

  it("claims what is due once, however many senders at once, and drops what is long overdue", async () => {
    const { call, id } = await user();
    const now = new Date();
    await call("PUT", "/notifications/schedule", { items: [item("due", new Date(now.getTime() + 1000)), item("later", new Date(now.getTime() + HOUR))] });
    // The timer missed this one by hours (the server slept): it is claimed but not pushed.
    await prisma.scheduledNotification.create({ data: { userId: id, key: "old", kind: "reminder", sendAt: new Date(now.getTime() - 5 * HOUR), title: "", body: "", url: "/" } });

    const at = new Date(now.getTime() + 2000);
    await Promise.all([sendDue(at), sendDue(at), sendDue(at)]);
    const rows = await planned(id);
    expect(rows.filter((row) => row.sentAt).map((row) => row.key)).toEqual(["due", "old"]);
    expect(rows.find((row) => row.key === "later")!.sentAt).toBeNull();
  });

  it("goes with the account", async () => {
    const { call, id } = await user();
    await call("PUT", "/notifications/schedule", { items: [item("a", new Date(Date.now() + HOUR))] });
    await call("POST", "/notifications/subscriptions", { endpoint: "https://push.example/uitestint", keys: { p256dh: "p", auth: "a" } });
    const me = (await call("GET", "/auth/me")).body.user;
    await call("DELETE", "/auth/me", { confirm: `donegeon/${me.username}` });
    expect(await planned(id)).toEqual([]);
    expect(await prisma.pushSubscription.count({ where: { userId: id } })).toBe(0);
  });
});

describe("snooze", () => {
  it("plans the notification again after the user's minutes, and a new plan leaves it be", async () => {
    const { call, id } = await user();
    await call("PATCH", "/auth/me", { notifications: { snoozeMinutes: 30 } });
    const at = new Date();
    await call("PUT", "/notifications/schedule", { items: [item("r:a:2026-10-20:0800", new Date(at.getTime() + 1000), "Water the plants")] });
    expect((await call("POST", "/notifications/snooze", { key: "nothing" })).status).toBe(404);
    expect((await call("POST", "/notifications/snooze", { key: "r:a:2026-10-20:0800" })).status).toBe(204);
    await call("PUT", "/notifications/schedule", { items: [] });
    const [again] = (await planned(id)).filter((row) => row.key.startsWith("snooze:"));
    expect(again.title).toBe("Water the plants");
    expect(Math.round((again.sendAt.getTime() - at.getTime()) / 60_000)).toBe(30);
    // A snooze of the snooze goes back to the first key.
    await snooze(id, again.key, new Date(at.getTime() + 5000));
    const keys = (await planned(id)).map((row) => row.key).filter((key) => key.startsWith("snooze:"));
    expect(keys.every((key) => key.startsWith("snooze:r:a:2026-10-20:0800:"))).toBe(true);
    expect(keys).toHaveLength(2);
  });
});

describe("Done on a notification", () => {
  const later = () => new Date(Date.now() + HOUR);
  const onTask = (key: string, taskId: string, params: object) => ({ ...item(key, later()), params: { taskId, press: true, actions: ["done", "snooze"], ...params } });
  const keysOf = async (id: string) => (await planned(id)).map((row) => row.key);

  async function scheduled(call: Awaited<ReturnType<typeof user>>["call"], listId: string, repeatEvery: number) {
    const task = (await call("POST", "/tasks", { title: "Brush teeth", listId })).body.task.id as string;
    await call("PATCH", `/tasks/${task}`, { repeatEvery, repeatUnit: "day", nextDue: TODAY });
    return task;
  }

  it("calls off the rest of the day and a snoozed copy, keeps tomorrow and what comes every day, and a second Done does nothing", async () => {
    const { call, id, listId } = await user();
    const task = await scheduled(call, listId, 1);
    await call("PUT", "/notifications/schedule", {
      items: [
        onTask(`r:a:${TODAY}:0900`, task, { dueDay: TODAY }),
        onTask(`r:a:${TODAY}:2100`, task, { dueDay: TODAY }),
        onTask("r:a:2026-10-21:0900", task, { dueDay: "2026-10-21" }),
        onTask(`r:all:${TODAY}:2200`, task, {}),
      ],
    });
    await call("POST", "/notifications/snooze", { key: `r:a:${TODAY}:0900` });

    expect((await call("POST", `/tasks/${task}/completions`, { fromNotification: true })).status).toBe(201);
    expect(await keysOf(id)).toEqual(["r:a:2026-10-21:0900", `r:all:${TODAY}:2200`]);

    // The same notification left lying, tapped again: the round is done, so nothing is pressed or booked.
    const again = await call("POST", `/tasks/${task}/completions`, { fromNotification: true });
    expect([again.status, again.body.completion]).toEqual([200, null]);
    expect(await prisma.taskCompletion.count({ where: { taskId: task } })).toBe(1);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task } })).nextDue).toBe("2026-10-21");
  });

  it("on a task every 2 days calls off the day between, not its next round", async () => {
    const { call, id, listId } = await user();
    const task = await scheduled(call, listId, 2);
    await call("PUT", "/notifications/schedule", { items: [onTask("r:a:2026-10-21:0900", task, { dueDay: "2026-10-21" }), onTask("r:a:2026-10-22:0900", task, { dueDay: "2026-10-22" })] });
    await call("POST", `/tasks/${task}/completions`, { fromNotification: true });
    expect(await keysOf(id)).toEqual(["r:a:2026-10-22:0900"]);
  });

  it("ticking a task stops its reminders; a press in the app leaves them to the app's next plan", async () => {
    const { call, id, listId } = await user();
    const once = (await call("POST", "/tasks", { title: "Call", listId })).body.task.id as string;
    const daily = await scheduled(call, listId, 1);
    await call("PUT", "/notifications/schedule", { items: [onTask("r:once:2026-10-21:0900", once, {}), onTask(`r:daily:${TODAY}:2100`, daily, { dueDay: TODAY })] });
    await call("POST", `/tasks/${daily}/completions`, {});
    await call("PATCH", `/tasks/${once}/toggle`, { done: true, fromNotification: true });
    expect(await keysOf(id)).toEqual([`r:daily:${TODAY}:2100`]);
  });
});

describe("the settings", () => {
  it("refuse a reminder at night, when the server is asleep", async () => {
    const { call } = await user();
    const at = (time: string) => ({ notifications: { reminders: [{ id: "a", on: true, kind: "today", days: "all", times: [time] }] } });
    expect((await call("PATCH", "/auth/me", at("23:30"))).status).toBe(400);
    expect((await call("PATCH", "/auth/me", at("06:59"))).status).toBe(400);
    expect((await call("PATCH", "/auth/me", at("22:00"))).status).toBe(200);
  });
});

describe("the recap", () => {
  it("counts the week's ticks, presses and points not taken back", async () => {
    const { call, id, listId } = await user();
    const since = new Date(Date.now() - HOUR).toISOString();
    const week = { from: "2026-10-19", to: "2026-10-25", since };
    expect(await recapText(id, week)).toBeNull();

    const a = (await call("POST", "/tasks", { title: "A", listId })).body.task;
    const b = (await call("POST", "/tasks", { title: "B", listId })).body.task;
    await call("PATCH", `/tasks/${a.id}/toggle`, { done: true });
    await call("PATCH", `/tasks/${b.id}/toggle`, { done: true });
    // Taken back: neither the tick nor its points count.
    await call("PATCH", `/tasks/${b.id}/toggle`, { done: false });
    const pressed = (await call("POST", "/tasks", { title: "Again", listId, isPersistent: true })).body.task;
    await call("POST", `/tasks/${pressed.id}/completions`, {});

    const text = await recapText(id, week);
    const points = (await call("GET", "/points")).body.balance as number;
    expect(text!.title).toBe("This week: 2 tasks done");
    expect(text!.body).toBe(`${points} points earned since Monday. Well done!`);
  });
});
