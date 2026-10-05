import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 1400 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 500) => p.waitForTimeout(ms);
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const row = (title) => p.locator(`[data-task-row]:has(textarea:text-is("${title}"))`).first();
// Tasks start with their subtasks hidden; this opens them all (without moving the focus).
const expandAll = async () => { while (await p.evaluate(() => { const closed = [...document.querySelectorAll('[aria-label="Expand subtasks"]:enabled')]; closed.forEach((b) => b.click()); return closed.length; })) await p.waitForTimeout(50); };
const card = (name) => p.locator(`section[data-drop-list]:has(input[aria-label="List name"][value="${name}"])`);
const cardOf = async (name) => { const n = await p.locator("section[data-drop-list]").count(); for (let i = 0; i < n; i++) { const c = p.locator("section[data-drop-list]").nth(i); if ((await c.locator('input[aria-label="List name"]').inputValue()) === name) return c; } };
const balance = async () => Number(await p.locator("[data-nav-balance]").getAttribute("data-nav-balance"));
const chip = (title) => row(title).locator("[data-value-chip]").innerText();
const titles = async (c) => c.locator("[data-task-row] textarea").evaluateAll((els) => els.map((e) => e.value).join(","));
const add = async (c, title) => { await c.locator('[data-task-editor^="add:"]').click(); await p.keyboard.type(title); await p.keyboard.press("Enter"); await wait(); };
const menu = async (title) => { await row(title).locator('[aria-label="Task options"]').click(); return row(title).locator("[role=dialog]"); };
const pretend = async (n) => { await p.evaluate((d) => d ? localStorage.setItem("donegeon.devDate", d) : localStorage.removeItem("donegeon.devDate"), n === 0 ? null : day(n)); await p.reload(); await p.waitForSelector("section[data-drop-list]"); await wait(); await expandAll(); };
const today = p.locator('[aria-label="Today"]');

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("section[data-drop-list]"); await wait();

// --- lists carry the points
const main = await cardOf("List");
out("first list is a task list worth 1", (await main.getAttribute("data-list-kind")) === "task" && (await main.locator('[aria-label="Points per item"]').inputValue()) === "1");
await main.locator('[aria-label="Points per item"]').fill("5"); await p.keyboard.press("Enter"); await wait();
await p.fill('[aria-label="New list name"]', "Fun");
await p.locator('form .kind-switch').last().click();
await p.locator('form [aria-label="Points per item"]').last().fill("10");
await p.locator('[aria-label="New list name"]').press("Enter"); await wait();
const fun = await cardOf("Fun");
out("new-list form makes a reward list worth 10", (await fun.getAttribute("data-list-kind")) === "reward" && (await fun.locator('[aria-label="Points per item"]').inputValue()) === "10");
await p.fill('[aria-label="New list name"]', "Chores"); await p.locator('[aria-label="New list name"]').press("Enter"); await wait();
const chores = await cardOf("Chores");
out("form resets: next list is a task list worth 1", (await chores.getAttribute("data-list-kind")) === "task" && (await chores.locator('[aria-label="Points per item"]').inputValue()) === "1");

await add(main, "Essay"); await add(main, "Own"); await add(main, "Plain"); await add(fun, "Movie"); await add(fun, "Cake");
await p.keyboard.press("Escape");
out("rows show what they are worth", (await chip("Essay")) === "+5" && (await chip("Movie")) === "−10", `${await chip("Essay")} ${await chip("Movie")}`);

// --- tick / untick, Done tab
out("balance starts at 0", (await balance()) === 0);
await row("Movie").locator("input[type=checkbox]").click(); await wait(700);
out("a reward you can't afford is refused", (await balance()) === 0 && (await titles(fun)).includes("Movie") && await p.locator("text=Not enough points").first().isVisible());
await row("Essay").locator("input[type=checkbox]").click(); await wait(700);
out("ticking a main task: +5, stays ticked in its list, undo bar", (await balance()) === 5 && (await row("Essay").locator("input[type=checkbox]").isChecked()) && await p.locator("text=Finished “Essay”").isVisible(), `${await balance()} / ${await titles(main)}`);
await p.keyboard.press("Control+z"); await wait(700);
out("Ctrl+Z unticks it and reverses the points", (await balance()) === 0 && !(await row("Essay").locator("input[type=checkbox]").isChecked()), `${await balance()} / ${await titles(main)}`);
await row("Essay").locator("input[type=checkbox]").click(); await wait(700);
await p.click('nav [aria-label="Done"]'); await wait();
out("Done tab lists it under today", (await p.locator(`[data-done-on="${day(0)}"] [data-finished]`).count()) === 1 && (await p.locator("[data-finished]").innerText()).includes("Essay"));
await p.locator("[data-finished] input[type=checkbox]").click(); await wait(700);
out("unticking in the Done tab takes the points back", (await balance()) === 0 && (await p.locator("[data-finished]").count()) === 0);
await p.click('nav [aria-label="Tasks"]'); await p.waitForSelector("section[data-drop-list]"); await wait();
out("and it is open again in its list, in place", (await titles(await cardOf("List"))) === "Essay,Own,Plain" && !(await row("Essay").locator("input[type=checkbox]").isChecked()), await titles(await cardOf("List")));

// --- own amount travels, default follows the list
let m = await menu("Own"); await m.locator('[aria-label^="Points for this task"]').fill("8"); await p.keyboard.press("Enter"); await wait(); await p.keyboard.press("Escape");
out("hand-set amount shows on the row", (await chip("Own")) === "+8", await chip("Own"));
const drag = async (title, target) => { const h = await row(title).locator('[aria-label="Drag to move this task"]').boundingBox(); const t = await target.locator('[data-task-editor^="add:"]').boundingBox(); await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await p.mouse.down(); await p.mouse.move(t.x + 40, t.y + t.height / 2, { steps: 8 }); await p.mouse.up(); await wait(700); };
await drag("Own", await cardOf("Chores")); await drag("Plain", await cardOf("Chores"));
out("moved to a list worth 1: own amount stays 8, default becomes 1", (await chip("Own")) === "+8" && (await chip("Plain")) === "+1", `${await chip("Own")} ${await chip("Plain")}`);

// --- buying rewards; changing a list's kind
await row("Own").locator("input[type=checkbox]").click(); await wait(700);
await row("Essay").locator("input[type=checkbox]").click(); await wait(700);
out("earned 8 + 5", (await balance()) === 13, await balance());
await row("Movie").locator("input[type=checkbox]").click(); await wait(700);
out("buying a reward: −10, stays ticked in its list", (await balance()) === 3 && (await row("Movie").locator("input[type=checkbox]").isChecked()), await balance());
await (await cardOf("Chores")).locator('.kind-switch').click(); await wait(700);
out("list kind can be changed later; balance untouched", (await chip("Plain")) === "−1" && (await balance()) === 3, `${await chip("Plain")} ${await balance()}`);

// --- persistent
m = await menu("Cake"); await m.locator('label:has-text("Persistent") input').click(); await wait(); await p.keyboard.press("Escape");
m = await menu("Cake"); await m.locator('[aria-label^="Points for this task"]').fill("1"); await p.keyboard.press("Enter"); await wait(); await p.keyboard.press("Escape");
const press = row("Cake").locator('button[aria-label^="Done"]');
// The ticked copies under a persistent task: one for every time it was done in the last 24 hours.
const copies = p.locator('section[data-drop-list] [data-press-copy]');
out("persistent item has a button instead of a checkbox", (await press.count()) === 1 && (await row("Cake").locator("input[type=checkbox]").count()) === 0);
await press.click(); await wait(700); await press.click(); await wait(700);
out("each press leaves a ticked, crossed-off copy underneath; the task itself stays open", (await copies.count()) === 2 && await copies.first().locator("input[type=checkbox]").isChecked() && (await copies.first().locator(".line-through").innerText()) === "Cake" && (await row("Cake").locator("input[type=checkbox]").count()) === 0 && (await row("Cake").locator("textarea.line-through").count()) === 0, await copies.count());
out("two presses: −2, still in its list, counted", (await balance()) === 1 && (await row("Cake").locator("[data-pressed-today]").getAttribute("data-pressed-today")) === "2", await balance());
await p.keyboard.press("Control+z"); await wait(700);
out("Ctrl+Z takes one press back", (await balance()) === 2 && (await row("Cake").locator("[data-pressed-today]").getAttribute("data-pressed-today")) === "1", await balance());
await press.click(); await wait(700); await press.click(); await wait(700); await press.click(); await wait(700);
out("a persistent reward you can't afford is refused too", (await balance()) === 0 && (await row("Cake").locator("[data-pressed-today]").getAttribute("data-pressed-today")) === "3", await balance());
out("three presses, three copies", (await copies.count()) === 3);
await copies.first().locator("input[type=checkbox]").click(); await wait(700);
out("unticking a copy takes that press back", (await balance()) === 1 && (await row("Cake").locator("[data-pressed-today]").getAttribute("data-pressed-today")) === "2" && (await copies.count()) === 2, await balance());
await press.click(); await wait(700);
out("Done box shows the presses", (await p.locator('section[aria-label="Done"]').innerText()).replace(/\s+/g, " ").includes("Cake ×3"));

// --- points history
await p.click("[data-nav-balance]"); await p.waitForSelector('[aria-label="History"]');
const history = (await p.locator('[aria-label="History"]').innerText()).replace(/\s+/g, " ");
out("history has earned, spent and taken-back rows", ["Earned", "Spent", "Taken back"].every((w) => history.includes(w)) && (await p.locator("[data-balance]").getAttribute("data-balance")) === "0");
{ // On a phone the history must stay inside its box.
  const size = p.viewportSize(); await p.setViewportSize({ width: 390, height: 800 }); await wait(400);
  const past = await p.evaluate(() => { const box = document.querySelector('[aria-label="History"] .tile-body').getBoundingClientRect(); return Math.max(...[...document.querySelectorAll('[aria-label="History"] .tile-body *')].map((el) => el.getBoundingClientRect().right - box.right)); });
  out("phone: the history stays inside its box, no sideways scrolling", past <= 0 && await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), past);
  await p.setViewportSize(size); await wait(400);
}
await p.click('nav [aria-label="Tasks"]'); await p.waitForSelector("section[data-drop-list]"); await wait();

// --- Today
out("Today box is there, empty, before anything is marked", (await today.count()) === 1 && (await today.locator("[data-today-item]").count()) === 0);
await add(await cardOf("List"), "Report"); await p.keyboard.press("ArrowUp"); await p.keyboard.press("Control+Enter");
for (const t of ["Intro", "Body"]) { await p.keyboard.type(t); await p.keyboard.press("Enter"); await wait(350); }
await p.keyboard.press("Escape"); await wait();
for (const t of ["Intro", "Body"]) { m = await menu(t); await m.locator('label:has-text("Do today") input').click(); await wait(); await p.keyboard.press("Escape"); }
const todayText = async () => (await today.count()) ? (await today.innerText()).replace(/\s+/g, " ") : "";
out("subtasks marked for today show with their parent", (await todayText()).includes("Intro Report") && (await todayText()).includes("Body Report"), await todayText());
out("marked rows are tinted in their list", (await row("Intro").getAttribute("data-today")) !== null && (await row("Report").getAttribute("data-today")) === null);
{ const h = await row("Report").locator('[aria-label="Drag to move this task"]').boundingBox(); const t = await today.boundingBox(); await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await p.mouse.down(); await p.mouse.move(t.x + 200, t.y + 20, { steps: 8 }); await p.mouse.up(); await wait(150); }
out("dragging a task onto Today adds it at once and leaves it in its list", (await today.locator("[data-today-item]").count()) === 3 && (await titles(await cardOf("List"))).includes("Report"), await todayText());
await today.locator('[aria-label=\'Take "Report" out of Today\']').click(); await wait();
await p.mouse.wheel(0, 600); await wait(200);
out("task bar stays along the bottom of the screen when scrolled", (await p.evaluate(() => window.scrollY)) > 0 && await p.locator("header.fixed").evaluate((el) => Math.round(el.getBoundingClientRect().bottom) === innerHeight));
await p.mouse.wheel(0, -600); await wait(200);
await today.locator('li:has-text("Intro") input[type=checkbox]').click(); await wait(700);
out("ticked item stays for the day, and is ticked in its list too", (await todayText()).includes("Intro") && await row("Intro").locator("input[type=checkbox]").isChecked());
await pretend(1);
out("next day: unticked one carried over 1 day, ticked one gone", (await today.locator("[data-today-item]").count()) === 1 && (await today.locator("[data-carried]").getAttribute("data-carried")) === "1", await todayText());
await today.locator('[aria-label^="Take"]').click(); await wait(700);
out("taking it out of Today leaves the task in its list", (await today.locator("[data-today-item]").count()) === 0 && (await titles(await cardOf("List"))).includes("Body"));
// The clock's own offset (in minutes), as set from the task bar: 23 hours on is still within the 24.
const ahead = async (minutes) => { await p.evaluate((m) => m ? localStorage.setItem("donegeon.devTimeOffset", String(m)) : localStorage.removeItem("donegeon.devTimeOffset"), minutes); await p.reload(); await p.waitForSelector("section[data-drop-list]"); await wait(); };
await ahead(23 * 60);
out("23 hours on: ticked main tasks are still in their lists", (await row("Essay").count()) === 1 && (await row("Movie").count()) === 1);
out("and the persistent task's copies are still there", (await copies.count()) === 3, await copies.count());
await ahead(0); await pretend(2);
out("two days on: they have left their lists", (await row("Essay").count()) === 0 && (await row("Movie").count()) === 0 && (await row("Plain").count()) === 1);
out("and the copies have gone; the persistent task itself stays", (await copies.count()) === 0 && (await row("Cake").locator('button[aria-label^="Done"]').count()) === 1);
await p.click('nav [aria-label="Done"]'); await wait();
out("and are still in the Done tab", (await p.locator("[data-finished]").allInnerTexts()).join().includes("Essay"));
await p.click('nav [aria-label="Tasks"]'); await p.waitForSelector("section[data-drop-list]"); await wait();
await pretend(0);

// --- tasks written straight into Today
const names = () => p.locator('input[aria-label="List name"]').evaluateAll((els) => els.map((e) => e.value).join(","));
const own = today.locator("[data-today-own]");
await p.locator('[data-task-editor="today-add"]').click(); await p.keyboard.type("Call mum"); await p.keyboard.press("Enter"); await wait();
await p.keyboard.type("Buy milk"); await p.keyboard.press("Enter"); await wait(); await p.keyboard.press("Escape");
out("a task typed into Today lives only there", (await titles(own)) === "Call mum,Buy milk" && !(await titles(await cardOf("List"))).includes("Call mum"), await titles(own));
out("a task typed into Today is worth 2 points by default", (await own.locator('[data-task-row]:has(textarea:text-is("Call mum")) [data-value-chip]').innerText()) === "+2");
await today.locator('[aria-label="Points per task added in Today"]').fill("4"); await p.keyboard.press("Enter"); await wait(700);
out("Today's own amount can be changed in the Today box", (await own.locator('[data-task-row]:has(textarea:text-is("Call mum")) [data-value-chip]').innerText()) === "+4");
await p.reload(); await p.waitForSelector("section[data-drop-list]"); await wait(); await expandAll();
out("and is still there after a reload", (await titles(own)) === "Call mum,Buy milk", await titles(own));
await drag("Buy milk", await cardOf("List"));
out("dragged to a list: now in the list, still shown in Today", (await titles(await cardOf("List"))).includes("Buy milk") && (await titles(own)) === "Call mum" && (await todayText()).includes("Buy milk"), `${await titles(await cardOf("List"))} / ${await todayText()}`);
out("in the list it is worth the list's amount", (await (await cardOf("List")).locator('[data-task-row]:has(textarea:text-is("Buy milk")) [data-value-chip]').innerText()) === "+5");
{ const h = await (await cardOf("List")).locator('[data-task-row]:has(textarea:text-is("Body")) [aria-label="Drag to move this task"]').boundingBox(); const t = await own.locator("[data-task-row]").first().boundingBox(); await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await p.mouse.down(); await p.mouse.move(t.x + 100, t.y + 3, { steps: 8 }); await p.mouse.up(); await wait(600); }
out("a list's task dropped among Today's own tasks is only marked for today", (await titles(await cardOf("List"))).includes("Body") && (await titles(own)) === "Call mum" && (await todayText()).includes("Body"), await todayText());
const beforeOwn = await balance();
await own.locator("input[type=checkbox]").click(); await wait(700);
out("ticking it earns Today's amount", (await balance()) === beforeOwn + 4, `${beforeOwn} -> ${await balance()}`);
out("ticking a Today-only task works and it stays for the day", (await own.locator("input[type=checkbox]").isChecked()) && !(await p.locator("text=That didn't work").count()));

// --- the dashboard as a grid of tiles (a tall window, so every tile is on screen to drag)
await p.setViewportSize({ width: 1200, height: 3000 }); await wait();
const tile = (key) => p.locator(`[data-tile="${key}"]`);
const at = async (key) => { const r = await tile(key).boundingBox(); return { x: Math.round(r.x), y: Math.round(r.y) }; };
const listKey = async (name) => "list:" + await (await cardOf(name)).getAttribute("data-drop-list");
const dragTile = async (key, x, y) => { const h = await tile(key).locator('[aria-label^="Drag to move"]').first().boundingBox(); await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await p.mouse.down(); await p.mouse.move(x, y - 30, { steps: 6 }); await p.mouse.move(x, y, { steps: 6 }); await wait(150); };
const funKey = await listKey("Fun"), choresKey = await listKey("Chores");
out("default: one column, in the usual order", (await at("goals")).x === (await at("today")).x && (await at("goals")).y < (await at("today")).y && (await at("today")).y < (await at(funKey)).y);
{ const r = await tile("goals").boundingBox(); await dragTile(choresKey, r.x + r.width / 2, r.y + 5); await p.mouse.up(); await wait(600); }
out("a list can be dragged above another tile", (await at(choresKey)).y < (await at("goals")).y && (await at(choresKey)).x === (await at("goals")).x);
{ const g = await p.locator("[data-tile-grid]").boundingBox(); await dragTile(funKey, g.x + 10, g.y + 300); const zone = await p.locator('[data-zone="new"]').boundingBox(); await p.mouse.move(zone.x + zone.width / 2, zone.y + 40, { steps: 6 }); await wait(150); await p.mouse.up(); await wait(600); }
out("dragged to the side: a second column, side by side", (await at(funKey)).x > (await at("goals")).x + 100 && (await at(funKey)).y === (await at(choresKey)).y, JSON.stringify([await at(funKey), await at("goals")]));
{ const r = await tile(funKey).boundingBox(); await dragTile("done", r.x + r.width / 2, r.y + r.height - 5); await p.mouse.up(); await wait(600); }
out("another tile can join that column, below it", (await at("done")).x === (await at(funKey)).x && (await at("done")).y > (await at(funKey)).y);
await tile("today").locator('[aria-label="Pin Today"]').click(); await wait(600);
out("pinning puts a tile above everything", (await at("today")).y < (await at(choresKey)).y && (await at("today")).y < (await at(funKey)).y && (await tile("today").getAttribute("data-pinned")) !== null);
const saved = JSON.stringify([await at("today"), await at(funKey), await at("done"), await at(choresKey)]);
await p.reload(); await p.waitForSelector("section[data-drop-list]"); await wait(); await expandAll();
out("the arrangement is kept after a reload", JSON.stringify([await at("today"), await at(funKey), await at("done"), await at(choresKey)]) === saved);
await p.screenshot({ path: "m3-grid.png", fullPage: true });
await p.setViewportSize({ width: 390, height: 800 }); await wait(600);
const xs = new Set(await p.locator("[data-tile]").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x))));
out("phone width: everything in one column, nothing wider than the screen", xs.size === 1 && (await p.evaluate(() => document.documentElement.scrollWidth)) <= 390, `${[...xs]} / ${await p.evaluate(() => document.documentElement.scrollWidth)}`);
out("pinned tile is still first on the phone", (await at("today")).y < (await at(choresKey)).y);
await p.screenshot({ path: "m3-phone.png", fullPage: true });
await p.setViewportSize({ width: 1200, height: 3000 }); await wait(600);
out("back on a wide screen the two columns return", (await at(funKey)).x > (await at("goals")).x + 100);
await today.locator('[aria-label="Unpin Today"]').click({ force: true }).catch(() => {}); await tile("today").locator('[aria-label="Unpin Today"]').click().catch(() => {}); await wait(600);
out("unpinning puts it back in the columns", (await tile("today").getAttribute("data-pinned")) === null);
await p.screenshot({ path: "m3.png", fullPage: true });
await b.close();
