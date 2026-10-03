import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 1400 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 500) => p.waitForTimeout(ms);
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const row = (title) => p.locator(`[data-task-row]:has(textarea:text-is("${title}"))`).first();
const card = (name) => p.locator(`section[data-drop-list]:has(input[aria-label="List name"][value="${name}"])`);
const cardOf = async (name) => { const n = await p.locator("section[data-drop-list]").count(); for (let i = 0; i < n; i++) { const c = p.locator("section[data-drop-list]").nth(i); if ((await c.locator('input[aria-label="List name"]').inputValue()) === name) return c; } };
const balance = async () => Number(await p.locator("[data-nav-balance]").getAttribute("data-nav-balance"));
const chip = (title) => row(title).locator("[data-value-chip]").innerText();
const titles = async (c) => c.locator("[data-task-row] textarea").evaluateAll((els) => els.map((e) => e.value).join(","));
const add = async (c, title) => { await c.locator('[data-task-editor^="add:"]').click(); await p.keyboard.type(title); await p.keyboard.press("Enter"); await wait(); };
const menu = async (title) => { await row(title).locator('[aria-label="Task options"]').click(); return row(title).locator("[role=dialog]"); };
const pretend = async (n) => { await p.evaluate((d) => d ? localStorage.setItem("donegeon.devDate", d) : localStorage.removeItem("donegeon.devDate"), n === 0 ? null : day(n)); await p.reload(); await p.waitForSelector("section[data-drop-list]"); await wait(); };
const today = p.locator('[aria-label="Today"]');

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("section[data-drop-list]"); await wait();

// --- lists carry the points
const main = await cardOf("List");
out("first list is a task list worth 1", (await main.getAttribute("data-list-kind")) === "task" && (await main.locator('[aria-label="Points per item"]').inputValue()) === "1");
await main.locator('[aria-label="Points per item"]').fill("5"); await p.keyboard.press("Enter"); await wait();
await p.fill('[aria-label="New list name"]', "Fun");
await p.locator('form [aria-label="Kind of list"]').last().selectOption("reward");
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
await p.click('nav >> text=Done'); await wait();
out("Done tab lists it under today", (await p.locator(`[data-done-on="${day(0)}"] [data-finished]`).count()) === 1 && (await p.locator("[data-finished]").innerText()).includes("Essay"));
await p.locator("[data-finished] input[type=checkbox]").click(); await wait(700);
out("unticking in the Done tab takes the points back", (await balance()) === 0 && (await p.locator("[data-finished]").count()) === 0);
await p.click('nav >> text=Tasks'); await p.waitForSelector("section[data-drop-list]"); await wait();
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
await (await cardOf("Chores")).locator('[aria-label="Kind of list"]').selectOption("reward"); await wait(700);
out("list kind can be changed later; balance untouched", (await chip("Plain")) === "−1" && (await balance()) === 3, `${await chip("Plain")} ${await balance()}`);

// --- persistent
m = await menu("Cake"); await m.locator('label:has-text("Persistent") input').click(); await wait(); await p.keyboard.press("Escape");
m = await menu("Cake"); await m.locator('[aria-label^="Points for this task"]').fill("1"); await p.keyboard.press("Enter"); await wait(); await p.keyboard.press("Escape");
const press = row("Cake").locator('button[aria-label^="Done"]');
out("persistent item has a button instead of a checkbox", (await press.count()) === 1 && (await row("Cake").locator("input[type=checkbox]").count()) === 0);
await press.click(); await wait(700); await press.click(); await wait(700);
out("two presses: −2, still in its list, counted", (await balance()) === 1 && (await row("Cake").locator("[data-pressed-today]").getAttribute("data-pressed-today")) === "2", await balance());
await p.keyboard.press("Control+z"); await wait(700);
out("Ctrl+Z takes one press back", (await balance()) === 2 && (await row("Cake").locator("[data-pressed-today]").getAttribute("data-pressed-today")) === "1", await balance());
await press.click(); await wait(700); await press.click(); await wait(700); await press.click(); await wait(700);
out("a persistent reward you can't afford is refused too", (await balance()) === 0 && (await row("Cake").locator("[data-pressed-today]").getAttribute("data-pressed-today")) === "3", await balance());
out("Done box shows the presses", (await p.locator('[aria-label="Done"]').innerText()).replace(/\s+/g, " ").includes("Cake ×3"));

// --- points history
await p.click("[data-nav-balance]"); await p.waitForSelector('[aria-label="History"]');
const history = (await p.locator('[aria-label="History"]').innerText()).replace(/\s+/g, " ");
out("history has earned, spent and taken-back rows", ["Earned", "Spent", "Taken back"].every((w) => history.includes(w)) && (await p.locator("[data-balance]").getAttribute("data-balance")) === "0");
await p.click('nav >> text=Tasks'); await p.waitForSelector("section[data-drop-list]"); await wait();

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
out("top bar stays on screen when scrolled", (await p.evaluate(() => window.scrollY)) > 0 && Math.round((await p.locator("header").first().boundingBox()).y) === 0);
await p.mouse.wheel(0, -600); await wait(200);
await today.locator('li:has-text("Intro") input[type=checkbox]').click(); await wait(700);
out("ticked item stays for the day, and is ticked in its list too", (await todayText()).includes("Intro") && await row("Intro").locator("input[type=checkbox]").isChecked());
await pretend(1);
out("next day: unticked one carried over 1 day, ticked one gone", (await today.locator("[data-today-item]").count()) === 1 && (await today.locator("[data-carried]").getAttribute("data-carried")) === "1", await todayText());
await today.locator('[aria-label^="Take"]').click(); await wait(700);
out("taking it out of Today leaves the task in its list", (await today.locator("[data-today-item]").count()) === 0 && (await titles(await cardOf("List"))).includes("Body"));
await pretend(2);
out("two days on: ticked main tasks are still in their lists", (await row("Essay").count()) === 1 && (await row("Movie").count()) === 1);
await pretend(3);
out("three days on: they have left their lists", (await row("Essay").count()) === 0 && (await row("Movie").count()) === 0 && (await row("Plain").count()) === 1);
await p.click('nav >> text=Done'); await wait();
out("and are still in the Done tab", (await p.locator("[data-finished]").allInnerTexts()).join().includes("Essay"));
await p.click('nav >> text=Tasks'); await p.waitForSelector("section[data-drop-list]"); await wait();
await pretend(0);
await p.screenshot({ path: "m3.png", fullPage: true });
await b.close();
