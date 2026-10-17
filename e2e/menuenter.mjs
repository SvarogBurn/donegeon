import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 400) => p.waitForTimeout(ms);
const api = (url, method, body) => p.evaluate(async ([url, method, body]) => {
  const res = await fetch("/api" + url, { method, headers: { "Content-Type": "application/json", "X-Local-Date": new Date().toLocaleDateString("sv") }, body: body && JSON.stringify(body) });
  return res.status === 204 ? null : res.json();
}, [url, method, body]);
const row = (title) => p.locator(`[data-task-row]:has(textarea:text-is("${title}"))`).first();
const menu = p.locator("[role=dialog][aria-label='Task options']");
const open = async () => { await row("Task").locator('[aria-label="Task options"]').click(); await wait(250); };
const isOpen = async () => (await menu.count()) === 1;
const rows = () => p.locator("[data-task-row]").count();

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("h2:text-is('Goals')");
const listId = (await api("/lists", "GET")).lists[0].id;
const id = (await api("/tasks", "POST", { title: "Task", listId })).task.id;
const task = async () => (await api("/tasks", "GET")).tasks.find((t) => t.id === id);
await p.reload(); await p.waitForSelector("[data-task-row]"); await wait();

await open(); await p.keyboard.press("Enter"); await wait();
out("Enter right after opening closes it, and it stays closed", !(await isOpen()));
await open(); await menu.locator('[data-menu-part="today"] input').click(); await wait(); await p.keyboard.press("Enter"); await wait();
out("after ticking a box: Enter closes, the tick is kept, no new task is started", !(await isOpen()) && (await task()).todaySince !== null && (await rows()) === 1);
await open(); await menu.locator('[data-menu-part="points"] input').fill("7"); await p.keyboard.press("Enter"); await wait(600);
out("in the points field: Enter saves and closes", !(await isOpen()) && (await task()).points === 7, (await task()).points);
await open(); await menu.locator('[data-menu-part="deadline"] input[aria-label^="Deadline date"]').fill("25/12/2030"); await p.keyboard.press("Enter"); await wait(600);
out("in the date field: Enter saves and closes", !(await isOpen()) && (await task()).deadlineDate === "2030-12-25", (await task()).deadlineDate);
await open(); await menu.locator('[data-menu-part="deadline"] input[aria-label^="Deadline date"]').fill("nonsense"); await p.keyboard.press("Enter"); await wait(600);
out("a date that can't be read keeps it open, with its message", (await isOpen()) && (await menu.locator("text=Use day/month/year").count()) === 1 && (await task()).deadlineDate === "2030-12-25");
await p.keyboard.press("Escape"); await wait();
await open(); await menu.locator('button:text-is("Soft")').click(); await wait(); await p.keyboard.press("Enter"); await wait(600);
out("after Hard / Soft: Enter closes, the choice is kept", !(await isOpen()) && (await task()).deadlineType === "soft", (await task()).deadlineType);
await open(); await menu.locator('[aria-label="Pick the date from a calendar"]').focus();
// A day picked in the calendar, as the browser reports it: the button that opened it still has the focus.
await menu.locator('input[type=date]').evaluate((el) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "2031-01-15"); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
await wait(600); const kept = await isOpen(); await p.keyboard.press("Enter"); await wait(600);
out("after picking a day in the calendar: the menu is still open, Enter closes it instead of opening the calendar again", kept && !(await isOpen()) && (await task()).deadlineDate === "2031-01-15", (await task()).deadlineDate);
await open(); await menu.locator('[aria-label="Pick the date from a calendar"]').focus(); await p.keyboard.press("Enter"); await wait();
out("on the calendar button Enter opens the calendar: the menu stays", await isOpen());
await p.keyboard.press("Escape"); await wait(); if (await isOpen()) { await p.keyboard.press("Escape"); await wait(); }
await open(); await menu.locator('button:text-is("Add subtask")').focus(); await p.keyboard.press("Enter"); await wait();
out("on Add subtask Enter adds a subtask", !(await isOpen()) && (await p.locator('[data-task-editor]:focus').count()) === 1);
await b.close();
