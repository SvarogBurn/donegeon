import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1000, height: 800 } });
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
const outline = () => p.evaluate(() => [...document.querySelectorAll("[data-task-row]")].map(row => { let d = 0; for (let el = row.parentElement; el; el = el.parentElement) if (el.tagName === "UL") d++; return "-".repeat(d - 1) + row.querySelector("textarea").value; }).join(","));
// Tasks start with their subtasks hidden; this opens them all (without moving the focus).
const expandAll = async () => { while (await p.evaluate(() => { const closed = [...document.querySelectorAll('[aria-label="Expand subtasks"]:enabled')]; closed.forEach((b) => b.click()); return closed.length; })) await p.waitForTimeout(50); };
const focused = () => p.evaluate(() => document.activeElement?.value ?? document.activeElement?.tagName);
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d);
const wait = (ms = 400) => p.waitForTimeout(ms);
await p.goto("http://localhost:5173/"); await p.waitForSelector("text=Create an account");
await p.click("text=Create an account"); await p.waitForSelector('button:text-is("Sign up")');
await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("section[data-drop-list]");
await p.locator('[data-task-editor^="add:"]').click();
for (const t of ["One", "Two", "Three"]) { await p.keyboard.type(t); await p.keyboard.press("Enter"); await wait(300); }
await p.keyboard.press("ArrowUp"); await p.keyboard.press("ArrowUp");
await p.keyboard.press("Control+Enter"); await p.keyboard.type("Kid"); await p.keyboard.press("Enter"); await wait(300); await p.keyboard.press("Escape");
await p.locator('[data-task-row]:has(textarea:text-is("Kid")) input[type=checkbox]').click(); await wait();
const start = await outline();
await p.locator('textarea:text-is("Two")').focus(); await p.keyboard.press("End");
await p.keyboard.press("Delete"); await wait();
out("delete removes Two and Kid", (await outline()) === "One,Three", await outline());
out("undo bar appears", await p.locator('text=Deleted “Two”').isVisible());
await p.keyboard.press("Control+z"); await wait(); await expandAll();
out("Ctrl+Z restores task and subtask in place", (await outline()) === start, await outline());
// The date isn't shown on rows any more (it feeds the countdown table), so ask the API.
const kidDone = await p.evaluate(async () => { const find = (ns) => ns.flatMap(n => [n, ...find(n.children)]); return find((await (await fetch("/api/tasks")).json()).tasks).find(t => t.title === "Kid")?.completedOn; });
out("completion date kept on restored subtask", /^\d{4}-\d{2}-\d{2}$/.test(kidDone ?? ""), kidDone);
out("focus returns to restored task", (await focused()) === "Two", await focused());
out("bar gone after undo", (await p.locator('text=Undo (Ctrl+Z)').count()) === 0);
// two deletes, undo in reverse order
await p.keyboard.press("Delete"); await wait(); await p.locator('textarea:text-is("Three")').focus(); await p.keyboard.press("End"); await p.keyboard.press("Delete"); await wait();
out("two deletes stack", (await outline()) === "One" && await p.locator('text=and 1 more').isVisible(), await outline());
await p.keyboard.press("Control+z"); await wait();
const mid = await outline();
await p.click("text=Undo (Ctrl+Z)"); await wait(); await expandAll();
out("undo in reverse order (key, then button)", mid === "One,Three" && (await outline()) === start, mid + " | " + await outline());
// Ctrl+Z is normal text undo when nothing is deleted
await p.locator('textarea:text-is("One")').focus(); await p.keyboard.press("End"); await p.keyboard.type("XY"); await p.keyboard.press("Control+z"); await wait(200);
out("Ctrl+Z still undoes typing otherwise", !(await focused()).includes("XY") && (await outline()).split(",").length === 4, await focused());
await p.keyboard.press("Escape");
// bar expires
await p.locator('textarea:text-is("Three")').focus(); await p.keyboard.press("End"); await p.keyboard.press("Delete"); await wait(10600);
out("bar expires after ~10s", (await p.locator('text=Undo (Ctrl+Z)').count()) === 0);
await p.reload(); await p.waitForSelector("[data-task-row]"); await expandAll();
out("expired delete stays deleted after reload", !(await outline()).includes("Three"), await outline());
await b.close();
