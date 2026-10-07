import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 1400 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
console.log("USER", user);
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 450) => p.waitForTimeout(ms);
const api = (path, method = "GET", body) => p.evaluate(async ([path, method, body]) => {
  const r = await fetch("/api" + path, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
}, [path, method, body]);
const balance = async () => (await api("/points")).json.balance;
const row = (title) => p.locator(`[data-task-row]:has(textarea:text-is("${title}"))`).first();

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await wait(1200);
await api("/auth/me", "PATCH", { tutorialSeen: true });
const list = (await api("/lists")).json.lists[0];
const made = async (title, changes) => { const t = (await api("/tasks", "POST", { title, listId: list.id })).json.task; await api(`/tasks/${t.id}`, "PATCH", changes); return t; };
const again = await made("Again", { points: 10, isPersistent: true });
const once = await made("Once", { points: 1000 });
const shop = (await api("/lists", "POST", { name: "Shop", kind: "reward", defaultPoints: 15 })).json.list;
const treat = (await api("/tasks", "POST", { title: "Treat", listId: shop.id })).json.task;

// --- the setting
await p.goto("http://localhost:5173/user"); await p.waitForSelector("[data-points-cap-switch]");
out("the cap is off to start with, and has no amount field", !(await p.locator("[data-points-cap-switch]").isChecked()) && (await p.locator("[data-points-cap]").count()) === 0);
await p.locator("[data-points-cap-switch]").click(); await wait();
out("switching it on shows the amount, starting at 100", (await p.locator("[data-points-cap]").inputValue()) === "100" && (await api("/auth/me")).json.user.pointsCap === 100);
await p.locator("[data-points-cap]").fill("25"); await p.keyboard.press("Enter"); await wait();
out("a typed amount is saved", (await api("/auth/me")).json.user.pointsCap === 25, (await api("/auth/me")).json.user.pointsCap);

// --- earning
await p.goto("http://localhost:5173/"); await row("Again").waitFor();
out("an amount of four digits fits", (await row("Once").locator("[data-value-chip]").innerText()) === "+1000");
const press = row("Again").locator('button[aria-label^="Done"]');
for (let i = 0; i < 4; i++) { await press.click(); await wait(600); }
out("spamming a 10-point task stops under the cap of 25", (await balance()) === 20, await balance());
const near = async () => { const [a, b] = [await press.boundingBox(), await p.locator("[data-refusal]").boundingBox()]; return b && Math.abs(b.x - a.x) < 12 && b.y - (a.y + a.height) >= 0 && b.y - (a.y + a.height) < 12; };
out("and says why, in a popup right under the button", (await p.locator("[data-refusal]").innerText()).includes("Over your point cap of 25. Spend some points first") && await near(), await p.locator("[data-refusal]").count());
out("with no red text in the list", (await p.locator("p.text-red-600").count()) === 0);
await p.screenshot({ path: (process.env.SHOT ?? "cap.png").replace(".png", "-popup.png"), clip: await press.boundingBox().then((a) => ({ x: Math.max(0, a.x - 60), y: Math.max(0, a.y - 90), width: 700, height: 260 })) });
await p.mouse.click(600, 1300); await wait(200);
out("it goes on the next click", (await p.locator("[data-refusal]").count()) === 0);
out("the task bar's balance agrees", (await p.locator("[data-nav-balance]").getAttribute("data-nav-balance")) === "20");
await row("Once").locator("input[type=checkbox]").first().click(); await wait(700);
out("a task worth more than the room left can't be ticked", (await balance()) === 20 && !(await row("Once").locator("input[type=checkbox]").first().isChecked()), await balance());

// --- what the cap leaves alone
out("a reward can still be bought", (await api(`/tasks/${treat.id}/toggle`, "PATCH")).status === 200 && (await balance()) === 5, await balance());
await api("/auth/me", "PATCH", { pointsCap: 10 });
out("unticking it gives the points back, even past a lower cap", (await api(`/tasks/${treat.id}/toggle`, "PATCH")).status === 200 && (await balance()) === 20, await balance());
await api("/auth/me", "PATCH", { pointsCap: 30 });
out("reaching the cap exactly is allowed", (await api(`/tasks/${again.id}/completions`, "POST")).status === 201 && (await balance()) === 30, await balance());

// --- never below 0 (the balance is 30, the cap 30)
const big = (await api("/tasks", "POST", { title: "Big treat", listId: shop.id })).json.task;
await api(`/tasks/${big.id}`, "PATCH", { points: 25 });
await api(`/tasks/${big.id}/toggle`, "PATCH");
const small = await made("Small", { points: 10 });
await api(`/tasks/${small.id}/toggle`, "PATCH");
await api(`/tasks/${treat.id}/toggle`, "PATCH");
out("everything can be spent", (await balance()) === 0, await balance());
const back = await api(`/tasks/${small.id}/toggle`, "PATCH");
out("a task whose points are spent can be unticked, and the points stay as they are", back.status === 200 && back.json.task.isComplete === false && (await balance()) === 0, `${back.status} ${await balance()}`);
out("ticking it again earns its points again", (await api(`/tasks/${small.id}/toggle`, "PATCH")).status === 200 && (await balance()) === 10, await balance());
out("and unticking takes those back", (await api(`/tasks/${small.id}/toggle`, "PATCH")).status === 200 && (await balance()) === 0, await balance());
// Small's first 10 points stayed booked, so with both rewards given back the balance is 10 higher than before: 40.
await api(`/tasks/${treat.id}/toggle`, "PATCH");
await api(`/tasks/${big.id}/toggle`, "PATCH");

// --- off again
await p.goto("http://localhost:5173/user"); await p.locator("[data-points-cap-switch]").click(); await wait();
out("switching it off removes the cap", (await api("/auth/me")).json.user.pointsCap === null && (await p.locator("[data-points-cap]").count()) === 0);
out("and the big task can be ticked", (await api(`/tasks/${once.id}/toggle`, "PATCH")).status === 200 && (await balance()) === 1040, await balance());

// --- all at once
await api("/auth/me", "PATCH", { pointsCap: 1060 });
const burst = await p.evaluate((id) => Promise.all(Array.from({ length: 6 }, () => fetch(`/api/tasks/${id}/completions`, { method: "POST" }).then((r) => r.status))), again.id);
out("six presses at the same moment still stop at the cap", (await balance()) === 1060 && burst.filter((s) => s === 201).length === 2, `${await balance()} ${burst}`);
await p.screenshot({ path: process.env.SHOT ?? "cap.png" });
await b.close();
