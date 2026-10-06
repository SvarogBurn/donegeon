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
out("the app shows, dimmed but for the list's field, with an arrow at it", await says("Make a task") && await spotOn('[data-tile^="list:"] [data-task-editor^="add:"]') && await p.locator(".tutorial-arrow").count() === 1 && await p.locator(".tutorial-dim").count() === 1);
await p.screenshot({ path: "tutorial-task.png" });

await p.locator('[data-task-editor^="add:"]').first().click(); await p.keyboard.type("Exam"); await p.keyboard.press("Enter"); await wait(700);
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
out("Do today, with the Today box lit as well", await says("can't pretend you forgot") && await spotOn(`${MENU} [data-menu-part="today"]`) && (await p.locator(".tutorial-dim").getAttribute("style")).split("Z").length === 4);
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
out("back on Tasks: make a reward list", new URL(p.url()).pathname === "/" && await says("Here you make lists") && await says("Reward") && await spotOn('[data-tile="newList"]'));
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
const newTab = 'nav [aria-label="New folder"]';
out("folders: + New out by itself and pointed at from the side", await says("make a folder") && await p.locator(newTab).isVisible() && await spotOn(newTab) && await p.locator(".tutorial-arrow").getAttribute("data-points") === "left");
await p.screenshot({ path: "tutorial-bar.png" });
await p.click(newTab); await wait(700);
out("the folder's name and colour box is lit while it is open", await says("make a folder") && await spotOn('nav [role="dialog"][aria-label^="Folder"]'));
await p.screenshot({ path: "tutorial-folder.png" });
await p.keyboard.type("Uni"); await p.keyboard.press("Enter"); await wait(900);
out("folder made: its own, empty page is shown; + New is away again", new URL(p.url()).pathname.startsWith("/folders/") && (await bubble.innerText()).startsWith("An empty folder. Impressive.") && !(await says("junk")) && await p.locator("[data-folder-title]").innerText() === "Uni" && !(await p.locator(newTab).isVisible()), p.url());
await next();
out("then back on Tasks: put a list in it", new URL(p.url()).pathname === "/" && await says("lists and junk") && await says("Go on: grab a list by the handle"), p.url());
{ // Drag the first list onto the folder's tab (once the page has finished scrolling to its handle).
  await wait(1200); await p.locator('[data-tile^="list:"] .tile-band').first().evaluate((el) => el.scrollIntoView({ block: "center" })); await wait(300);
  const h = await p.locator('[data-tile^="list:"] .tile-button-tab').first().boundingBox();
  await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await p.mouse.down(); await p.mouse.move(h.x + 40, h.y + 60, { steps: 4 }); await wait(150);
  const t = await p.locator("[data-folder-tab]").boundingBox(); await p.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 10 }); await wait(300);
  out("while a list is dragged, the folder's tab is the thing pointed at", await spotOn("[data-folder-tab]"));
  await p.mouse.up(); await wait(900);
}
out("the send-off, pointing at the account", await says("I'm tired. You want to change something?") && await says("Fuck around and find out") && await spotOn('header [aria-label="Account"]'));
await next();
out("finished: the tutorial is gone", await bubble.count() === 0 && await p.locator("[data-tutorial-spot]").count() === 0);
await p.reload(); await p.waitForSelector("h2:text-is('Goals')"); await wait();
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
await b.close();
