import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 950 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 450) => p.waitForTimeout(ms);
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dmy = (n) => day(n).split("-").reverse().join("/");
const outline = (scope = "body") => p.evaluate((scope) => [...document.querySelector(scope).querySelectorAll("[data-task-row]")].map(row => { let d = 0; for (let el = row.parentElement; el; el = el.parentElement) if (el.tagName === "UL") d++; return "-".repeat(d - 1) + row.querySelector("textarea").value; }).join(","), scope);
const card = (name) => p.locator(`section[data-drop-list]:has(input[aria-label="List name"])`).filter({ has: p.locator(`input[aria-label="List name"]`).and(p.locator(`[value]`)) }).filter({ hasText: "" }).locator("xpath=.").filter({ has: p.locator(`xpath=.//input[@aria-label="List name"]`) });
const listCard = async (name) => { const cards = p.locator("section[data-drop-list]"); for (let i = 0; i < await cards.count(); i++) if (await cards.nth(i).locator('input[aria-label="List name"]').inputValue() === name) return cards.nth(i); throw new Error("no list " + name); };
const row = (title) => p.locator(`[data-task-row]:has(textarea:text-is("${title}"))`).first();
const openMenu = async (title) => { await row(title).locator('[aria-label="Task options"]').click(); return row(title).locator('[role=dialog]'); };
const cells = (tr) => tr.locator("td").allInnerTexts();

await p.goto("http://localhost:5173/"); await p.waitForSelector("text=Create an account");
await p.click("text=Create an account"); await p.waitForSelector('button:text-is("Sign up")');
await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("h2:text-is('Goals')");

out("new account starts with one list 'List'", (await p.locator("section[data-drop-list]").count()) === 1 && await (await listCard("List")).isVisible());
out("no pressure card without hard deadlines", (await p.locator('[aria-label="Deadline pressure"]').count()) === 0);

// lists: create, rename
await p.fill('[aria-label="New list name"]', "School"); await p.keyboard.press("Enter"); await wait();
const nameInput = (await listCard("List")).locator('input[aria-label="List name"]');
await nameInput.fill("Home"); await nameInput.press("Enter"); await wait();
await p.reload(); await p.waitForSelector("section[data-drop-list]");
const names = await p.locator('input[aria-label="List name"]').evaluateAll(els => els.map(e => e.value).join(","));
out("user-made lists: create + rename persist", names === "Home,School", names);

// goal
await p.fill('[aria-label="New goal name"]', "Pass exams"); await p.keyboard.press("Enter"); await wait();
out("goal appears in the separate Goals box with 0 tasks", await p.locator('[aria-label="Goals"] li:has-text("Pass exams")').isVisible());

// tasks in School
const school = await listCard("School");
await school.locator('[data-task-editor^="add:"]').click();
await p.keyboard.type("Math exam"); await p.keyboard.press("Enter"); await wait();
await p.keyboard.press("ArrowUp"); await p.keyboard.press("Control+Enter");
for (const t of ["A", "B", "C"]) { await p.keyboard.type(t); await p.keyboard.press("Enter"); await wait(350); }
await p.keyboard.press("Escape");
await row("C").locator("textarea").focus(); await p.keyboard.press("Control+Enter"); await p.keyboard.type("C1"); await p.keyboard.press("Enter"); await wait(350); await p.keyboard.press("Escape");
out("keyboard adding still works inside a list", (await outline()) === "Math exam,-A,-B,-C,--C1", await outline());

// goal assignment
let menu = await openMenu("Math exam");
await menu.locator('label:has-text("Pass exams") input').click(); await wait();
out("goal assigned to the main task", await row("Math exam").locator('[title="Goal: Pass exams"]').isVisible());
// hard deadline in 5 days
await menu.locator('input[aria-label^="Deadline date"]').fill(dmy(5)); await p.keyboard.press("Enter"); await wait();
out("deadline defaults to hard and shows a dd/mm pill", (await menu.locator('button[aria-pressed=true]').innerText()) === "Hard" && (await row("Math exam").locator('[title^="Hard deadline"]').innerText()) === dmy(5).slice(0, 5));
await p.keyboard.press("Escape");
const pressure = p.locator('[aria-label="Deadline pressure"]');
out("dashboard pressure: 5 outstanding, 1 per day", (await pressure.innerText()).replace(/\s+/g, " ").includes("1 tasks to do today 5 outstanding"), (await pressure.innerText()).replace(/\s+/g, " "));
out("subtask menus: depth 1 has deadline, depth 2 does not, only main has goal", await (async () => {
  let m = await openMenu("A"); const a = (await m.locator("input[type=date]").count()) === 1 && (await m.locator("fieldset").count()) === 2; await p.keyboard.press("Escape");
  m = await openMenu("C1"); const c = (await m.locator("input[type=date]").count()) === 0; await p.keyboard.press("Escape"); return a && c; })());

// drill-in
await row("Math exam").locator('[title^="Hard deadline"]').click(); await p.waitForSelector('[aria-label="Countdown"] table');
let trs = p.locator('[aria-label="Countdown"] tbody tr');
out("countdown: one row per day, today through deadline", (await trs.count()) === 6, await trs.count());
out("countdown first row = spreadsheet maths (5 days, 5 left, 1/day)", (await cells(trs.first())).slice(2).join("|") === "5||5|1", (await cells(trs.first())).join("|"));
out("deadline day row flagged overdue", (await cells(trs.last())).slice(2).join("|") === "0||5|overdue", (await cells(trs.last())).join("|"));
out("tree shown beside the table", (await outline('[aria-label="Tasks"]')) === "Math exam,-A,-B,-C,--C1", await outline('[aria-label="Tasks"]'));
await row("A").locator("input[type=checkbox]").click(); await wait(600);
out("ticking a subtask updates today's row (1 done, 4 left, 0.8/day)", (await cells(p.locator('[aria-label="Countdown"] tr[data-today]'))).slice(2).join("|") === "5|1|4|0.8", (await cells(p.locator('[aria-label="Countdown"] tr[data-today]'))).join("|"));
out("future rows keep today's remainder", (await cells(trs.nth(4))).slice(2).join("|") === "1||4|4", (await cells(trs.nth(4))).join("|"));
await p.locator('main header input[aria-label^="Deadline date"]').fill(dmy(10)); await p.keyboard.press("Enter"); await wait(700);
out("extending the deadline recalculates the whole table", (await trs.count()) === 11 && (await cells(p.locator('[aria-label="Countdown"] tr[data-today]'))).slice(2).join("|") === "10|1|4|0.4", `${await trs.count()} rows, ${(await cells(p.locator('[aria-label="Countdown"] tr[data-today]'))).join("|")}`);
await p.locator('main header input[aria-label^="Deadline date"]').fill(dmy(-2)); await p.keyboard.press("Enter"); await wait(700);
out("deadline in the past: rows run to today, overdue", (await trs.count()) === 3 && (await cells(p.locator('[aria-label="Countdown"] tr[data-today]'))).slice(2).join("|") === "-2|1|4|overdue", `${await trs.count()} rows, ${(await cells(p.locator('[aria-label="Countdown"] tr[data-today]'))).join("|")}`);
await p.locator('main header button:text-is("Soft")').click(); await wait(700);
out("soft deadline has no countdown", await p.locator("text=No countdown").isVisible());
await p.locator('main header button:text-is("Hard")').click(); await p.locator('main header input[aria-label^="Deadline date"]').fill(dmy(5)); await p.keyboard.press("Enter"); await wait(700);
await p.screenshot({ path: "countdown.png", fullPage: true });

// back on dashboard
await p.click("text=← All tasks"); await p.waitForSelector("section[data-drop-list]"); await wait(800);
out("pressure reflects the tick: 4 outstanding, 0.8 per day", (await pressure.innerText()).replace(/\s+/g, " ").includes("0.8 tasks to do today 4 outstanding"), (await pressure.innerText()).replace(/\s+/g, " "));
// soft deadline on another task: reminder only
const home = await listCard("Home");
await home.locator('[data-task-editor^="add:"]').click(); await p.keyboard.type("Tidy desk"); await p.keyboard.press("Enter"); await wait();
menu = await openMenu("Tidy desk"); await menu.locator('input[aria-label^="Deadline date"]').fill(dmy(1)); await p.keyboard.press("Enter"); await wait(); await menu.locator('button:text-is("Soft")').click(); await wait(); await p.keyboard.press("Escape");
out("soft deadline: pill, not counted in pressure, not counted in pressure", (await row("Tidy desk").locator("a").count()) === 0 && (await row("Tidy desk").locator('[title^="Soft deadline"]').count()) === 1 && (await pressure.locator("li").count()) === 1, `${await row("Tidy desk").locator("a").count()} links, ${await row("Tidy desk").locator('[title^="Soft deadline"]').count()} soft, ${await pressure.locator("li").count()} pressure items`);

// drag between lists + deadline depth rule
async function drag(fromTitle, to, fraction = 0.5) {
  const hb = await row(fromTitle).locator('[aria-label="Drag to move this task"]').boundingBox(); const tb = await to.boundingBox();
  await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await p.mouse.down();
  await p.mouse.move(tb.x + 60, tb.y + tb.height * fraction, { steps: 6 }); await wait(60); await p.mouse.up(); await wait(600);
}
await drag("Tidy desk", (await listCard("School")).locator("header"));
out("drag a task onto another list's card", (await outline()) === "Math exam,-A,-B,-C,--C1,Tidy desk", await outline());
await drag("Tidy desk", row("C"));
out("a task with a deadline can't be dragged too deep (clear message)", await p.locator("text=has a deadline").isVisible() && (await outline()) === "Math exam,-A,-B,-C,--C1,Tidy desk", await outline());
// menu actions for touch
menu = await openMenu("B"); await menu.locator("text=Add subtask").click(); await p.keyboard.type("B1"); await p.keyboard.press("Enter"); await wait(); await p.keyboard.press("Escape");
menu = await openMenu("B1"); await menu.locator("text=Delete task").click(); await wait();
out("menu: add subtask + delete (with undo bar)", await p.locator("text=Undo (Ctrl+Z)").isVisible() && !(await outline()).includes("B1"));
// goal delete unlinks; list delete only when empty
await p.locator('[aria-label=\'Delete goal "Pass exams"\']').click(); await wait();
out("deleting a goal keeps the task, removes the chip", (await row("Math exam").count()) === 1 && (await p.locator('[title="Goal: Pass exams"]').count()) === 0);
await p.locator('[aria-label=\'Delete list "Home"\']').click(); await wait();
out("empty list deleted", (await p.locator("section[data-drop-list]").count()) === 1);
await p.screenshot({ path: "m2-dashboard.png", fullPage: true });
await b.close();
