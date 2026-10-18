import { chromium } from "playwright";
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1200, height: 1000 } });
const user = "uitest" + Date.now();
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);

// The host, played here: "asleep" answers 503 in the server's place, "drop" cuts the connection under every change.
let mode = "ok"; let asked = []; let reached = [];
await ctx.route("**/api/**", async (route) => {
  const req = route.request(); const what = `${req.method()} ${new URL(req.url()).pathname}`;
  asked.push(what);
  if (mode === "asleep") return route.fulfill({ status: 503, contentType: "text/html", body: "Service Unavailable" });
  if (mode === "drop" && req.method() !== "GET") return route.abort("connectionreset");
  reached.push(what); return route.continue();
});
const fresh = () => { asked = []; reached = []; };
const toggles = (list) => list.filter((what) => /^PATCH .*\/toggle$/.test(what)).length;

let p = await ctx.newPage();
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
const wait = (ms = 450) => p.waitForTimeout(ms);
const row = (title) => p.locator(`[data-task-row]:has(textarea:text-is("${title}"))`).first();
const ticked = (title) => row(title).locator("input[type=checkbox]").isChecked();
const notice = (state) => p.locator(`[data-server-status="${state}"]`);
const lost = () => p.locator("[data-save-failure]");

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("h2:text-is('Goals')");
await p.locator('[data-task-editor^="add:"]').first().click();
for (const t of ["A", "B", "C"]) { await p.keyboard.type(t); await p.keyboard.press("Enter"); await wait(300); }
out("nothing said while the server answers", (await p.locator("[data-server-status]").count()) === 0);

// The server asleep: a tick and a new task wait for it, and are saved once it is up.
mode = "asleep"; fresh();
await row("A").locator("input[type=checkbox]").click();
await p.locator('[data-task-editor^="add:"]').first().click(); await p.keyboard.type("D"); await p.keyboard.press("Enter");
out("the tick shows at once", await ticked("A"));
await notice("waking").waitFor({ timeout: 5000 }).catch(() => {});
out("says it is waking the server", await notice("waking").isVisible(), await p.locator("[data-server-status]").innerText().catch(() => "nothing"));
out("nothing reached the server meanwhile", reached.length === 0 && toggles(asked) >= 1, reached.join(", "));
mode = "ok";
await p.locator("[data-server-status]").waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
out("the notice goes when it answers", (await p.locator("[data-server-status]").count()) === 0);
await row("D").waitFor({ timeout: 5000 }).catch(() => {}); await wait();
out("the tick was saved, once", toggles(reached) === 1, String(toggles(reached)));
await p.reload(); await p.waitForSelector("[data-task-row]");
out("both are there after a reload", (await ticked("A")) && (await row("D").count()) === 1);

// The connection cut under a tick: it is sent again until it gets through (the server takes a tick sent twice as one),
// and the tick stays on meanwhile.
mode = "drop"; fresh();
await row("B").locator("input[type=checkbox]").click();
await wait(2500);
out("sent again while the connection drops", toggles(asked) >= 2 && toggles(reached) === 0, `${toggles(asked)} asked, ${toggles(reached)} reached`);
out("the tick stays on meanwhile", await ticked("B"));
mode = "ok"; await wait(5000);
out("saved once it gets through", toggles(reached) === 1, String(toggles(reached)));
out("nothing said about it", (await lost().count()) === 0 && (await p.locator("[data-refusal]").count()) === 0);
await p.reload(); await p.waitForSelector("[data-task-row]");
out("the tick is there after a reload", await ticked("B"));
await p.close();

// The clock in hand, for the minutes of waiting.
p = await ctx.newPage(); await p.clock.install();
await p.goto("http://localhost:5173/"); await p.waitForSelector("[data-task-row]");

// Away from the page for a while: back on it, the server is asked before anything is clicked.
const show = (hidden) => p.evaluate((hidden) => { Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden }); document.dispatchEvent(new Event("visibilitychange")); }, hidden);
await show(true); await p.clock.fastForward("02:00"); fresh(); await show(false); await wait();
out("back on the page: asks whether the server is up", asked.includes("GET /api/health"), asked.join(", "));
await show(true); await p.clock.fastForward("00:10"); fresh(); await show(false); await wait();
out("not after a moment away", !asked.includes("GET /api/health"), asked.join(", "));

// The server staying away: gives up after two minutes, and "Try again" finds it.
mode = "asleep"; fresh();
await row("C").locator("input[type=checkbox]").click(); await wait(2500);
out("waking, at first", await notice("waking").isVisible());
for (let i = 0; i < 4 && !(await notice("down").count()); i++) { await p.clock.fastForward("01:00"); await wait(); }
out("gives up: can't reach the server", /Can't reach the server/.test(await notice("down").innerText().catch(() => "")), await p.locator("[data-server-status]").innerText().catch(() => "nothing"));
await p.clock.fastForward("03:00"); await wait();
out("goes on saying so while it asks again by itself", (await notice("down").count()) === 1 && (await notice("waking").count()) === 0);
out("the tick waits on the device, still on", /1 change waiting/.test(await notice("down").innerText().catch(() => "")) && (await ticked("C")) && (await lost().count()) === 0, await notice("down").innerText().catch(() => "nothing"));
out("it never reached the server", toggles(reached) === 0);
mode = "ok"; await p.click("text=Try again");
await notice("up").waitFor({ timeout: 3000 }).catch(() => {});
out("Try again finds it", (await notice("down").count()) === 0 && (await notice("waking").count()) === 0);
await p.clock.fastForward("00:30"); await wait(1500);
out("and the waiting tick is saved, once", toggles(reached) === 1, String(toggles(reached)));
await p.reload(); await p.waitForSelector("[data-task-row]");
out("it is there after a reload", await ticked("C"));
await b.close();
