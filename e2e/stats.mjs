import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 1400 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
console.log("USER", user);
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 450) => p.waitForTimeout(ms);
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const ddmmyyyy = (n) => day(n).split("-").reverse().join("/");
const row = (title) => p.locator(`[data-task-row]:has(textarea:text-is("${title}"))`).first();
// Tasks start with their subtasks hidden; this opens them all (without moving the focus).
const expandAll = async () => { while (await p.evaluate(() => { const closed = [...document.querySelectorAll('[aria-label="Expand subtasks"]:enabled')]; closed.forEach((b) => b.click()); return closed.length; })) await p.waitForTimeout(50); };
// The dev-date override: the app treats this day as today.
const pretend = async (n) => { await p.evaluate((d) => d ? localStorage.setItem("donegeon.devDate", d) : localStorage.removeItem("donegeon.devDate"), n === 0 ? null : day(n)); await p.reload(); await p.waitForSelector("h2:text-is('Goals')"); await wait(); await expandAll(); };
const tick = async (title) => { await row(title).locator("input[type=checkbox]").click(); await wait(350); };
const api = (path, method, body) => p.evaluate(async ([path, method, body, date]) => {
  const r = await fetch("/api" + path, { method, headers: { "Content-Type": "application/json", "X-Local-Date": date }, body: body && JSON.stringify(body) });
  return r.status === 204 ? null : r.json();
}, [path, method, body, day(0)]);
const cell = (box, label) => p.locator(`section[aria-label="${box}"] [data-summary="${label}"]`).innerText();
const bar = (box, label) => p.locator(`section[aria-label="${box}"] [data-bar="${label}"]`).getAttribute("data-value");

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("h2:text-is('Goals')");

// Three days ago: an exam with three chapters is written down. Its deadline is yesterday.
await pretend(-3);
await p.locator('[data-task-editor^="add:"]').first().click(); await p.keyboard.type("Exam"); await p.keyboard.press("Enter"); await wait();
await p.keyboard.press("ArrowUp"); await p.keyboard.press("Control+Enter");
for (const t of ["Ch 1", "Ch 2", "Ch 3"]) { await p.keyboard.type(t); await p.keyboard.press("Enter"); await wait(300); }
await p.keyboard.press("Escape"); await wait(300);
const trees = await api("/tasks", "GET");
const exam = trees.tasks.find((t) => t.title === "Exam");
await api(`/tasks/${exam.id}`, "PATCH", { deadlineDate: day(-1), deadlineType: "hard" });
const goal = (await api("/goals", "POST", { name: "Degree" })).goal;
await api(`/tasks/${exam.id}`, "PATCH", { goalIds: [goal.id] });
await p.reload(); await p.waitForSelector("h2:text-is('Goals')"); await wait(); await expandAll();
await tick("Ch 1");
// Nothing two days ago; one chapter yesterday; the last one and the exam itself today, a day late.
await pretend(-1); await tick("Ch 2");
await pretend(0);
await p.locator('[data-task-editor^="add:"]').first().click(); await p.keyboard.type("Loose end"); await p.keyboard.press("Enter"); await wait();
await p.keyboard.press("Escape"); await wait(300);
await tick("Ch 3"); await tick("Exam"); await wait(600);

await p.goto("http://localhost:5173/user"); await p.waitForSelector('section[aria-label="Done stats"]'); await wait();
out("account box still there", await p.locator("[data-username]").innerText() === user);
out("done today / week+ / all time", await cell("Done stats", "Today") === "2" && await cell("Done stats", "All time") === "4", `${await cell("Done stats", "Today")} ${await cell("Done stats", "All time")}`);
out("streak: today and yesterday", await cell("Done stats", "Streak") === "2 days" && await cell("Done stats", "Longest") === "2 days", `${await cell("Done stats", "Streak")} / ${await cell("Done stats", "Longest")}`);
const dot = (n) => p.locator(`section[aria-label="Done stats"] [data-day="${day(n)}"]`).getAttribute("data-count");
out("dots: 1, 0, 1, 2 over the four days", [await dot(-3), await dot(-2), await dot(-1), await dot(0)].join() === "1,0,1,2", [await dot(-3), await dot(-2), await dot(-1), await dot(0)].join());
out("no dot after today", await p.locator(`[data-day="${day(1)}"]`).count() === 0);
const written = await p.locator('section[aria-label="Written down"] [data-hour]').evaluateAll((els) => els.reduce((n, el) => n + Number(el.dataset.count), 0));
out("written down: all five tasks in the grid", written === 5, written);
out("hard deadline: exam late, 0 of 1 on time", (await cell("Deadlines", "Hard on time")).startsWith("0/1"), await cell("Deadlines", "Hard on time"));
out("late bar: 1 day late", await bar("Deadlines", "1 day late") === "1" && await bar("Deadlines", "On the day") === "0");
out("time to finish: median of 0, 2, 3, 3 days", await cell("Time to finish", "Written to done") === "2.5 days", await cell("Time to finish", "Written to done"));
out("written to deadline: 2 days ahead", await cell("Time to finish", "Written to deadline") === "2 days", await cell("Time to finish", "Written to deadline"));
out("buckets: same day 1, longest first bucket holds the rest", await bar("Time to finish", "Same day") === "1", await p.locator('section[aria-label="Time to finish"] [data-bar]').evaluateAll((els) => els.map((el) => `${el.dataset.bar}=${el.dataset.value}`).join(" ")));
out("unorganized: the loose end only", await cell("Unorganized", "Open tasks") === "1", await cell("Unorganized", "Open tasks"));
const group = (name) => p.locator(`section[aria-label="By list, goal or tag"] [data-group="${name}"] [data-group-done]`).innerText();
out("by list: 4 done in List", await group("List") === "4", await group("List"));
await p.locator('section[aria-label="By list, goal or tag"] button:text-is("Goals")').click(); await wait(200);
out("by goal: subtasks count under the exam's goal", await group("Degree") === "4", await group("Degree"));
out("points: balance chart ends on the balance", await p.locator(`[data-balance-day="${day(0)}"]`).getAttribute("data-balance") === "1");

// Filters.
const pick = async (label, value) => { await p.locator(`section[aria-label="Stats"] label:has-text("${label}") select`).selectOption({ label: value }); await wait(200); };
await pick("Deadline", "None");
out("deadline filter None: nothing done, loose end stays", await cell("Done stats", "All time") === "0" && await cell("Unorganized", "Open tasks") === "1", await cell("Done stats", "All time"));
await pick("Deadline", "Hard");
out("deadline filter Hard: the exam and its chapters", await cell("Done stats", "All time") === "4");
await pick("Goal", "Degree");
out("goal filter keeps them, drops the loose end", await cell("Done stats", "All time") === "4" && await cell("Unorganized", "Open tasks") === "0");
await p.locator('section[aria-label="Stats"] button:text-is("Clear")').click(); await wait(200);
out("clear brings everything back", await cell("Unorganized", "Open tasks") === "1" && await p.locator('section[aria-label="Stats"] button:text-is("Clear")').count() === 0);
await p.screenshot({ path: "stats.png", fullPage: true });
await p.setViewportSize({ width: 390, height: 800 }); await wait(400);
out("phone: no sideways scrolling", await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), await p.evaluate(() => `${document.documentElement.scrollWidth} / ${document.documentElement.clientWidth}`));
await p.screenshot({ path: "stats-phone.png", fullPage: true });
await b.close();
