import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 1400 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 450) => p.waitForTimeout(ms);
const api = (url, method, body) => p.evaluate(async ([url, method, body]) => {
  const res = await fetch("/api" + url, { method, headers: { "Content-Type": "application/json", "X-Local-Date": new Date().toLocaleDateString("sv") }, body: body && JSON.stringify(body) });
  return res.status === 204 ? null : res.json();
}, [url, method, body]);
const add = async (title, where) => (await api("/tasks", "POST", { title, ...where })).task.id;
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const row = (title) => p.locator(`[data-task-row]:has(textarea:text-is("${title}"))`).first();
// Titles of the list's task rows, top to bottom as on screen.
const order = () => p.locator("[data-drop-list] [data-task-row] textarea").evaluateAll((els) => els.map((e) => e.value).join(" "));
const today = p.locator('section[aria-label="Today"]');
const inToday = () => today.locator("[data-today-item] span.truncate:not(.text-stone-500)").evaluateAll((els) => els.map((e) => e.textContent).join(" "));
const home = async () => { await p.goto("http://localhost:5173/"); await p.waitForSelector("[data-task-row]"); await wait(); };
const setting = async (change) => { await p.goto("http://localhost:5173/user"); await p.waitForSelector("[data-deadline-today]"); await change(); await wait(); };

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("h2:text-is('Goals')");
const listId = (await api("/lists", "GET")).lists[0].id;
await add("Plain", { listId });
await add("Later", { listId, deadlineDate: day(9), deadlineType: "hard" });
await add("Other", { listId });
await add("Tomorrow", { listId, deadlineDate: day(1), deadlineType: "soft" });
await add("Now", { listId, deadlineDate: day(0), deadlineType: "hard" });
await add("Late", { listId, deadlineDate: day(-2), deadlineType: "soft" });
const main = await add("Big", { listId });
await add("s1", { parentId: main }); await add("s2", { parentId: main, deadlineDate: day(0), deadlineType: "soft" });
await home();

out("to start with: the order they were written in, none in Today", (await order()) === "Plain Later Other Tomorrow Now Late Big" && (await inToday()) === "", `${await order()} | ${await inToday()}`);

await setting(async () => {
  out("both settings are in the Settings box, off", !(await p.locator("[data-sort-by-deadline]").isChecked()) && (await p.locator("[data-deadline-today]").inputValue()) === "never");
  await p.locator("[data-sort-by-deadline]").click();
});
await p.screenshot({ path: "deadlines-settings.png", fullPage: true });
await home();
out("soonest date first, tasks without a date under them in their own order", (await order()) === "Late Now Tomorrow Later Plain Other Big", await order());
await row("Big").locator(".task-arrow").click(); await wait(250);
out("subtasks within their task too", (await order()) === "Late Now Tomorrow Later Plain Other Big s2 s1", await order());
await row("Big").locator(".task-arrow").click(); await wait(250);
await row("Other").locator("textarea").click(); await p.keyboard.press("Alt+ArrowUp"); await wait(600);
out("Alt+↑ steps over the dated ones: Other changes places with Plain", (await order()) === "Late Now Tomorrow Later Other Plain Big", await order());
await row("Now").locator("input[type=checkbox]").click(); await wait(600);
out("ticked ones still go under the open ones", (await order()) === "Late Tomorrow Later Other Plain Big Now", await order());
await row("Now").locator("input[type=checkbox]").click(); await wait(600);
await p.reload(); await p.waitForSelector("[data-task-row]"); await wait();
out("kept over a reload", (await order()) === "Late Now Tomorrow Later Other Plain Big", await order());

await setting(() => p.locator("[data-deadline-today]").selectOption("day"));
await home();
out("on their day: today's and the overdue one in Today (a subtask too), longest-waiting first", (await inToday()) === "Late Now s2", await inToday());
out("the overdue one says how long", await today.locator('[data-today-item]:has-text("Late") [data-carried="2"]').count() === 1);
out("it can't be taken out by hand", await today.locator('[data-today-item]:has-text("Now") button[aria-label^="Take"]').isDisabled());
await setting(() => p.locator("[data-deadline-today]").selectOption("dayBefore"));
await home();
out("the day before: tomorrow's too (after those that came in a day earlier), not the one in 9 days", (await inToday()) === "Late Now s2 Tomorrow", await inToday());
await p.screenshot({ path: "deadlines.png", fullPage: true });
await today.locator('[data-today-item]:has-text("Tomorrow") input[type=checkbox]').click(); await wait(700);
out("ticked there, it stays ticked for the day, under the open ones", (await inToday()) === "Late Now s2 Tomorrow" && await row("Tomorrow").locator("input[type=checkbox]").isChecked(), await inToday());

await setting(async () => { await p.locator("[data-deadline-today]").selectOption("never"); await wait(); await p.locator("[data-sort-by-deadline]").click(); });
await home();
out("both off again: the order they were put in, nothing in Today", (await inToday()) === "" && (await order()) === "Other Plain Later Now Late Big Tomorrow", `${await order()} | ${await inToday()}`);
await p.setViewportSize({ width: 390, height: 800 }); await p.goto("http://localhost:5173/user"); await wait(700);
out("the settings fit a phone", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
console.log("USER", user);
await b.close();
