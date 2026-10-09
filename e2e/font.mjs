import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 400) => p.waitForTimeout(ms);
const api = (url, method, body) => p.evaluate(async ([url, method, body]) => {
  const res = await fetch("/api" + url, { method, headers: { "Content-Type": "application/json", "X-Local-Date": new Date().toLocaleDateString("sv") }, body: body && JSON.stringify(body) });
  return res.status === 204 ? null : res.json();
}, [url, method, body]);
const add = async (title, where) => (await api("/tasks", "POST", { title, ...where })).task.id;
const font = (locator) => locator.first().evaluate((el) => getComputedStyle(el).fontFamily);
const size = (locator) => locator.first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
const isPixel = (family) => family.includes("Press Start 2P");

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("h2:text-is('Goals')");
const listId = (await api("/lists", "GET")).lists[0].id;
const main = await add("Clean floor", { listId }); await add("Sweep", { parentId: main });
await api(`/tasks/${main}`, "PATCH", { today: true });
await p.reload(); await p.waitForSelector(`[data-task-row="${main}"]`);

const inList = p.locator(`[data-task-row="${main}"] textarea`);
const inToday = p.locator(`[data-today-item="${main}"] span.truncate`);
const heading = p.locator("h2:text-is('Goals')");
const goalsText = p.locator('section[aria-label="Goals"] .tile-body p');
const before = await size(inList);
out("to start with, everything is in the pixel font", isPixel(await font(inList)) && isPixel(await font(inToday)) && isPixel(await font(goalsText)));

await p.goto("http://localhost:5173/user"); await p.waitForSelector("[data-plain-font]");
out("the switch is under Theme in the settings, off", await p.locator('section[aria-label="Settings"] h3:text-is("Theme")').count() === 1 && !(await p.locator("[data-plain-font]").isChecked()));
await p.locator("[data-plain-font]").click(); await wait();
out("the settings themselves are in an ordinary font, their heading not", !isPixel(await font(p.locator("[data-ticked-tasks]"))) && !isPixel(await font(p.locator('section[aria-label="Settings"] .tile-body p'))) && isPixel(await font(p.locator('section[aria-label="Settings"] h3'))));
await p.screenshot({ path: "font-settings.png", fullPage: true });
await p.goto("http://localhost:5173/"); await p.waitForSelector(`[data-task-row="${main}"]`); await wait();
out("switched on: a task in its list is in an ordinary font, and larger", !isPixel(await font(inList)) && await size(inList) > before, `${await font(inList)} ${await size(inList)}px`);
out("in Today too", !isPixel(await font(inToday)), await font(inToday));
await p.locator(`[data-task-row="${main}"] .task-arrow`).click(); await wait(200);
out("and its subtasks", !isPixel(await font(p.locator('[data-task-row] textarea').filter({ hasText: "Sweep" }))));
out("and the other text in the boxes: Goals, the add fields, buttons", !isPixel(await font(goalsText)) && !isPixel(await font(p.locator('[data-task-editor^="add:"]'))) && !isPixel(await font(p.locator('section[aria-label="Goals"] input'))));
out("titles keep the pixel font: the boxes' bands, the task bar", isPixel(await font(heading)) && isPixel(await font(p.locator("header.fixed"))) && isPixel(await font(p.locator("header.fixed nav a"))));
await p.locator(`[data-task-row="${main}"] button[aria-label*="ptions"], [data-task-row="${main}"] button:has-text("⋯")`).first().click(); await wait(300);
await p.screenshot({ path: "font-menu.png" }); await p.keyboard.press("Escape"); await p.mouse.click(5, 5); await wait(200);
await p.screenshot({ path: "font.png", fullPage: true });
await p.goto("http://localhost:5173/stats"); await wait(900); await p.screenshot({ path: "font-stats.png", fullPage: true });
await p.setViewportSize({ width: 390, height: 800 }); await p.goto("http://localhost:5173/"); await wait(900); out("fits a phone with it on", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await p.screenshot({ path: "font-phone.png", fullPage: true }); await p.setViewportSize({ width: 1200, height: 900 });
await p.reload(); await p.waitForSelector(`[data-task-row="${main}"]`); await wait();
out("it is kept over a reload", !isPixel(await font(inList)));

await p.goto("http://localhost:5173/user"); await p.locator("[data-plain-font]").click(); await wait();
await p.goto("http://localhost:5173/"); await p.waitForSelector(`[data-task-row="${main}"]`); await wait();
out("switched off: the pixel font is back, at its own size", isPixel(await font(inList)) && await size(inList) === before, `${await size(inList)}px`);
await p.setViewportSize({ width: 390, height: 800 }); await wait();
out("fits a phone", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
await b.close();
