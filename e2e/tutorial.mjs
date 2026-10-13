import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 450) => p.waitForTimeout(ms);
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
const bubble = p.locator("[data-tutorial]");
const step = () => bubble.getAttribute("data-tutorial").then(Number);
const says = async (text) => (await bubble.innerText()).replace(/\s+/g, " ").includes(text);
const next = async () => { await p.click("[data-tutorial-next]"); await wait(); };
// Whether the spot (the undimmed hole) lies on the element.
const spotOn = async (selector) => {
  const s = await p.locator("[data-tutorial-spot]").boundingBox(); const t = await p.locator(selector).first().boundingBox();
  return Boolean(s && t) && Math.abs(s.x + 6 - t.x) < 3 && Math.abs(s.y + 6 - t.y) < 3 && Math.abs(s.width - 12 - t.width) < 3;
};

// How many things are left undimmed, and whether an element lies wholly in one of those holes.
const holes = () => p.locator("[data-tutorial-hole]").count();
const litOn = (page) => async (selector) => {
  const r = await page.locator(selector).first().boundingBox(); if (!r) return false;
  const boxes = await page.locator("[data-tutorial-hole]").evaluateAll((els) => els.map((el) => ["x", "y", "width", "height"].map((a) => Number(el.getAttribute(a)))));
  return boxes.some(([x, y, w, h]) => r.y >= y - 1 && r.y + r.height <= y + h + 1 && r.x >= x - 1 && r.x + r.width <= x + w + 1);
};
const lit = litOn(p);
// Whether the words lie clear of the element (they may touch).
const clearOn = (page) => (selector) => page.evaluate((sel) => { const w = document.querySelector("[data-tutorial]").getBoundingClientRect(); const t = document.querySelector(sel)?.getBoundingClientRect(); return Boolean(t) && (w.bottom <= t.top + 1 || w.top >= t.bottom - 1 || w.right <= t.left + 1 || w.left >= t.right - 1); }, selector);

// The scripts are spared the tutorial (the browser is automated); this one asks for it.
await p.addInitScript(() => localStorage.setItem("donegeon.forceTutorial", "1"));
await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("[data-tutorial]"); await wait();

out("a new account is welcomed on a fully dark screen", await says("Welcome to Donegeon") && await says("to earn points with me") && await bubble.evaluate((el) => getComputedStyle(el).backgroundColor === "rgb(0, 0, 0)" && el.getBoundingClientRect().width >= innerWidth - 20 && el.getBoundingClientRect().height === innerHeight));
await next();
out("second dark card, with the aside folded away behind the little arrow", await says("you're gonna earn points") && await says("So let me show you your personal dungeon ;)") && !(await says("sex thing")) && !(await says("Let's get to know")));
await bubble.locator(".task-arrow").click(); await wait(200);
out("the arrow opens it", await says("this isnt a sex thing, I swear!"));
await p.click("[data-tutorial-next]:text-is('Fine')"); await wait();
out("the app shows, dimmed but for the list, with an arrow at its field", await says("Make a task") && await spotOn('[data-tile^="list:"] [data-task-editor^="add:"]') && await p.locator(".tutorial-arrow").count() === 1 && await p.locator(".tutorial-dim").count() === 1 && await lit('[data-tile^="list:"]'));
await p.screenshot({ path: "tutorial-task.png" });

await p.locator('[data-task-editor^="add:"]').first().click(); await p.keyboard.type("Exam"); await p.keyboard.press("Enter"); await wait(700);
out("the task that was made is in the lit part, not in the grey", await lit("[data-task-row]"));
out("a task made: it is named, now a sub-task", await says("Ah yes, Exam. I was curious how you will go through with Exam.") && await says("Make a sub-task") && await says("Ctrl+Enter"));
await p.keyboard.press("Escape"); await wait(200);
await p.locator('[data-task-row] textarea').first().click(); await p.keyboard.press("Control+Enter"); await wait(300);
// The spot takes in the task and what is under it, the row being typed too.
const coversDraft = await p.evaluate(() => { const s = document.querySelector("[data-tutorial-spot]").getBoundingClientRect(); const d = document.activeElement.getBoundingClientRect(); return d.top >= s.top && d.bottom <= s.bottom && d.height > 0; });
const asked = [];
for (const t of ["Ch 1", "Ch 2"]) { await p.keyboard.type(t); await p.keyboard.press("Enter"); await wait(700); asked.push((await bubble.innerText()).replace(/\s+/g, " ").split(" Skip")[0]); }
// The third goes under the second: a subtask's subtask counts as well.
await p.keyboard.press("Escape"); await wait(200);
await p.locator('[data-task-row]:has(textarea:text-is("Ch 2")) textarea').click(); await p.keyboard.press("Control+Enter");
for (const t of ["Ch 2a", "Ch 2b"]) { await p.keyboard.type(t); await p.keyboard.press("Enter"); await wait(700); asked.push((await bubble.innerText()).replace(/\s+/g, " ").split(" Skip")[0]); }
await p.keyboard.press("Escape"); await wait(300);
out("each subtask is answered with a demand for another, then the joke", asked[0].includes("make another subtask for Exam") && asked[1] === "Another." && asked[2].includes("Keep writing subtasks, what are you hesitating for?") && asked[2].includes("subtasks of their own") && asked[3].includes("messing with you"), asked.join(" | "));
out("the joke points at nothing, and says what a subtask is worth", await p.locator(".tutorial-arrow").count() === 0 && await p.locator("[data-tutorial-spot]").count() === 1 && await says("By default a subtask is worth no points") && await says("what its main task is, or have an amount of its own"));
out("the whole task is lit, its subtasks and theirs too", coversDraft && await p.evaluate(() => { const s = document.querySelector("[data-tutorial-spot]").getBoundingClientRect(); return [...document.querySelectorAll("[data-task-row]")].every((r) => { const b = r.getBoundingClientRect(); return b.top >= s.top && b.bottom <= s.bottom; }); }));
await p.screenshot({ path: "tutorial-subtasks.png" });
await p.click("[data-tutorial-next]:text-is('Very funny')"); await wait();
out("open the task's menu", await says("modern and sleek") && await spotOn('[data-task-row] button[aria-label="Task options"]'));
await p.locator('[data-task-row] button[aria-label="Task options"]').first().click(); await wait(900);
const MENU = '[role="dialog"][aria-label="Task options"]';
const menu = p.locator(MENU);
out("menu open, all of it on the screen, with the spot on it", await says("customize the shit out of your task") && await spotOn(MENU) && await menu.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));
await next();
out("Next does not close the menu; the points field is pointed at", await says("Every task can have its own amount") && await menu.count() === 1 && await spotOn(`${MENU} [data-menu-part="points"]`));
await next();
out("deadlines, hard and soft: the deadline fields", await says("Erect and Flaccid") && await says("self-imposed") && await spotOn(`${MENU} [data-menu-part="deadline"]`));
await next();
out("Do today, with the Today box lit as well", await says("can't pretend you forgot") && await spotOn(`${MENU} [data-menu-part="today"]`) && await holes() === 2);
await p.screenshot({ path: "tutorial-menu.png" });
await next();
out("persistent", await says("Persistent tasks never go away") && await spotOn(`${MENU} [data-menu-part="persistent"]`));
await next();
out("goals and tags", await says("lost in the sauce") && await spotOn(`${MENU} [data-menu-part="labels"]`));
await next();
out("give it a hard deadline", await says("Hard deadline. Next week will do.") && await spotOn(`${MENU} [data-menu-part="deadline"]`));
await menu.locator('[aria-label="Deadline date (dd/mm/yyyy)"]').fill(day(7)); await p.keyboard.press("Enter"); await wait(1200);
out("a hard deadline set: the global table is pointed at, the task named", await says("There it is. Your Exam.") && await spotOn('section[aria-label="All deadlines"]'));
await next();
await p.keyboard.press("Escape"); await wait(300);
out("click the task", await says("Click your task"));
await p.locator('[data-task-row]').first().click({ position: { x: 300, y: 4 } }); await wait(900);
out("on the task's own page, its table explained", p.url().includes("/tasks/") && await says("Most important is the column on the right") && await says("watch the pace drop"), p.url());
await next();
await wait(1200);
// What can be typed into a new task.
out("back on Tasks: type a shortcut into a new task", new URL(p.url()).pathname === "/" && await says("Most of what the menu does can be typed") && await says("Buy milk @today 5p") && await spotOn('[data-tile^="list:"] [data-task-editor^="add:"]'));
await p.locator('[data-tile^="list:"] [data-task-editor^="add:"]').first().click(); await p.keyboard.type("Buy milk @to"); await wait(400);
out("the dropdown under the field is left undimmed", await p.locator("[data-syntax-options]").count() === 1 && await holes() >= 3);
await p.keyboard.type("day 5p"); await wait(300);
out("a plain task would not do: the step waits for the shortcut", await says("Most of what the menu does can be typed"));
await p.keyboard.press("Enter"); await wait(1200);
out("the task typed with a shortcut is in the lit part too", await lit('[data-task-row]:has(textarea:text-is("Buy milk"))'));
out("a task with a shortcut made: the other shortcuts are listed", await says("#tag, ^goal, @date for a hard deadline") && await says("The whole list is on your user page") && await p.locator('[data-task-row]:has(textarea:text-is("Buy milk"))').count() === 1);
await next();
out("styling a title, pointing at the task", await says("Titles can be styled") && await says("Ctrl+B, Ctrl+I or Ctrl+U") && await says("==highlight==") && await spotOn('[data-task-row]'));
await next();
out("the search", await says("The search looks through everything") && await spotOn("[data-site-search]"));
await next();
await wait(1200);
out("then: make a reward list", new URL(p.url()).pathname === "/" && await says("Here you make lists") && await says("Reward") && await spotOn('[data-tile="newList"]'));
await p.locator('form .kind-switch').last().click(); await p.fill('[aria-label="New list name"]', "Fun"); await p.keyboard.press("Enter"); await wait(900);
await wait(1500);
const grab = async () => { // Takes the first list by its handle, once the page has settled.
  await p.locator('[data-tile^="list:"] .tile-band').first().evaluate((el) => el.scrollIntoView({ block: "center" })); await wait(300);
  const h = await p.locator('[data-tile^="list:"] .tile-button-tab').first().boundingBox();
  await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await p.mouse.down(); await p.mouse.move(h.x + 20, h.y + 30, { steps: 4 }); await wait(200);
};
out("reward list made: reorder a box", await says("grab a tab by it's handle and reorder it") && await spotOn('[data-tile^="list:"] .tile-button-tab'));
await grab();
{ const t = await p.locator('[data-tile="tags"]').boundingBox(); await p.mouse.move(t.x + t.width / 2, Math.min(t.y + t.height - 10, 800), { steps: 8 }); await wait(300); await p.mouse.up(); await wait(900); }
out("a box dropped somewhere: now a new column", await says("create a new colum"));
await wait(1200); await grab();
out("with a box in the air, the strip at the right is pointed at", await spotOn('[data-zone="new"]'));
{ const z = await p.locator('[data-zone="new"]').boundingBox(); await p.mouse.move(z.x + z.width / 2, Math.max(z.y, 0) + 60, { steps: 8 }); await wait(300); await p.mouse.up(); await wait(900); }
await wait(1200);
out("a second column: told to minimize", await says("before you become a slob, learn to minimize your lists and tabs"));
await p.screenshot({ path: "tutorial-slob.png" });
await p.click('[aria-label="Hide Tags"]'); await wait(1200);
out("a box minimized: the Hidden row is pointed at", await says("Hidden row") && await spotOn('[aria-label="Hidden boxes"]'));
await next();
out("then: click Stats", await says("click Stats") && await spotOn('header nav [aria-label="Stats"]'));
await p.click('header nav [aria-label="Stats"]'); await wait(900);
out("stats page: bigger the more you fill it up", new URL(p.url()).pathname === "/stats" && await says("bigger the more you fill it up ;)"));
await next();
// The calendar.
out("then: click Calendar", await says("Click Calendar") && await spotOn('header nav [aria-label="Calendar"]'));
await p.click('header nav [aria-label="Calendar"]'); await wait(1200);
out("calendar page: the Days row explained", new URL(p.url()).pathname === "/calendar" && await says("Each column is a day, starting today") && await spotOn('section[aria-label="Days"]'));
await next(); await wait(900);
out("add a task on a day: + Add is pointed at", await says("Press + Add under a day") && await spotOn('section[aria-label="Days"] [aria-label^="Add a task on"]'));
await p.locator('section[aria-label="Days"] [aria-label^="Add a task on"]').first().click(); await wait(600);
out("with the field open, the field is the thing pointed at", await spotOn("[data-add-on]"));
await p.keyboard.type("Dentist"); await p.keyboard.press("Enter"); await wait(1500);
out("a task added on a day: the month explained", await says("The month shows how much is due and done") && await spotOn('section[aria-label="Calendar"]'));
await p.screenshot({ path: "tutorial-calendar.png" });
await next();
const newTab = 'nav [aria-label="New folder"]';
out("folders: + New out by itself and pointed at from the side", await says("make a folder") && await p.locator(newTab).isVisible() && await spotOn(newTab) && await p.locator(".tutorial-arrow").getAttribute("data-points") === "left");
await p.screenshot({ path: "tutorial-bar.png" });
await p.click(newTab); await wait(700);
out("the folder's name and colour box is lit while it is open", await says("make a folder") && await spotOn('nav [role="dialog"][aria-label^="Folder"]'));
await p.screenshot({ path: "tutorial-folder.png" });
await p.keyboard.type("Uni"); await p.keyboard.press("Enter"); await wait(900);
out("folder made: its own, empty page is shown; + New is away again", new URL(p.url()).pathname.startsWith("/folders/") && (await bubble.innerText()).startsWith("An empty folder. Impressive.") && !(await says("junk")) && await p.locator("[data-folder-title]").innerText() === "Uni" && !(await p.locator(newTab).isVisible()), p.url());
out("all of the empty folder's page is lit, the words clear of its title", await lit("main") && await clearOn(p)("[data-folder-title]"));
await p.screenshot({ path: "tutorial-empty-folder.png" });
await next();
out("then back on Tasks: put a list in it", new URL(p.url()).pathname === "/" && !(await says("An empty folder")) && await says("lists and junk") && await says("Go on: grab a list by the handle"), p.url());
{ // Drag the first list onto the folder's tab (once the page has finished scrolling to its handle).
  await wait(1200); await p.locator('[data-tile^="list:"] .tile-band').first().evaluate((el) => el.scrollIntoView({ block: "center" })); await wait(300);
  const h = await p.locator('[data-tile^="list:"] .tile-button-tab').first().boundingBox();
  await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await p.mouse.down(); await p.mouse.move(h.x + 40, h.y + 60, { steps: 4 }); await wait(150);
  const t = await p.locator("[data-folder-tab]").boundingBox(); await p.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 10 }); await wait(300);
  out("while a list is dragged, the folder's tab is the thing pointed at", await spotOn("[data-folder-tab]"));
  await p.mouse.up(); await wait(900);
}
// The user's own page.
out("then: click your name", await says("Your own page is under your name. Click it.") && await spotOn('header [aria-label="Account"]'));
await p.click('header [aria-label="Account"]'); await wait(1200);
out("user page: streak and settings, both boxes lit", new URL(p.url()).pathname === "/user" && await says("Your streak counts the days in a row") && await says("cap your points") && await spotOn('section[aria-label="Settings"]') && await holes() === 2);
await next(); await wait(900);
out("the cheat sheet, with the mail box lit as well", await says("The cheat sheet lists every shortcut and key") && await spotOn("[data-cheatsheet]") && await holes() === 2);
await p.screenshot({ path: "tutorial-user.png" });
await next();
out("the send-off, pointing at the account", await says("I'm tired. You want to change something?") && await says("Fuck around and find out") && await spotOn('header [aria-label="Account"]'));
await next();
out("finished: the tutorial is gone", await bubble.count() === 0 && await p.locator("[data-tutorial-spot]").count() === 0);
// It ends where its last steps were: on the user page.
await p.reload(); await p.waitForSelector("[data-cheatsheet]"); await wait();
out("and stays gone after a reload", await bubble.count() === 0);

// From the settings it starts again; skipping ends it.
await p.click('header [aria-label="Account"]'); await p.click("[data-start-tutorial]"); await wait(700);
out("Tutorial in the settings starts it again, on the Tasks page", new URL(p.url()).pathname === "/" && await says("Welcome to Donegeon"));
await next(); await p.reload(); await p.waitForSelector("[data-tutorial]"); await wait();
out("a reload keeps its place", await step() === 1);
await p.click("button:text-is('Skip tutorial')"); await wait(700);
out("Skip tutorial ends it", await bubble.count() === 0);
await p.setViewportSize({ width: 390, height: 800 }); await p.goto("http://localhost:5173/user"); await p.click("[data-start-tutorial]"); await wait(700);
await next(); await next();
out("phone: the words fit the screen", await bubble.evaluate((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }));
await p.screenshot({ path: "tutorial-phone.png" });

// A new account that does nothing it is told: every step can be skipped, and none comes round again.
{
  const q = await b.newPage({ viewport: { width: 1200, height: 900 } });
  q.on("pageerror", e => console.log("PAGEERROR", String(e)));
  await q.addInitScript(() => localStorage.setItem("donegeon.forceTutorial", "1"));
  await q.goto("http://localhost:5173/signup"); await q.fill('input[autocomplete="username"]', user + "s"); await q.fill('input[type="password"]', "hunter2hunter2");
  await q.keyboard.press("Enter"); await q.waitForSelector("[data-tutorial]"); await q.waitForTimeout(450);
  const seen = []; let stuck = null;
  for (let i = 0; i < 60 && await q.locator("[data-tutorial]").count(); i++) {
    const at = Number(await q.locator("[data-tutorial]").getAttribute("data-tutorial"));
    if (seen.includes(at)) { stuck = at; break; }
    seen.push(at);
    await q.click("[data-tutorial-skip], [data-tutorial-next]"); await q.waitForTimeout(700);
  }
  out("skipping every step gets to the end, no step twice", stuck === null && await q.locator("[data-tutorial]").count() === 0, `stuck at ${stuck}; seen ${seen.join(",")}`);
  out("the steps about the task that was never made, and about things never done, are passed over", seen.length < 24, seen.join(","));
}

// On a phone: the words keep clear of what they are about, can be folded away, and some steps are left out.
{
  const q = await b.newPage({ viewport: { width: 390, height: 800 } });
  q.on("pageerror", e => console.log("PAGEERROR", String(e)));
  await q.addInitScript(() => localStorage.setItem("donegeon.forceTutorial", "1"));
  await q.goto("http://localhost:5173/signup"); await q.fill('input[autocomplete="username"]', user + "p"); await q.fill('input[type="password"]', "hunter2hunter2");
  await q.keyboard.press("Enter"); await q.waitForSelector("[data-tutorial]"); await q.waitForTimeout(450);
  const w = (ms = 700) => q.waitForTimeout(ms);
  const qlit = litOn(q), qclear = clearOn(q);
  const at = () => q.locator("[data-tutorial]").getAttribute("data-tutorial").then(Number);
  const shot = async () => q.screenshot({ path: `tutorial-phone-${String(await at()).padStart(2, "0")}.png` });
  const onScreen = () => q.locator("[data-tutorial]").evaluate((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && r.height <= innerHeight * 0.46; });
  await q.click("[data-tutorial-next]"); await w(); await q.click("[data-tutorial-next]"); await w(1200);
  const FIELD = '[data-tile^="list:"] [data-task-editor^="add:"]';
  out("phone, make a task: the words are small, on the screen and clear of the field", await onScreen() && await qclear(FIELD)); await shot();
  await q.locator(FIELD).first().click(); await q.keyboard.type("Exam"); await q.keyboard.press("Enter"); await w(1200);
  out("phone: the new task is lit, the words clear of it", await qlit("[data-task-row]") && await qclear("[data-task-row]") && await onScreen()); await shot();
  await q.click("[data-tutorial-fold]"); await w(300);
  out("phone: the words fold away to a button, the lit part stays", await q.locator("[data-tutorial-unfold]").count() === 1 && await q.locator("[role=dialog][data-tutorial]").count() === 0 && await q.locator("[data-tutorial-hole]").count() >= 1);
  await q.screenshot({ path: "tutorial-phone-folded.png" });
  await q.click("[data-tutorial-unfold]"); await w(300);
  out("phone: and unfold again", await q.locator("[role=dialog][data-tutorial]").count() === 1);
  await q.locator("[data-task-row] textarea").first().click(); await q.keyboard.press("Control+Enter"); await w(300);
  for (const t of ["a", "b", "c", "d"]) { await q.keyboard.type(t); await q.keyboard.press("Enter"); await w(900); }
  await q.keyboard.press("Escape"); await w(300); await shot();
  await q.click("[data-tutorial-next]"); await w(900);
  await q.locator('[data-task-row] button[aria-label="Task options"]').first().click(); await w(1200);
  const SHEET = '[role="dialog"][aria-label="Task options"]';
  const clearOfSheet = [];
  for (let i = 0; i < 6; i++) { clearOfSheet.push(await qclear(SHEET) && await onScreen()); await shot(); await q.click("[data-tutorial-next]"); await w(700); }
  out("phone: through the menu's steps the words stay clear of the menu sheet", clearOfSheet.every(Boolean), clearOfSheet.join(","));
  await q.keyboard.press("Escape"); await w(300);
  const seen = [];
  for (let i = 0; i < 60 && await q.locator("[data-tutorial]").count(); i++) {
    const n = await at(); if (seen.includes(n)) break; seen.push(n);
    await w(900); await shot();
    await q.click("[data-tutorial-skip], [data-tutorial-next]"); await w(900);
  }
  out("phone: the shortcut list, the styling and the month steps are left out; the rest runs to the end", ![20, 21, 33].some((n) => seen.includes(n)) && seen.includes(19) && seen.includes(32) && await q.locator("[data-tutorial]").count() === 0, seen.join(","));
}
await b.close();
