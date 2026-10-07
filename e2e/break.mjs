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
const row = (title) => p.locator(`[data-task-row]:has(textarea:text-is("${title}"))`).first();
const tick = async (title) => { await row(title).locator("input[type=checkbox]").first().click(); await wait(700); };
const reminder = p.locator("[data-break-reminder]");

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await wait(1200);
await api("/auth/me", "PATCH", { tutorialSeen: true, tickedTasks: "stay" });
const list = (await api("/lists")).json.lists[0];
for (const title of ["A", "B", "C", "D"]) await api("/tasks", "POST", { title, listId: list.id });
const again = (await api("/tasks", "POST", { title: "Again", listId: list.id })).json.task;
await api(`/tasks/${again.id}`, "PATCH", { isPersistent: true });

// --- the setting
await p.goto("http://localhost:5173/user"); await p.waitForSelector("[data-break-every-switch]");
out("the reminder is off to start with", !(await p.locator("[data-break-every-switch]").isChecked()) && (await p.locator("[data-break-every]").count()) === 0);
await p.locator("[data-break-every-switch]").click(); await wait();
out("switching it on shows the number, starting at 5", (await p.locator("[data-break-every]").inputValue()) === "5" && (await api("/auth/me")).json.user.breakEvery === 5);
await p.locator("[data-break-every]").fill("2"); await p.keyboard.press("Enter"); await wait();
out("a typed number is saved", (await api("/auth/me")).json.user.breakEvery === 2);
out("the points cap next to it is untouched", (await api("/auth/me")).json.user.pointsCap === null && !(await p.locator("[data-points-cap-switch]").isChecked()));

// --- the reminder
await p.goto("http://localhost:5173/"); await row("A").waitFor();
await tick("A");
out("nothing after the first task", (await reminder.count()) === 0);
await tick("B");
out("the second brings the reminder", (await reminder.innerText()).includes("You've just done 2 tasks, be sure to take a break to eat and drink!"), await reminder.count());
await p.screenshot({ path: process.env.SHOT ?? "break.png", clip: { x: 250, y: 450, width: 700, height: 420 } });
await p.keyboard.press("Enter"); await wait(300);
out("Enter closes it", (await reminder.count()) === 0);
await tick("B");
out("unticking shows nothing", (await reminder.count()) === 0);
await tick("C");
out("back at two it reminds again", (await reminder.count()) === 1); await reminder.locator("button").click(); await wait(300);
await row("Again").locator('button[aria-label^="Done"]').click(); await wait(700);
out("a press counts as a task: three, no reminder", (await reminder.count()) === 0);
await row("Again").locator('button[aria-label^="Done"]').click(); await wait(700);
out("four: reminder", (await reminder.getAttribute("data-break-reminder")) === "4"); await p.keyboard.press("Escape"); await wait(300);

// --- off
await api("/auth/me", "PATCH", { breakEvery: null }); await p.reload(); await row("D").waitFor();
await tick("D"); await row("Again").locator('button[aria-label^="Done"]').click(); await wait(700);
out("switched off, no reminder at six", (await reminder.count()) === 0);
await b.close();
