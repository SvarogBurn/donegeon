import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Status = typeof import("./serverStatus");

const up = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
const asleep = () => new Response("Service Unavailable", { status: 503 });
const SIX_MINUTES = 6 * 60_000;

let fetchMock: ReturnType<typeof vi.fn>;
let status: Status;

beforeEach(async () => {
  vi.useFakeTimers();
  fetchMock = vi.fn(async () => up());
  vi.stubGlobal("fetch", fetchMock);
  // Its state lives in the module: every test starts with a page just loaded.
  vi.resetModules();
  status = await import("./serverStatus");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ensureAwake", () => {
  it("asks nothing when the server answered a moment ago", async () => {
    await status.ensureAwake();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks after a long silence, and once for everyone waiting", async () => {
    vi.advanceTimersByTime(SIX_MINUTES);
    await Promise.all([status.ensureAwake(), status.ensureAwake(), status.ensureAwake()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await status.ensureAwake();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks when forced, and after a request that got no answer", async () => {
    await status.ensureAwake(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    status.markStale();
    await status.ensureAwake();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not take the host's page for the app's answer", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>Starting…</html>", { status: 200 }));
    const awake = status.ensureAwake(true);
    await vi.advanceTimersByTimeAsync(1000);
    await awake;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("says it is waking only when that takes a while, then that it is up", async () => {
    fetchMock.mockImplementation(async () => asleep());
    const seen: string[] = [];
    status.onServerStatus(() => seen.push(status.getServerStatus().state));
    const awake = status.ensureAwake(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(status.getServerStatus().state).toBe("up");
    await vi.advanceTimersByTimeAsync(1000);
    expect(status.getServerStatus().state).toBe("waking");
    fetchMock.mockImplementation(async () => up());
    await vi.advanceTimersByTimeAsync(5000);
    await awake;
    expect(seen).toEqual(["waking", "up"]);
  });

  it("shows nothing for a quick check", async () => {
    const changed = vi.fn();
    status.onServerStatus(changed);
    await status.ensureAwake(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(changed).not.toHaveBeenCalled();
  });

  it("gives up after two minutes, and finds the server again later", async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });
    const awake = status.ensureAwake(true);
    const failed = expect(awake).rejects.toThrow("Can't reach the server");
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    await failed;
    expect(status.getServerStatus().state).toBe("down");

    fetchMock.mockImplementation(async () => up());
    // Asking again by itself, it goes on saying it gave up.
    fetchMock.mockImplementationOnce(async () => asleep());
    const again = status.ensureAwake();
    expect(status.getServerStatus().state).toBe("down");
    await vi.advanceTimersByTimeAsync(500);
    expect(status.getServerStatus().state).toBe("down");
    await vi.advanceTimersByTimeAsync(500);
    await again;
    expect(status.getServerStatus().state).toBe("up");
  });

  it("shows at once that it is trying again when the user asks", async () => {
    fetchMock.mockImplementation(async () => asleep());
    const failed = expect(status.ensureAwake(true)).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    await failed;
    status.tryAgain();
    expect(status.getServerStatus().state).toBe("waking");
    fetchMock.mockImplementation(async () => up());
    await vi.advanceTimersByTimeAsync(1000);
    expect(status.getServerStatus().state).toBe("up");
  });
});

describe("a lost change", () => {
  it("is told of until dismissed", () => {
    status.reportFailure("Not saved");
    expect(status.getServerStatus().failure).toBe("Not saved");
    status.dismissFailure();
    expect(status.getServerStatus().failure).toBeNull();
  });
});
