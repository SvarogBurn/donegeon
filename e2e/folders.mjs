import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1300, height: 1000 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 500) => p.waitForTimeout(ms);
const names = () => p.locator('section[data-drop-list] input[aria-label="List name"]').evaluateAll((els) => els.map((el) => el.value).join(","));
const tabs = () => p.locator("nav [data-folder-tab]").evaluateAll((els) => els.map((el) => el.dataset.folderTab).join(","));
const card = (name) => p.locator(`section[data-drop-list]:has(input[aria-label="List name"][value="${name}"])`);
const tab = (name) => p.locator(`nav [data-folder-tab="${name}"]`);
const newTab = p.locator('nav [aria-label="New folder"]');
// The bar's empty space, just right of its tabs.
const bar = async (button = "left") => { const n = await p.locator('nav[aria-label="Pages"] > :last-child').evaluate((el) => { const r = (el.previousElementSibling ?? el).getBoundingClientRect(); return { x: r.right, y: r.top + r.height / 2 }; }); await p.mouse.click(n.x + 60, n.y, { button }); await wait(300); };
const editor = p.locator('nav [role=dialog][aria-label^="Folder"]');
// Drags a list by its tab button onto something in the task bar.
const drop = async (list, target) => {
  await card(list).locator(".tile-band").evaluate((el) => el.scrollIntoView({ block: "center" })); await wait(200);
  const h = await card(list).locator('.tile-button-tab').boundingBox();
  await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await p.mouse.down(); await p.mouse.move(h.x + 40, h.y + 60, { steps: 4 });
  // The New tab only comes out once a list is being dragged.
  await wait(150); const t = await target.boundingBox();
  await p.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 10 }); await wait(200);
  const lit = await target.getAttribute("data-drop-hover");
  await p.mouse.up(); await wait(800);
  return lit !== null;
};

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', "uitest" + Date.now()); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("section[data-drop-list]"); await wait();
for (const name of ["Work", "Home", "Garden"]) { await p.fill('[aria-label="New list name"]', name); await p.locator('[aria-label="New list name"]').press("Enter"); await wait(600); }
await card("Work").locator('[data-task-editor^="add:"]').click(); await p.keyboard.type("Report"); await p.keyboard.press("Enter"); await wait(); await p.keyboard.press("Escape");
out("to start with: no folders, and the New tab out of sight", (await tabs()) === "" && !(await newTab.isVisible()) && (await names()) === "List,Work,Home,Garden", await names());

// A list dropped on "New" makes a folder, which asks for its name.
const lit = await drop("Work", p.locator('nav [aria-label="New folder"]'));
out("a list dragged over the New tab lights it up", lit);
out("the New tab went away with the drag", !(await newTab.isVisible()));
out("dropped: a folder with its name open for typing; the list has left the Tasks page", (await tabs()) === "Folder" && await editor.locator('[aria-label="Folder name"]').evaluate((el) => el === document.activeElement) && (await names()) === "List,Home,Garden", `${await tabs()} / ${await names()}`);
await p.keyboard.type("Job"); await p.keyboard.press("Enter"); await wait();
out("named", (await tabs()) === "Job" && await editor.count() === 0, await tabs());

// More lists into the same folder; the folder's page.
await drop("Home", tab("Job"));
out("another list dropped on the folder's tab goes in too", (await names()) === "List,Garden", await names());
await tab("Job").click(); await p.waitForSelector("[data-folder-title]"); await wait();
out("the folder's page shows its lists, with their tasks, and a new-list field", (await names()) === "Work,Home" && await p.locator("[data-folder-title]").innerText() === "Job" && await p.locator('[data-task-row]:has(textarea:text-is("Report"))').count() === 1 && await p.locator("[data-tile]").count() === 3, await names());
await p.fill('[aria-label="New list name"]', "Inbox"); await p.locator('[aria-label="New list name"]').press("Enter"); await wait(700);
out("a list made on the folder's page belongs to the folder", (await names()) === "Work,Home,Inbox", await names());

// Name and colour: by clicking the open tab, by right-click, by holding.
await tab("Job").click(); await wait(300);
out("clicking the tab of the open folder opens its name and colour", await editor.count() === 1);
await editor.locator('button[aria-label="Green"]').click(); await wait();
const icon = await tab("Job").locator(".tab-icon").evaluate((el) => getComputedStyle(el).backgroundImage);
const art = await p.evaluate(async (url) => (await (await fetch(url.slice(5, -2))).text()).toLowerCase(), icon);
out("a picked colour recolours the folder's icon", art.includes("#37946e") && !art.includes("#e7b946"));
await p.keyboard.press("Escape"); await wait(200);
await tab("Job").click({ button: "right" }); await wait(300);
out("right-click opens it too", await editor.count() === 1);
await editor.locator('[aria-label="Folder name"]').fill("Career"); await p.keyboard.press("Enter"); await wait();
out("renamed", (await tabs()) === "Career" && await p.locator("[data-folder-title]").innerText() === "Career", await tabs());
{ const t = await tab("Career").boundingBox(); await p.mouse.move(t.x + t.width / 2, t.y + t.height / 2); await p.mouse.down(); await wait(700); await p.mouse.up(); await wait(300); }
out("holding the tab opens it, and stays on the page", await editor.count() === 1 && p.url().includes("/folders/"));
await p.keyboard.press("Escape"); await wait(200);

// More folders; moving between them and back out.
await bar();
const shownByClick = await newTab.isVisible();
await p.keyboard.press("Escape"); await wait(200);
const goneByEscape = !(await newTab.isVisible());
await bar("right");
out("a click or a right-click on the bar's empty space brings out the New tab; Escape puts it away", shownByClick && goneByEscape && await newTab.isVisible());
await newTab.click(); await wait(600);
out("once used it is out of sight again", !(await newTab.isVisible()));
await p.keyboard.type("Later"); await p.keyboard.press("Enter"); await wait();
out("the New tab makes an empty folder by a click", (await tabs()) === "Career,Later", await tabs());
await drop("Inbox", tab("Later"));
out("a list can be dragged from one folder to another", (await names()) === "Work,Home", await names());
await drop("Home", p.locator('nav [aria-label="Tasks"]'));
out("and back out, onto Tasks", (await names()) === "Work", await names());
await p.reload(); await p.waitForSelector("[data-folder-title]"); await wait();
out("all of it is kept after a reload", (await tabs()) === "Career,Later" && (await names()) === "Work", `${await tabs()} / ${await names()}`);
await p.locator('nav [aria-label="Tasks"]').click(); await p.waitForSelector('section[aria-label="Today"]'); await wait();
out("the Tasks page has the lists that are in no folder", (await names()).split(",").sort().join() === "Garden,Home,List", await names());

// Removing a folder keeps its lists.
await tab("Later").click({ button: "right" }); await wait(300);
await editor.locator('button:text-is("Remove folder")').click(); await wait(800);
out("removing a folder puts its lists back on Tasks", (await tabs()) === "Career" && (await names()).split(",").sort().join() === "Garden,Home,Inbox,List", `${await tabs()} / ${await names()}`);
await p.goto("http://localhost:5173/folders/00000000-0000-4000-8000-000000000000"); await wait(900);
out("a folder that doesn't exist leads back to Tasks", new URL(p.url()).pathname === "/");
await p.screenshot({ path: "folders.png" });
await b.close();
