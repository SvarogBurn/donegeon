// The installed app's layout (display-mode: standalone, faked here by answering matchMedia): the top strip with the
// account, search, points and folders, the bottom bar of three icons without words, no clock, no search on the Tasks
// page, a goal picked in the strip's search filtering the Tasks page, and no scrollbar. Then the same page in a browser
// tab keeps the old task bar.
import { chromium } from "playwright";
const b = await chromium.launch();
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const user = "uitest" + Date.now();

const fakeStandalone = () => {
  const real = window.matchMedia.bind(window);
  window.matchMedia = (q) => (q.includes("display-mode: standalone") ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : real(q));
};

for (const [name, viewport, dark] of [["phone", { width: 390, height: 844 }, false], ["phone-dark", { width: 390, height: 844 }, true], ["wide", { width: 1200, height: 800 }, false]]) {
  const ctx = await b.newContext({ viewport, colorScheme: dark ? "dark" : "light" });
  await ctx.addInitScript(fakeStandalone);
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("PAGEERROR", String(e)));
  const api = (path, method = "GET", body) =>
    p.evaluate(async ([path, method, body]) => (await fetch("/api" + path, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) })).json(), [path, method, body]);
  if (name === "phone") {
    await p.goto("http://localhost:5173/signup");
    await p.fill('input[autocomplete="username"]', user);
    await p.fill('input[type="password"]', "hunter2hunter2");
    await p.keyboard.press("Enter");
    await p.waitForSelector("section[data-drop-list]");
    await api("/auth/me", "PATCH", { tutorialSeen: true });
    const list = (await api("/lists")).lists[0];
    await api("/folders", "POST", { name: "Work" });
    await api("/folders", "POST", { name: "Home stuff" });
    const goal = (await api("/goals", "POST", { name: "Fitness" })).goal;
    await api("/tasks", "POST", { title: "Run 5k", listId: list.id, goalIds: [goal.id] });
    await api("/tasks", "POST", { title: "Buy milk", listId: list.id });
    for (let i = 0; i < 25; i++) await api("/tasks", "POST", { title: `Filler ${i}`, listId: list.id });
  } else {
    await p.goto("http://localhost:5173/login");
    await p.fill('input[autocomplete="username"]', user);
    await p.fill('input[type="password"]', "hunter2hunter2");
    await p.keyboard.press("Enter");
  }
  await p.waitForSelector("section[data-drop-list]");
  await p.reload();
  await p.waitForSelector('nav[aria-label="Folders"] [data-folder-tab="Work"]');
  await p.waitForTimeout(600);

  out(`${name}: marked standalone`, await p.evaluate(() => document.documentElement.hasAttribute("data-standalone")));
  out(`${name}: no clock shown`, !(await p.locator('[aria-label="Time and date"]').isVisible()));
  out(`${name}: one search, in the top strip`, (await p.locator("[data-site-search]").count()) === 1 && (await p.locator("header [data-site-search]").count()) === 1);
  out(`${name}: account and points in the top strip`, (await p.locator('header:has([data-site-search]) [aria-label="Account"]').count()) === 1 && (await p.locator('header:has([data-site-search]) [aria-label="Points"]').count()) === 1);
  const words = await p.locator('header nav[aria-label="Pages"]').innerText();
  out(`${name}: bottom tabs have no words`, words.trim() === "", JSON.stringify(words));
  const bar = await p.locator('header:has(nav[aria-label="Pages"])').evaluate((el) => getComputedStyle(el).backgroundColor);
  out(`${name}: bottom bar is opaque`, !bar.includes("rgba") || bar.endsWith(", 1)"), bar);
  const scrollbar = await p.evaluate(() => getComputedStyle(document.documentElement).scrollbarWidth);
  out(`${name}: no scrollbar`, scrollbar === "none", scrollbar);
  const theme = await p.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.content).join(","));
  out(`${name}: phone bars take the bars' colour`, theme === "#ffffff,#1c1c33", theme);
  // The first row of the page starts below the strip.
  const gap = await p.evaluate(() => document.querySelector("main [data-tile]").getBoundingClientRect().top - document.querySelector("header:has([data-site-search])").getBoundingClientRect().bottom);
  out(`${name}: page starts under the strip`, gap >= 0, gap);
  await p.screenshot({ path: `standalone-${name}.png` });

  if (name === "phone") {
    await p.locator('header [role="searchbox"]').fill("fitn");
    await p.locator('[data-search-result^="goal:"]').click();
    await p.waitForTimeout(400);
    const status = await p.locator('p[role="status"]').innerText().catch(() => "");
    out("goal picked in the strip filters the Tasks page", status.includes("Fitness"), status);
    await p.goto("http://localhost:5173/stats");
    await p.locator('header [role="searchbox"]').fill("fitn");
    await p.locator('[data-search-result^="goal:"]').click();
    await p.waitForURL("http://localhost:5173/");
    await p.waitForTimeout(400);
    out("goal picked from another page goes to Tasks filtered", (await p.locator('p[role="status"]').innerText().catch(() => "")).includes("Fitness"));
    await p.locator('header [role="searchbox"]').fill("milk");
    await p.waitForTimeout(800);
    await p.screenshot({ path: "standalone-phone-search.png" });
    await p.keyboard.press("Escape");
    await p.locator('[data-folder-tab="Work"]').click({ button: "right" });
    await p.waitForTimeout(300);
    const editor = await p.locator('[role="dialog"][aria-label^="Folder"]').boundingBox();
    const strip = await p.locator("header:has([data-site-search])").boundingBox();
    out("folder editor opens under the strip", editor && editor.y >= strip.y + strip.height - 1, JSON.stringify(editor));
    await p.screenshot({ path: "standalone-phone-folder.png" });
  }
  await ctx.close();
}

// In a browser tab: the old task bar.
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
await p.goto("http://localhost:5173/login");
await p.fill('input[autocomplete="username"]', user);
await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter");
await p.waitForSelector("section[data-drop-list]");
out("browser tab: clock shown", await p.locator('[aria-label="Time and date"]').isVisible());
out("browser tab: search on the page", (await p.locator("main [data-site-search]").count()) === 1);
out("browser tab: tab words", (await p.locator('nav[aria-label="Pages"]').innerText()).includes("Tasks"));
await b.close();
