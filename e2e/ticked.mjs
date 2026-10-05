import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 1400 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 450) => p.waitForTimeout(ms);
const row = (title) => p.locator(`[data-task-row]:has(textarea:text-is("${title}"))`).first();
const expandAll = async () => { while (await p.evaluate(() => { const closed = [...document.querySelectorAll('[aria-label="Expand subtasks"]:enabled')]; closed.forEach((b) => b.click()); return closed.length; })) await p.waitForTimeout(50); };
const tick = async (title) => { await row(title).locator("input[type=checkbox]").click(); await wait(350); };
// Titles of the task rows, top to bottom as on screen.
const order = () => p.locator("[data-task-row] textarea").evaluateAll((els) => els.map((e) => e.value).join(" "));

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("h2:text-is('Goals')");

await p.locator('[data-task-editor^="add:"]').first().click();
for (const t of ["A", "B", "C"]) { await p.keyboard.type(t); await p.keyboard.press("Enter"); await wait(300); }
await row("A").locator("textarea").click(); await p.keyboard.press("Control+Enter");
for (const t of ["a1", "a2", "a3"]) { await p.keyboard.type(t); await p.keyboard.press("Enter"); await wait(300); }
await p.keyboard.press("Escape"); await wait(300); await expandAll();
out("as written", (await order()) === "A a1 a2 a3 B C", await order());

await tick("a1");
out("a ticked subtask goes under its open siblings, not out of its task", (await order()) === "A a2 a3 a1 B C", await order());
await tick("a2");
out("ticked subtasks keep their own order", (await order()) === "A a3 a1 a2 B C", await order());
await tick("a1");
out("unticked: back in its place", (await order()) === "A a1 a3 a2 B C", await order());
await tick("A");
out("a ticked main task goes under the open main tasks", (await order()) === "B C A a1 a3 a2", await order());
await p.reload(); await p.waitForSelector("[data-task-row]"); await wait(); await expandAll();
out("the same after a reload", (await order()) === "B C A a1 a3 a2", await order());
await tick("A");
out("unticked main task: back on top", (await order()) === "A a1 a3 a2 B C", await order());

// Alt+arrows swap with the row next to it on screen, stepping over the ticked one in between.
await tick("B");
out("B ticked", (await order()) === "A a1 a3 a2 C B", await order());
await row("C").locator("textarea").click(); await p.keyboard.press("Alt+ArrowUp"); await wait();
out("Alt+Up moves C above A", (await order()) === "C A a1 a3 a2 B", await order());
await p.keyboard.press("Alt+ArrowDown"); await wait();
out("Alt+Down moves it back under A", (await order()) === "A a1 a3 a2 C B", await order());
await b.close();
