import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 1400 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 450) => p.waitForTimeout(ms);
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const row = (title) => p.locator(`[data-task-row]:has(textarea:text-is("${title}"))`).first();
// Tasks start with their subtasks hidden; this opens them all (without moving the focus).
const expandAll = async () => { while (await p.evaluate(() => { const closed = [...document.querySelectorAll('[aria-label="Expand subtasks"]:enabled')]; closed.forEach((b) => b.click()); return closed.length; })) await p.waitForTimeout(50); };
const box = p.locator('section[aria-label="Done"]');
const shown = () => box.locator("[data-done-day]").getAttribute("data-done-day");
const items = () => box.locator("li").allInnerTexts().then((t) => t.map((x) => x.replace(/\s+/g, " ").trim()));
// The dev-date override: the app treats this day as today.
const pretend = async (n) => { await p.evaluate((d) => d ? localStorage.setItem("donegeon.devDate", d) : localStorage.removeItem("donegeon.devDate"), n === 0 ? null : day(n)); await p.reload(); await p.waitForSelector('section[aria-label="Done"]'); await wait(); await expandAll(); };
const tick = async (title) => { await row(title).locator("input[type=checkbox]").click(); await wait(350); };

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("h2:text-is('Goals')");

out("box is there, on today, empty", (await shown()) === day(0) && (await box.innerText()).includes("Nothing ticked off"));
out("can't step past today", await box.locator('[aria-label="Next day"]').isDisabled());

await p.locator('[data-task-editor^="add:"]').first().click(); await p.keyboard.type("Exam"); await p.keyboard.press("Enter"); await wait();
await p.keyboard.press("ArrowUp"); await p.keyboard.press("Control+Enter");
for (const t of ["Ch 1", "Ch 2", "Ch 3"]) { await p.keyboard.type(t); await p.keyboard.press("Enter"); await wait(300); }
await p.keyboard.press("Escape"); await wait(300);

await pretend(-2); await tick("Ch 1");
out("ticking shows at once", JSON.stringify(await items()) === '["Ch 1 Exam"]', (await items()).join(" / "));
await pretend(-1); await tick("Ch 2");
await pretend(0); await tick("Ch 3");

out("today: Ch 3 with its parent", JSON.stringify(await items()) === '["Ch 3 Exam"]', (await items()).join(" / "));
await box.locator('[aria-label="Previous day"]').click();
out("back one day: Ch 2", (await shown()) === day(-1) && JSON.stringify(await items()) === '["Ch 2 Exam"]', `${await shown()} ${(await items()).join(" / ")}`);
// A day before yesterday is loaded when it is shown.
await p.keyboard.press("ArrowLeft"); await wait();
out("left arrow key: Ch 1 two days ago", (await shown()) === day(-2) && JSON.stringify(await items()) === '["Ch 1 Exam"]', `${await shown()} ${(await items()).join(" / ")}`);
await box.locator('[aria-label="Previous day"]').click(); await wait();
out("three days ago: nothing", (await shown()) === day(-3) && (await box.innerText()).includes("Nothing ticked off"));
await box.locator("input[type=date]").fill(day(-1), { force: true });
out("calendar pick jumps to that day", (await shown()) === day(-1) && JSON.stringify(await items()) === '["Ch 2 Exam"]', await shown());
out("calendar can't pick a future day", (await box.locator('input[type=date]').getAttribute("max")) === day(0));
await box.locator('[aria-label="Next day"]').click();
out("forward again to today", (await shown()) === day(0) && await box.locator('[aria-label="Next day"]').isDisabled());
await tick("Ch 3");
out("unticking takes it off", (await items()).length === 0);
const ys = [await p.locator('[aria-label="Tags"]').boundingBox(), await box.boundingBox()];
out("box sits below Tags", ys[1].y > ys[0].y);
await p.screenshot({ path: "done.png", fullPage: true });

// A ticked subtask stays in its list for 24 hours, then only the Done tab has it.
await tick("Ch 3");
out("in the list: today's and yesterday's ticks still show, the one from two days ago has gone", (await row("Ch 3").count()) === 1 && (await row("Ch 2").count()) === 1 && (await row("Ch 1").count()) === 0 && (await row("Exam").innerText()).replace(/\s+/g, " ").includes("3/3 done"), (await row("Exam").innerText()).replace(/\s+/g, " "));

// The Done tab: subtasks show on the day they were ticked, though the main task is still open.
await p.click('nav [aria-label="Done"]'); await p.waitForSelector("[data-done-on]"); await wait();
const onDay = (n) => p.locator(`[data-done-on="${day(n)}"] [data-done-subtask]`).allInnerTexts().then((t) => t.map((x) => x.replace(/\s+/g, " ").trim()).join(" / "));
out("Done tab: each subtask under the day it was ticked, with its main task's name", (await onDay(0)).startsWith("Ch 3 Exam") && (await onDay(-1)).startsWith("Ch 2 Exam") && (await onDay(-2)).startsWith("Ch 1 Exam"), `${await onDay(0)} | ${await onDay(-1)} | ${await onDay(-2)}`);
out("the main task itself is not there: it isn't finished", (await p.locator("[data-finished]").count()) === 0);
await p.locator(`[data-done-on="${day(-1)}"] input[type=checkbox]`).click(); await wait(600);
out("unticking one there takes it off, and its day with it", (await p.locator(`[data-done-on="${day(-1)}"]`).count()) === 0 && (await p.locator("[data-done-subtask]").count()) === 2);
await p.click('nav [aria-label="Tasks"]'); await p.waitForSelector("section[data-drop-list]"); await wait(); await expandAll();
// A task is ticked last: the subtask unticked above goes first.
await tick("Ch 2"); await tick("Exam"); await wait(500);
await p.click('nav [aria-label="Done"]'); await p.waitForSelector("[data-done-on]"); await wait();
out("finishing the main task adds it under today; earlier subtasks keep their own days", (await p.locator(`[data-done-on="${day(0)}"] [data-finished]`).count()) === 1 && (await onDay(-2)).startsWith("Ch 1 Exam"), await onDay(-2));
await p.screenshot({ path: "done-tab.png", fullPage: true });
await b.close();
