import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1000, height: 800 } });
const user = "uitest" + Date.now();
const titles = () => p.evaluate(() => [...document.querySelectorAll("[data-task-row] textarea")].map(t => t.value));
const focused = () => p.evaluate(() => document.activeElement?.value ?? document.activeElement?.tagName);
const out = (n, ok, d="") => console.log(ok ? "PASS" : "FAIL", n, d);
await p.goto("http://localhost:5173/"); await p.waitForSelector("text=Create an account");
await p.click("text=Create an account"); await p.waitForSelector('button:text-is("Sign up")');
await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("section[data-drop-list]");
await p.locator('[data-task-editor^="add:"]').click();
for (const t of ["One", "Two", "Three"]) { await p.keyboard.type(t); await p.keyboard.press("Enter"); await p.waitForTimeout(300); }
await p.keyboard.press("ArrowUp"); await p.keyboard.press("ArrowUp");            // on Two
await p.keyboard.press("Control+Enter"); await p.keyboard.type("Two-child"); await p.keyboard.press("Enter"); await p.waitForTimeout(300); await p.keyboard.press("Escape");
out("no text buttons on rows", (await p.locator('[data-task-row] button:text("Subtask"), [data-task-row] button:text("Delete")').count()) === 0);
// Delete mid-title edits text
await p.locator('textarea:text-is("Three")').focus(); await p.keyboard.press("Home"); await p.keyboard.press("Delete"); await p.waitForTimeout(300);
out("Delete mid-title removes a character only", (await titles()).join() === "One,Two,Two-child,hree", (await titles()).join());
// Arrow onto Two (caret lands at end), Delete removes it with its subtask
await p.keyboard.press("ArrowUp"); await p.keyboard.press("ArrowUp");
out("arrow lands on Two", (await focused()) === "Two", await focused());
await p.keyboard.press("Delete"); await p.waitForTimeout(400);
out("Delete removes task and its subtask", (await titles()).join() === "One,hree", (await titles()).join());
out("focus moves to previous task", (await focused()) === "One", await focused());
await p.keyboard.press("Delete"); await p.waitForTimeout(400);
out("Delete on first task, focus goes to next", (await titles()).join() === "hree" && (await focused()) === "hree", (await titles()).join() + " / " + await focused());
await p.reload(); await p.waitForSelector("[data-task-row]");
out("deletion persisted", (await titles()).join() === "hree");
await p.screenshot({ path: "rows.png" });
await b.close();
