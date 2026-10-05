import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 1400 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
console.log("USER", user);
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 450) => p.waitForTimeout(ms);
const row = (title) => p.locator(`[data-task-row]:has(textarea:text-is("${title}"))`).first();
const openMenu = async (title) => { await row(title).locator('[aria-label="Task options"]').click(); return row(title).locator("[role=dialog]"); };
const chip = async (title) => (await row(title).locator("[data-value-chip]").count()) ? row(title).locator("[data-value-chip]").innerText() : "";
const chips = async () => `${await chip("A")}|${await chip("B")}|${await chip("C")}`;
const balance = () => p.evaluate(async () => (await (await fetch("/api/points")).json()).balance);
const tick = async (title) => { await row(title).locator("input[type=checkbox]").first().click(); await wait(600); };
const setPoints = async (title, text) => { const m = await openMenu(title); await m.locator('[aria-label^="Points for this task"]').fill(text); await p.keyboard.press("Enter"); await wait(600); await p.keyboard.press("Escape"); await wait(200); };

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("h2:text-is('Goals')");
await p.locator('[data-task-editor^="add:"]').first().click(); await p.keyboard.type("Exam"); await p.keyboard.press("Enter"); await wait();
await p.keyboard.press("ArrowUp"); await p.keyboard.press("Control+Enter");
for (const t of ["A", "B", "C"]) { await p.keyboard.type(t); await p.keyboard.press("Enter"); await wait(); }
await row("C").waitFor();
await p.keyboard.press("Escape"); await wait(300);

out("subtasks are worth nothing to start with", await chips() === "||" && await chip("Exam") === "+1", `${await chip("Exam")} ${await chips()}`);
await tick("A");
out("ticking one books nothing", await balance() === 0, await balance());

await setPoints("B", "3");
out("a subtask can be given its own amount", await chips() === "|+3|", await chips());
await tick("B");
out("ticking it earns that", await balance() === 3, await balance());
await tick("B");
out("unticking takes it back", await balance() === 0, await balance());
await tick("B");

let m = await openMenu("Exam");
await m.locator('label:has-text("Subtasks earn this too") input').click(); await wait(600); await p.keyboard.press("Escape"); await wait(200);
out("handed down: subtasks without their own amount get the main task's", await chips() === "+1|+3|+1", await chips());
out("what was ticked before is not booked afterwards", await balance() === 3, await balance());
await tick("C");
out("ticking a subtask earns the main task's amount", await balance() === 4, await balance());
await setPoints("Exam", "5");
out("the main task's own amount is handed down too; booked points stay as they were", await chips() === "+5|+3|+5" && await balance() === 4, `${await chips()} ${await balance()}`);
await tick("C"); await tick("C");
out("unticked and ticked again: now worth the new amount", await balance() === 8, await balance());
await setPoints("C", "0");
out("a subtask's own 0 switches its points off", await chips() === "+5|+3|", await chips());
await setPoints("C", "");
out("emptied: back to the main task's amount", await chips() === "+5|+3|+5", await chips());
m = await openMenu("A");
out("a subtask's menu has no hand-down switch and says where its amount comes from", await m.locator('label:has-text("Subtasks earn this too")').count() === 0 && await m.locator("text=its main task's amount").count() === 1);
await p.keyboard.press("Escape"); await wait(200);
m = await openMenu("Exam");
await m.locator('label:has-text("Subtasks earn this too") input').click(); await wait(600); await p.keyboard.press("Escape"); await wait(200);
out("switched off again: only own amounts are left", await chips() === "|+3|", await chips());
await tick("Exam"); await wait(600);
out("finishing the main task books its own points only", await balance() === 13, await balance());
await b.close();
