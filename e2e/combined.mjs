import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 1400 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 450) => p.waitForTimeout(ms);
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dmy = (n) => day(n).split("-").reverse().join("/");
const short = (n) => `${dmy(n).slice(0, 6)}${day(n).slice(2, 4)}`;
const row = (title) => p.locator(`[data-task-row]:has(textarea:text-is("${title}"))`).first();
const openMenu = async (title) => { await row(title).locator('[aria-label="Task options"]').click(); return row(title).locator('[role=dialog]'); };
const table = p.locator('[aria-label="All deadlines"]');
const lines = () => table.locator("tbody tr").evaluateAll(trs => trs.map(tr => [...tr.cells].map(c => c.textContent).join("|")));

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("h2:text-is('Goals')");
out("no table without deadlines", (await table.count()) === 0);

async function bigTask(title, subtasks, inDays, soft = false) {
  await p.locator('[data-task-editor^="add:"]').first().click(); await p.keyboard.type(title); await p.keyboard.press("Enter"); await wait();
  await p.keyboard.press("ArrowUp"); await p.keyboard.press("Control+Enter");
  for (let i = 1; i <= subtasks; i++) { await p.keyboard.type(`${title} ${i}`); await p.keyboard.press("Enter"); await wait(300); }
  await p.keyboard.press("Escape"); await wait(300);
  const m = await openMenu(title); await m.locator('input[aria-label^="Deadline date"]').fill(dmy(inDays)); await p.keyboard.press("Enter"); await wait();
  if (soft) { await m.locator('button:text-is("Soft")').click(); await wait(); }
  await p.keyboard.press("Escape"); await wait(400);
}
await bigTask("Exam", 6, 7);           // 7 tasks over 7 days: 1 per day
await bigTask("Essay", 5, 3, true);    // 6 tasks over 3 days: 2 per day (soft still counts here)

let l = await lines();
out("first three days: 1 + 2 = 3 per day", l.slice(0, 3).every((x) => x.endsWith("|13|3")), l.slice(0, 3).join(" / "));
out("after the essay's deadline: 1 per day for the exam alone", l.slice(4, 8).every((x) => x.endsWith("|7|1")), l.slice(4, 8).join(" / "));
out("merged 'Essay deadline' row just above its day", l[3] === "Essay deadline" && l[4].startsWith(`${["SUN","MON","TUE","WED","THURS","FRI","SAT"][new Date(day(3) + "T00:00:00Z").getUTCDay()]}|${short(3)}`), l.slice(3, 5).join(" / "));
out("'Exam deadline' row closes the table; the empty 0-per-day day after it is hidden", l.at(-1) === "Exam deadline" && l.at(-2).includes(short(6)), l.slice(-2).join(" / "));
out("summary: 13 tasks, 0 done, 13 left, 2 deadlines", JSON.stringify(await table.locator("[data-summary]").allInnerTexts()) === '["13","0","13","2"]');

// finish the essay: its subtasks first (a task can't be ticked before them), then the main task; only the exam's 1 per day is left
{ const essay = p.locator(`li:has(> [data-task-row] textarea:text-is("Essay"))`).first();
  if ((await essay.locator('> [data-task-row] [aria-label="Expand subtasks"]').count()) > 0) await essay.locator('> [data-task-row] [aria-label="Expand subtasks"]').click();
  const open = essay.locator("ul input[type=checkbox]:not(:checked)");
  while ((await open.count()) > 0) { await open.first().click(); await wait(350); } }
await row("Essay").locator("input[type=checkbox]").click(); await wait(250);
await wait(800); l = await lines();
out("essay done today: 6 done, exam alone at 1 per day", l[0].endsWith("|6|7|1") && l[4].endsWith("|7|1"), `${l[0]} / ${l[4]}`);
await p.screenshot({ path: "combined.png", fullPage: true });
await b.close();
