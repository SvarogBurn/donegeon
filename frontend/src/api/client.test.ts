import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Client = typeof import("./client");

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const asleep = (status = 503) => new Response("Service Unavailable", { status });
const dropped = () => Promise.reject(new TypeError("Failed to fetch"));

/** What each request to the API gets, in order; the "is it up?" checks in between always pass. */
let answers: (() => Response | Promise<Response>)[];
let sent: string[];
let client: Client;

beforeEach(async () => {
  answers = [];
  sent = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/health") return json({ ok: true });
      sent.push(`${init?.method} ${url}`);
      return answers.shift()!();
    }),
  );
  vi.resetModules();
  client = await import("./client");
});

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("sends a change again when the host answered in the server's place", async () => {
    answers = [() => asleep(503), () => asleep(502), () => json({ id: "t1" })];
    await expect(client.api("/tasks/t1/toggle", { method: "POST" })).resolves.toEqual({ id: "t1" });
    expect(sent).toEqual(["POST /api/tasks/t1/toggle", "POST /api/tasks/t1/toggle", "POST /api/tasks/t1/toggle"]);
  });

  it("gives up on a change the host keeps answering for", async () => {
    answers = [() => asleep(), () => asleep(), () => asleep()];
    const failed = await client.api("/tasks", { body: { title: "One" } }).catch((error) => error);
    expect(failed).toMatchObject({ status: 503, message: "The server didn't answer, so this wasn't saved" });
    expect(client.isUnreachable(failed)).toBe(true);
    expect(sent).toHaveLength(3);
  });

  it("sends a change once when the connection dropped: it may have arrived", async () => {
    answers = [dropped];
    const failed = await client.api("/tasks/t1/toggle", { method: "POST" }).catch((error) => error);
    expect(failed).toMatchObject({ status: 0, message: "The connection dropped while saving. Check whether it went through" });
    expect(client.isUnreachable(failed)).toBe(true);
    expect(sent).toHaveLength(1);
  });

  it("sends a change once when the host timed out waiting for the server", async () => {
    answers = [() => asleep(504)];
    await expect(client.api("/tasks/t1", { method: "PATCH", body: {} })).rejects.toMatchObject({ status: 504 });
    expect(sent).toHaveLength(1);
  });

  it("asks again for what it only reads, whatever went wrong", async () => {
    answers = [dropped, () => asleep(504), () => json({ tasks: [] })];
    await expect(client.api("/tasks")).resolves.toEqual({ tasks: [] });
    expect(sent).toHaveLength(3);
  });

  it("passes the app's own refusals on untouched", async () => {
    answers = [() => json({ error: "Not enough points" }, 409)];
    const failed = await client.api("/tasks/t1/press", { method: "POST" }).catch((error) => error);
    expect(failed).toMatchObject({ status: 409, message: "Not enough points" });
    expect(client.isUnreachable(failed)).toBe(false);
    expect(sent).toHaveLength(1);
  });

  it("says the server can't be reached when it never wakes", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(dropped));
    const { markStale } = await import("../lib/serverStatus");
    markStale();
    const failed = client.api("/tasks").catch((error) => error);
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(await failed).toMatchObject({ status: 0, message: "Can't reach the server" });
    vi.useRealTimers();
  });
});
