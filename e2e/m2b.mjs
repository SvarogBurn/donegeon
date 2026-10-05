import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 950 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 450) => p.waitForTimeout(ms);
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dmy = (n) => day(n).split("-").reverse().join("/");
const row = (title) => p.locator(`[data-task-row]:has(textarea:text-is("${title}"))`).first();
const openMenu = async (title) => { await row(title).locator('[aria-label="Task options"]').click(); return row(title).locator('[role=dialog]'); };
const pill = (title) => row(title).locator('[title^="Hard deadline"], [title^="Soft deadline"]').first();
const bg = (loc) => loc.evaluate(el => getComputedStyle(el).backgroundColor);
const path = () => new URL(p.url()).pathname;
const setDeadline = async (title, n) => { const m = await openMenu(title); await m.locator('input[aria-label^="Deadline date"]').fill(dmy(n)); await p.keyboard.press("Enter"); await wait(); await p.keyboard.press("Escape"); await wait(300); };

await p.goto("http://localhost:5173/"); await p.waitForSelector("text=Create an account");
await p.click("text=Create an account"); await p.waitForSelector('button:text-is("Sign up")');
await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("h2:text-is('Goals')");

// "Exam" with 9 subtasks = 10 tasks
await p.locator('[data-task-editor^="add:"]').first().click();
await p.keyboard.type("Exam"); await p.keyboard.press("Enter"); await wait();
await p.keyboard.press("ArrowUp"); await p.keyboard.press("Control+Enter");
for (let i = 1; i <= 9; i++) { await p.keyboard.type("S" + i); await p.keyboard.press("Enter"); await wait(300); }
await p.keyboard.press("Escape"); await wait();

// pill colours on the absolute scale
await setDeadline("Exam", 2);
out("pill: dd/mm, no flag, no outline", (await pill("Exam").innerText()) === dmy(2).slice(0, 5) && (await pill("Exam").evaluate(el => getComputedStyle(el).borderTopWidth)) === "0px", await pill("Exam").innerText());
out("5 per day = yellow #FFD666", (await bg(pill("Exam"))) === "rgb(255, 214, 102)", await bg(pill("Exam")));
await setDeadline("Exam", 1);
out("10 per day = red #FF0000", (await bg(pill("Exam"))) === "rgb(255, 0, 0)", await bg(pill("Exam")));
await setDeadline("Exam", 10);
out("1 per day = mostly green (blend toward yellow)", (await bg(pill("Exam"))) === "rgb(121, 192, 131)", await bg(pill("Exam")));
let m = await openMenu("Exam"); await m.locator('button:text-is("Soft")').click(); await wait(); await p.keyboard.press("Escape"); await wait(300);
out("soft deadline pill is coloured the same way", (await bg(pill("Exam"))) === "rgb(121, 192, 131)" && (await pill("Exam").getAttribute("title")).startsWith("Soft"), await bg(pill("Exam")));
m = await openMenu("Exam"); await m.locator('button:text-is("Hard")').click(); await wait(); await p.keyboard.press("Escape"); await wait(300);

// row: no green completion date; clicks
await row("S1").locator("input[type=checkbox]").click(); await wait(700);
out("ticked row shows no completion date", !/\d\d\/\d\d/.test(await row("S1").innerText()), await row("S1").innerText());
await row("Exam").locator("textarea").click(); await wait(200);
out("clicking the title edits, stays on the dashboard", path() === "/");
await row("Exam").locator('[aria-label="Collapse subtasks"]').click(); await wait(200);
const collapsed = (await p.locator('[data-task-row]:has(textarea:text-is("S1"))').count()) === 0;
await row("Exam").locator('[aria-label="Expand subtasks"]').click(); await wait(200);
out("expand arrow still collapses/expands, no navigation", collapsed && path() === "/");
m = await openMenu("Exam"); const menuOpen = await m.isVisible(); await m.locator("legend").first().click(); await wait(200); await p.keyboard.press("Escape");
out("⋯ menu opens (and clicks inside it) without navigating", menuOpen && path() === "/");
await row("S3").locator("input[type=checkbox]").click(); await wait(500);
out("checkbox ticks without navigating", path() === "/" && await row("S3").locator("input[type=checkbox]").isChecked());
await row("S3").locator("input[type=checkbox]").click(); await wait(500);
await row("Exam").locator(":text('/9 done')").click(); await p.waitForURL(/\/tasks\//);
const examId = path().split("/")[2];
out("clicking a row's empty space opens its detail page", /^\/tasks\/[0-9a-f-]{36}$/.test(path()), path());

// detail page
await p.waitForSelector('[aria-label="Countdown"] table');
const summary = async () => Object.fromEntries(await p.locator('[aria-label="Countdown"] [data-summary]').evaluateAll(els => els.map(e => [e.dataset.summary, e.textContent.trim()])));
const s0 = await summary();
out("summary cells: Tasks 10 / Done 1 / Left 9 / Days 10", JSON.stringify(s0) === JSON.stringify({ Tasks: "10", Done: "1", Left: "9", Days: "10" }), JSON.stringify(s0));
const headers = await p.locator('[aria-label="Countdown"] thead th').allInnerTexts();
out("columns: Day Date Days left Done Left Per day", headers.join("|") === "Day|Date|Days left|Done|Left|Per day", headers.join("|"));
const today = p.locator('[aria-label="Countdown"] tr[data-today]');
const tcells = await today.locator("td").allInnerTexts();
const names = ["SUN", "MON", "TUE", "WED", "THURS", "FRI", "SAT"];
const wd = names[new Date(`${day(0)}T00:00:00Z`).getUTCDay()];
out("today's row: weekday name, dd/mm/yy, 10 days, 1 done, 9 left, 0.9", tcells.join("|") === `${wd}|${dmy(0).slice(0, 6)}${day(0).slice(2, 4)}|10|1|9|0.9`, tcells.join("|"));
const dayColors = await p.locator('[aria-label="Countdown"] tbody tr').evaluateAll(trs => trs.map(tr => [tr.cells[0].textContent, getComputedStyle(tr.cells[0]).backgroundColor]));
const expected = { MON: "rgb(249, 203, 156)", TUE: "rgb(255, 229, 153)", WED: "rgb(182, 215, 168)", THURS: "rgb(162, 196, 201)", FRI: "rgb(159, 197, 232)", SAT: "rgb(213, 166, 189)", SUN: "rgb(234, 153, 153)" };
out("day cells use the sheet's weekday colours", dayColors.every(([n, c]) => expected[n] === c), JSON.stringify(dayColors.slice(0, 3)));
const sunLine = await p.locator('[aria-label="Countdown"] tbody tr').evaluateAll(trs => trs.filter(tr => tr.cells[0].textContent === "SUN").map(tr => getComputedStyle(tr.cells[2]).borderBottomWidth));
out("heavier line under Sunday rows", sunLine.length > 0 && sunLine.every(w => w === "2px"), sunLine.join(","));
out("visible grid lines", (await today.locator("td").nth(3).evaluate(el => getComputedStyle(el).borderRightWidth)) === "1px");

// optimistic tick: the table changes before the server answers
await p.route("**/api/tasks/*/toggle", async (route) => { await new Promise(r => setTimeout(r, 1500)); await route.continue(); });
await row("S2").locator("input[type=checkbox]").click(); await wait(250);
const quick = (await today.locator("td").allInnerTexts()).slice(3).join("|"), quickSummary = (await summary()).Done;
out("tick updates Done / Left / Per day immediately", quick === "2|8|0.8" && quickSummary === "2", `${quick}, summary Done ${quickSummary}`);
await wait(1800); await p.unroute("**/api/tasks/*/toggle");
out("…and stays right after the server answers", (await today.locator("td").allInnerTexts()).slice(3).join("|") === "2|8|0.8");
await p.screenshot({ path: "m2b-detail.png", fullPage: true });

// subtask rows on the detail page open their own page; old URL redirects
await row("S4").locator('[aria-label="Drag to move this task"]').click(); await wait(200);
out("drag dots don't navigate", path() === `/tasks/${examId}`);
await p.goto(`http://localhost:5173/tasks/${examId}/countdown`); await p.waitForSelector('[aria-label="Countdown"] table');
out("old /countdown URL redirects to the detail page", path() === `/tasks/${examId}`, path());
const s5 = row("S5"); const box = await s5.boundingBox(); await p.mouse.click(box.x + box.width - 120, box.y + box.height / 2); await wait(400);
out("a plain subtask has no page: clicking its row does nothing", path() === `/tasks/${examId}`, path());

// adding tasks on the page
await row("Exam").locator("textarea").click(); await p.keyboard.press("End"); await p.keyboard.press("Enter"); await wait(200);
await p.keyboard.type("S0"); await p.keyboard.press("Enter"); await wait(600); await p.keyboard.press("Escape"); await wait(300);
await p.locator('[aria-label="Add a subtask, then press Enter"]').fill("S10"); await p.keyboard.press("Enter"); await wait(700);
const pageTitles = await p.locator('[aria-label="Tasks"] [data-task-row] textarea').evaluateAll(e => e.map(x => x.value).join(","));
out("Enter on the big task adds a subtask; the add field appends one", pageTitles === "Exam,S0,S1,S2,S3,S4,S5,S6,S7,S8,S9,S10", pageTitles);
out("…and the table counts them", (await summary()).Tasks === "12", JSON.stringify(await summary()));

// days go by: rows stay anchored at the day the task was written down, past days with nothing done read 0
await p.evaluate((d) => localStorage.setItem("donegeon.devDate", d), day(3)); await p.reload(); await p.waitForSelector('[aria-label="Countdown"] table'); await wait(400);
const firstDates = await p.locator('[aria-label="Countdown"] tbody tr').evaluateAll(trs => trs.slice(0, 4).map(tr => tr.cells[1].textContent + ":" + tr.cells[3].textContent));
const short = (n) => `${dmy(n).slice(0, 6)}${day(n).slice(2, 4)}`;
out("three days later: table still starts on the creation day", firstDates[0].startsWith(short(0)), firstDates.join(" "));
out("past days with nothing done show 0; today blank", firstDates.join(" ") === `${short(0)}:2 ${short(1)}:0 ${short(2)}:0 ${short(3)}:`, firstDates.join(" "));
out("page not scrolled to today", (await p.evaluate(() => window.scrollY)) === 0);
await p.evaluate(() => localStorage.removeItem("donegeon.devDate"));

// pages only for big tasks
await p.goto("http://localhost:5173/"); await p.waitForSelector("section[data-drop-list]");
await p.locator('[data-task-editor^="add:"]').first().click(); await p.keyboard.type("Small"); await p.keyboard.press("Enter"); await wait();
m = await openMenu("Small"); await m.locator('input[aria-label^="Deadline date"]').fill(dmy(4)); await p.keyboard.press("Enter"); await wait(); await p.keyboard.press("Escape"); await wait(300);
await pill("Small").click(); await wait(400);
out("hard deadline but no subtasks: no page", path() === "/", path());
const smallId = await row("Small").getAttribute("data-task-row");
await p.goto(`http://localhost:5173/tasks/${smallId}`); await wait(800);
out("its URL sends you back to the dashboard", path() === "/", path());

await p.goto("http://localhost:5173/"); await p.waitForSelector("section[data-drop-list]"); await wait(500);
// Subtasks start hidden on the dashboard, until the row's arrow is clicked.
const hidden = (await row("Exam").count()) === 1 && (await row("S1").count()) === 0;
await row("Exam").locator('[aria-label="Expand subtasks"]').click(); await wait(200);
out("subtasks start collapsed; the arrow shows them", hidden && (await row("S1").count()) === 1);
await p.screenshot({ path: "m2b-dashboard.png", fullPage: true });
await b.close();
