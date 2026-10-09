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

await p.goto("http://localhost:5173/stats"); await p.waitForSelector('section[aria-label="Done stats"]'); await wait();
out("opened from the Stats tab in the task bar", await p.locator('nav [aria-label="Stats"][aria-current="page"]').count() === 1 && await p.locator("[data-username]").count() === 0);
out("done today / week+ / all time", await cell("Done stats", "Today") === "2" && await cell("Done stats", "All time") === "4", `${await cell("Done stats", "Today")} ${await cell("Done stats", "All time")}`);
out("streak: today and yesterday", await cell("Done stats", "Streak") === "2 days" && await cell("Done stats", "Longest") === "2 days", `${await cell("Done stats", "Streak")} / ${await cell("Done stats", "Longest")}`);
await p.goto("http://localhost:5173/user"); await p.waitForSelector("[data-streak]"); await wait(200);
out("the user's page shows the same streak in its Account box", await p.locator('section[aria-label="Account"] [data-streak]').getAttribute("data-streak") === "2" && await p.locator("[data-streak-longest]").getAttribute("data-streak-longest") === "2");
out("and the tasks done this year", await p.locator('section[aria-label="Account"] [data-done-year]').getAttribute("data-done-year") === String([-3, -1, 0, 0].filter((n) => day(n).startsWith(day(0).slice(0, 4))).length), await p.locator("[data-done-year]").getAttribute("data-done-year"));
await p.goto("http://localhost:5173/stats"); await p.waitForSelector('section[aria-label="Done stats"]'); await wait();
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
{ // A click on a number lists the tasks it counts.
  const tasks = p.locator("[data-stat-tasks]");
  await p.locator('section[aria-label="Unorganized"] [data-summary="Open tasks"]').click(); await wait(300);
  out("a click on Open tasks lists the open tasks it counts", await tasks.locator("[data-stat-task]").count() === 1, await tasks.innerText().catch(() => "no list"));
  await p.keyboard.press("Escape"); await wait(200);
  await p.locator('section[aria-label="Done stats"] [data-summary="All time"]').click(); await wait(300);
  out("a click on Done / All time lists everything done", await tasks.locator("[data-stat-task]").count() === Number(await cell("Done stats", "All time")), await tasks.locator("[data-stat-task]").count());
  await p.keyboard.press("Escape"); await wait(200);
  await p.locator('section[aria-label="Deadlines"] [data-summary="Hard on time"]').click(); await wait(300);
  out("a click on Hard on time lists them, with how late", (await tasks.innerText()).includes("1 day late"));
  await p.keyboard.press("Escape"); await wait(200);
  out("Escape closes the list", await tasks.count() === 0);
  await p.locator('section[aria-label="Unorganized"] [data-summary="Open tasks"]').click(); await wait(300);
  await tasks.locator("[data-stat-task]").click(); await p.waitForSelector("[data-task-row]"); await wait(600);
  out("a click on a listed task goes to its row on the Tasks page", new URL(p.url()).pathname === "/" && await p.locator("[data-task-row][data-found]").count() === 1);
  await p.goBack(); await p.waitForSelector('section[aria-label="Unorganized"]'); await wait(600);
}
const group = (name) => p.locator(`section[aria-label="By list, goal or tag"] [data-group="${name}"] [data-group-done]`).innerText();
out("by list: 4 done in List", await group("List") === "4", await group("List"));
await p.locator('section[aria-label="By list, goal or tag"] button:text-is("Goals")').click(); await wait(200);
out("by goal: subtasks count under the exam's goal", await group("Degree") === "4", await group("Degree"));
out("points: balance chart ends on the balance", await p.locator(`[data-balance-day="${day(0)}"]`).getAttribute("data-balance") === "1");

// The boxes are tiles like the dashboard's: moved by their tab button, minimized, with their own saved arrangement.
const tiles = () => p.locator("[data-tile]").evaluateAll((els) => els.map((e) => e.dataset.tile).join(","));
const hiddenRow = p.locator('[aria-label="Hidden boxes"]');
out("eight boxes, the filter among them, each with a pin, a move and a hide button", (await tiles()) === "filter,done,written,deadlines,time,groups,points,unorganized" && await p.locator('[data-tile] [aria-label^="Drag to move"]').count() === 8 && await p.locator('[aria-label^="Hide "]').count() === 8 && await p.locator('[data-tile] [aria-label^="Pin "]').count() === 8, await tiles());
await p.click('[aria-label="Hide Written down"]'); await wait();
await p.click('[aria-label="Hide Points"]'); await wait();
out("hidden boxes leave the page for the Hidden row", (await tiles()) === "filter,done,deadlines,time,groups,unorganized" && (await hiddenRow.innerText()).replace(/\s+/g, " ") === "Hidden: Written down Points", `${await tiles()} / ${await hiddenRow.innerText()}`);
{ // Drag "Unorganized" above "Done".
  await p.locator('[data-tile="unorganized"] .tile-band').evaluate((el) => el.scrollIntoView({ block: "center" })); await wait(200);
  const h = await p.locator('[data-tile="unorganized"] [aria-label^="Drag to move"]').boundingBox();
  await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await p.mouse.down(); await p.mouse.move(h.x, h.y - 30, { steps: 4 });
  await p.locator('[data-tile="done"]').evaluate((el) => el.scrollIntoView({ block: "start" })); await wait(300);
  const t = await p.locator('[data-tile="done"]').boundingBox();
  await p.mouse.move(t.x + t.width / 2, Math.max(t.y + 8, 8), { steps: 8 }); await wait(200); await p.mouse.up(); await wait(600);
}
out("a box can be dragged to another place", (await tiles()) === "filter,unorganized,done,deadlines,time,groups", await tiles());
await p.reload(); await p.waitForSelector('section[aria-label="Done stats"]'); await wait();
out("arrangement and hidden boxes survive a reload", (await tiles()) === "filter,unorganized,done,deadlines,time,groups" && await hiddenRow.locator("button").count() === 2, await tiles());
await hiddenRow.locator('button:text-is("Points")').click(); await wait();
await hiddenRow.locator('button:text-is("Written down")').click(); await wait();
out("brought back where they were", (await tiles()) === "filter,unorganized,done,written,deadlines,time,groups,points" && await hiddenRow.count() === 0, await tiles());
await p.goto("http://localhost:5173/"); await p.waitForSelector("section[data-drop-list]"); await wait();
const home = await p.locator("[data-tile]").evaluateAll((els) => els.map((e) => e.dataset.tile.replace(/^list:.*/, "list")).join(","));
out("the dashboard keeps its own arrangement", home.endsWith("goals,today,list,newList,tags,done") && !home.includes("unorganized") && await hiddenRow.count() === 0, home);
await p.goto("http://localhost:5173/stats"); await p.waitForSelector('section[aria-label="Done stats"]'); await wait();

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

// The filter is a tile too: pinned across the top, or out into a column of its own.
await p.click('[aria-label="Pin Stats filter"]'); await wait();
out("the filter can be pinned", await p.locator('[data-zone="pinned"] [data-tile="filter"]').count() === 1);
await p.click('[aria-label="Unpin Stats filter"]'); await wait();
{ // Drag the filter out to a new column at the right.
  await p.locator('[data-tile="filter"]').evaluate((el) => el.scrollIntoView({ block: "center" })); await wait(200);
  const h = await p.locator('[data-tile="filter"] [aria-label^="Drag to move"]').boundingBox();
  await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await p.mouse.down(); await p.mouse.move(h.x + 20, h.y + 10, { steps: 4 }); await wait(200);
  const z = await p.locator('[data-zone="new"]').boundingBox();
  await p.mouse.move(z.x + z.width / 2, Math.max(z.y, 0) + 60, { steps: 8 }); await wait(200); await p.mouse.up(); await wait(600);
}
out("the filter can go in a second column", await p.locator('[data-zone="1"] [data-tile="filter"]').count() === 1 && await p.locator('[data-zone="0"] [data-tile="done"]').count() === 1);
await p.click('[aria-label="Hide Stats filter"]'); await wait();
out("and be minimized, back from the Hidden row", (await hiddenRow.innerText()).includes("Stats filter") && await p.locator('section[aria-label="Stats"]').count() === 0);
await hiddenRow.locator('button:text-is("Stats filter")').click(); await wait();
await p.screenshot({ path: "stats.png", fullPage: true });
await p.setViewportSize({ width: 390, height: 800 }); await wait(400);
out("phone: no sideways scrolling", await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), await p.evaluate(() => `${document.documentElement.scrollWidth} / ${document.documentElement.clientWidth}`));
await p.screenshot({ path: "stats-phone.png", fullPage: true });
await b.close();
