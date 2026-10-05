import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 1400 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
console.log("USER", user);
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 450) => p.waitForTimeout(ms);
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const row = (title) => p.locator(`[data-task-row]:has(textarea:text-is("${title}"))`).first();
// The dev-date override: the app treats this day as today.
const pretend = async (n) => { await p.evaluate((d) => d ? localStorage.setItem("donegeon.devDate", d) : localStorage.removeItem("donegeon.devDate"), n === 0 ? null : day(n)); await p.reload(); await p.waitForSelector("[data-task-row]"); await wait(); };
const openMenu = async (title) => { await row(title).locator('[aria-label="Task options"]').click(); return row(title).locator("[role=dialog]"); };
const today = p.locator('section[aria-label="Today"]');
const inToday = (title) => today.locator(`[data-today-item]:has-text("${title}")`).count();
const due = (title) => row(title).locator("[data-next-due]").getAttribute("data-next-due");
const chip = (title) => row(title).locator("[data-next-due]").innerText();
const press = async (title) => { await row(title).locator(".repeat-button").click(); await wait(600); };

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("h2:text-is('Goals')");
for (const t of ["Shot", "Laundry"]) { await p.locator('[data-task-editor^="add:"]').first().click(); await p.keyboard.type(t); await p.keyboard.press("Enter"); await wait(); }
await p.keyboard.press("Escape"); await wait(300);

// Every 3 weeks, starting today.
let m = await openMenu("Shot");
const offered = await m.locator('[aria-label^="Repeat every"]').count();
await m.locator('label:has-text("Persistent") input').click(); await wait(600);
out("the schedule is offered once Persistent is ticked", offered === 0 && await m.locator('[aria-label^="Repeat every"]').count() === 1);
await m.locator('[aria-label^="Repeat every"]').fill("3"); await p.keyboard.press("Enter"); await wait(600);
out("with a schedule the task is due today", await due("Shot") === day(0) && await chip("Shot") === "due today", await chip("Shot"));
out("the menu shows the next day and what it is counted from", (await m.locator('[aria-label^="Next due date"]').inputValue()) === day(0).split("-").reverse().join("/") && await m.locator('button:text-is("Planned days")').getAttribute("aria-pressed") === "true");
await p.keyboard.press("Escape"); await wait(200);
out("the chip says how often", await row("Shot").locator("[data-next-due]").getAttribute("title") === "Repeats every 3 weeks");
out("a due task comes into Today by itself", await inToday("Shot") === 1 && await inToday("Laundry") === 0);

await press("Shot");
out("done: next round in 3 weeks, greyed, out of Today", await due("Shot") === day(21) && (await chip("Shot")).startsWith("next ") && await inToday("Shot") === 0 && await row("Shot").locator("textarea.text-stone-400").count() === 1, `${await due("Shot")} ${await chip("Shot")}`);
await p.keyboard.press("Control+z"); await wait(700);
out("Ctrl+Z: due today again", await due("Shot") === day(0) && await inToday("Shot") === 1, await due("Shot"));
await press("Shot");

await pretend(20);
out("the day before: still waiting", (await chip("Shot")).startsWith("next ") && await inToday("Shot") === 0);
await pretend(21);
out("three weeks on: due, in Today", await chip("Shot") === "due today" && await inToday("Shot") === 1, await chip("Shot"));
await pretend(23);
out("two days late: due since its day", (await chip("Shot")).startsWith("due since ") && await today.locator("[data-today-item] [data-carried='2']").count() === 1, await chip("Shot"));
await today.locator("[data-today-item] .repeat-button").click(); await wait(600);
out("planned days: done late from Today, the next round keeps its day", await due("Shot") === day(42), await due("Shot"));

await pretend(44);
m = await openMenu("Shot");
await m.locator('button:text-is("After done")').click(); await wait(600); await p.keyboard.press("Escape"); await wait(200);
await press("Shot");
out("after done: counted from the day it was done", await due("Shot") === day(65), await due("Shot"));

// The next day can be set by hand; days and months work too.
m = await openMenu("Shot");
await m.locator('[aria-label^="Next due date"]').fill(day(50).split("-").reverse().join("/")); await p.keyboard.press("Enter"); await wait(600);
out("the next day can be typed", await due("Shot") === day(50), await due("Shot"));
await m.locator('[aria-label="Days, weeks or months"]').selectOption("month"); await wait(600);
await m.locator('[aria-label^="Repeat every"]').fill("1"); await p.keyboard.press("Enter"); await wait(600);
out("every month", await row("Shot").locator("[data-next-due]").getAttribute("title") === "Repeats every month", await row("Shot").locator("[data-next-due]").getAttribute("title"));
await m.locator('[aria-label^="Repeat every"]').fill(""); await p.keyboard.press("Enter"); await wait(600);
out("emptying the number takes the schedule off; the task stays persistent", await row("Shot").locator("[data-next-due]").count() === 0 && await m.locator('label:has-text("Persistent") input').isChecked());
await m.locator('[aria-label^="Repeat every"]').fill("2"); await p.keyboard.press("Enter"); await wait(600);
await m.locator('label:has-text("Persistent") input').click(); await wait(600);
const gone = await row("Shot").locator("[data-next-due]").count() === 0 && await row("Shot").locator(".repeat-button").count() === 0 && await m.locator('[aria-label^="Repeat every"]').count() === 0;
await m.locator('label:has-text("Persistent") input').click(); await wait(600);
out("switching Persistent off takes the schedule with it", gone && (await m.locator('[aria-label^="Repeat every"]').inputValue()) === "");
await p.keyboard.press("Escape"); await wait(200);

// A task with a deadline can't repeat.
m = await openMenu("Laundry");
await m.locator('input[aria-label^="Deadline date"]').fill(day(50).split("-").reverse().join("/")); await p.keyboard.press("Enter"); await wait(600);
await m.locator('label:has-text("Persistent") input').click(); await wait(600);
out("a task with a deadline can't be persistent, so it gets no schedule", await m.locator("text=can't have a deadline").count() >= 1 && await m.locator('[aria-label^="Repeat every"]').count() === 0);
await p.keyboard.press("Escape");
await pretend(0);
await b.close();
