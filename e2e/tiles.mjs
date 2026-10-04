import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 600) => p.waitForTimeout(ms);
const tile = (key) => p.locator(`[data-tile="${key}"]`);
// Which column each tile is in (by its left edge), top to bottom: "today,list:A | goals | done".
const shape = () => p.locator("[data-tile]").evaluateAll((els) => { const cols = new Map(); for (const e of els) { const r = e.getBoundingClientRect(); const x = Math.round(r.x); if (!cols.has(x)) cols.set(x, []); cols.get(x).push([r.y, e.dataset.tile.startsWith("list:") ? "list:" + e.querySelector('input[aria-label="List name"]').value : e.dataset.tile]); } return [...cols.entries()].sort((a, b) => a[0] - b[0]).map(([, tiles]) => tiles.sort((a, b) => a[0] - b[0]).map((t) => t[1]).join(",")).join(" | "); });
const keyOf = async (name) => { const n = await p.locator('[data-tile^="list:"]').count(); for (let i = 0; i < n; i++) { const t = p.locator('[data-tile^="list:"]').nth(i); if ((await t.locator('input[aria-label="List name"]').inputValue()) === name) return t.getAttribute("data-tile"); } };
const drag = async (key, to) => { await tile(key).locator(".tile-band").evaluate((el) => el.scrollIntoView({ block: "center" })); await wait(200); const h = await tile(key).locator('[aria-label^="Drag to move"]').first().boundingBox(); await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await p.mouse.down(); await p.mouse.move(h.x + 60, h.y + 60, { steps: 4 }); const t = await to(); await p.mouse.move(t.x, t.y - 20, { steps: 8 }); await p.mouse.move(t.x, t.y, { steps: 4 }); await wait(150); await p.mouse.up(); await wait(); };
const newColumn = async () => { const z = await p.locator('[data-zone="new"]').boundingBox(); return { x: z.x + z.width / 2, y: z.y + 60 }; };
const below = (key) => async () => { const r = await tile(key).boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height - 6 }; };

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', "uitest" + Date.now()); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("section[data-drop-list]"); await wait();
for (const name of ["Fun", "Admin", "Rewards"]) { await p.fill('[aria-label="New list name"]', name); await p.locator('[aria-label="New list name"]').press("Enter"); await wait(); }
// Enough tasks that the page needs a scrollbar, which deleting a list can then take away again.
for (let i = 1; i <= 14; i++) { await p.locator('[data-task-editor^="add:"]').nth(1).click(); await p.keyboard.type("Fun " + i); await p.keyboard.press("Enter"); await wait(250); }
await p.keyboard.press("Escape");
const fun = await keyOf("Fun"), admin = await keyOf("Admin"), rewards = await keyOf("Rewards");

// Arrange in a tall window, so every tile is on screen to drag; then go back to an ordinary one.
await p.setViewportSize({ width: 1500, height: 3200 }); await wait();
await drag("today", newColumn); await drag(admin, below("today")); await drag("done", newColumn); await drag(rewards, below("done"));
await p.setViewportSize({ width: 1500, height: 900 }); await wait();
out("the page needs a scrollbar before the delete", await p.evaluate(() => document.documentElement.scrollHeight > innerHeight));
const before = await shape();
out("three columns arranged", before.split(" | ").length === 3, before);
const fits = () => p.locator("[data-tile-grid]").getAttribute("data-fits");
const fitsBefore = await fits();

await tile(fun).locator('[aria-label^="Delete list"]').click(); await wait(900);
const after = await shape();
out("deleting a list only removes that list: every other tile stays in its column and order", after === before.replace(",list:Fun", ""), `\n  before: ${before}\n  after:  ${after}`);
out("the number of columns that fit did not change with the page's height", (await fits()) === fitsBefore, `${fitsBefore} -> ${await fits()}`);
out("Today is still on the page", await tile("today").isVisible());
await p.keyboard.press("Control+z"); await wait(900);
out("undo puts the list back where it was", (await shape()) === before, await shape());

for (const width of [1150, 800]) { await p.setViewportSize({ width, height: 900 }); await wait(); }
const narrow = await shape();
out("a narrower window folds the columns but loses no tile", narrow.split(/[|,]/).length === before.split(/[|,]/).length, narrow);
await p.setViewportSize({ width: 1500, height: 900 }); await wait();
out("and the wide arrangement is back unchanged afterwards", (await shape()) === before, await shape());
await p.reload(); await p.waitForSelector("section[data-drop-list]"); await wait();
out("and after a reload", (await shape()) === before, await shape());

// A column whose only tile isn't on screen (here: "All deadlines", which exists only while there is a deadline)
// must not count as a column: dragging a tile out to a new column used to land it back under the first one.
const soon = (() => { const d = new Date(); d.setDate(d.getDate() + 5); return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`; })();
const row = (t) => p.locator(`[data-task-row]:has(textarea:text-is("${t}"))`).first();
await p.setViewportSize({ width: 1500, height: 3200 }); await wait();
await p.locator('[data-task-editor^="add:"]').first().click(); await p.keyboard.type("Exam"); await p.keyboard.press("Enter"); await wait(); await p.keyboard.press("Escape");
await row("Exam").locator('[aria-label="Task options"]').click(); await wait(300);
await row("Exam").locator('[role=dialog] [aria-label^="Deadline date"]').fill(soon); await p.keyboard.press("Enter"); await wait(800); await p.keyboard.press("Escape"); await p.mouse.click(5, 400); await wait();
await drag("done", below("today")); await drag(rewards, below("today"));
out("with a deadline, its boxes exist; two columns in use", (await tile("deadlines").count()) === 1 && (await shape()).split(" | ").length === 2, await shape());
await drag("deadlines", newColumn);
out("All deadlines alone in a third column", (await shape()).endsWith(" | deadlines"), await shape());
await row("Exam").locator('[aria-label="Task options"]').click(); await wait(300);
await row("Exam").locator('[role=dialog] >> text=Remove').click(); await wait(800); await p.keyboard.press("Escape"); await p.mouse.click(5, 400); await wait();
out("deadline removed: that column is gone from the screen", (await tile("deadlines").count()) === 0 && (await shape()).split(" | ").length === 2, await shape());
await drag("tags", newColumn);
out("a tile dragged to a new column lands in a third column, not back under the first", (await shape()).endsWith(" | tags"), await shape());
await drag("done", below("tags"));
out("and more tiles can be added to that third column", (await shape()).endsWith(" | tags,done"), await shape());
await p.reload(); await p.waitForSelector("section[data-drop-list]"); await wait();
out("still so after a reload", (await shape()).endsWith(" | tags,done"), await shape());
await b.close();
