// The installed app's layout (display-mode: standalone, faked here by answering matchMedia): the top strip with the
// points, folders, a small spyglass and the account (in that order), the bottom bar of the pages with their names (21px
// icons) and a pale-blue NES "+" standing up out of a notch in the middle that adds a task to Today, both bars a little
// see-through in the task bar's colours and sliding away while the page is scrolled down and back on the way up, no clock, no search on the Tasks page until the spyglass opens it in the strip, a goal picked there
// filtering the Tasks page, the page's own colour for the phone's bars, and no scrollbar. A long list stops at about
// half the screen and scrolls inside. Then the same page in a browser tab keeps the old task bar.
import { chromium } from "playwright";
const b = await chromium.launch();
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const user = "uitest" + Date.now();

const fakeStandalone = () => {
  const real = window.matchMedia.bind(window);
  window.matchMedia = (q) => (q.includes("display-mode: standalone") ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : real(q));
};
const STRIP = 'header:has(nav[aria-label="Folders"]), header:has([data-site-search])';
const BAR = 'header:has(nav[aria-label="Pages"])';

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
  out(`${name}: no search until the spyglass`, (await p.locator("[data-site-search]").count()) === 0);
  const order = await p.locator(STRIP).evaluate((strip) =>
    ['[aria-label="Points"]', 'nav[aria-label="Folders"]', '[aria-label="Search"]', '[aria-label="Account"]'].map((s) => Math.round(strip.querySelector(s).getBoundingClientRect().left)),
  );
  out(`${name}: strip is points, folders, spyglass, account`, order.every((x, i) => i === 0 || x > order[i - 1]), JSON.stringify(order));
  const words = await p.locator('header nav[aria-label="Pages"]').innerText();
  out(`${name}: bottom tabs have their names`, ["Tasks", "Stats", "Calendar", "Notes"].every((w) => words.includes(w)), JSON.stringify(words));
  const bar = await p.locator(`${BAR} .app-bar-fill`).first().evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).borderTopWidth]);
  out(`${name}: bottom bar a little see-through, a thin line`, /, 0\.7\)$/.test(bar[0]) && bar[1] === "1px", JSON.stringify(bar));
  const icon = await p.locator(`${BAR} .tab-icon-tasks`).evaluate((el) => el.getBoundingClientRect().width);
  out(`${name}: bottom icons are small`, icon === 21, icon);
  const plus = await p.locator("[data-quick-add]").evaluate((el) => {
    const r = el.getBoundingClientRect();
    const barTop = el.parentElement.getBoundingClientRect().top;
    return { nes: el.classList.contains("nes-btn"), bg: getComputedStyle(el).backgroundColor, above: barTop - r.top, below: r.bottom - barTop };
  });
  out(`${name}: "+" is a pale-blue NES button standing up out of the bar`, plus.nes && plus.bg === "rgb(203, 219, 252)" && plus.above > plus.below && plus.below > 0, JSON.stringify(plus));
  const scrollbar = await p.evaluate(() => getComputedStyle(document.documentElement).scrollbarWidth);
  out(`${name}: no scrollbar`, scrollbar === "none", scrollbar);
  const theme = await p.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.content).join(","));
  out(`${name}: phone bars take the page's colour`, theme === "#f5f5f4,#0c0a09", theme);
  const gap = await p.evaluate((s) => document.querySelector("main [data-tile]").getBoundingClientRect().top - document.querySelector(s).getBoundingClientRect().bottom, STRIP);
  out(`${name}: page starts under the strip`, gap >= 0, gap);
  await p.screenshot({ path: `standalone-${name}.png` });

  if (name !== "wide") {
    const box = await p.locator("section[data-drop-list] [data-box-scroll]").evaluate((el) => [el.clientHeight, el.scrollHeight]);
    out(`${name}: a long list scrolls inside its box`, box[0] < 844 * 0.55 && box[1] > box[0], JSON.stringify(box));
  }

  if (name === "phone") {
    // The bar goes on the way down and comes back on the way up.
    await p.mouse.move(195, 400);
    await p.mouse.wheel(0, 300);
    await p.waitForTimeout(400);
    const hidden = async () => [await p.locator(STRIP).getAttribute("data-bar-hidden"), await p.locator(BAR).getAttribute("data-bar-hidden")].map((a) => a !== null);
    const outOfSight = await p.locator("[data-quick-add]").evaluate((el) => el.getBoundingClientRect().top >= window.innerHeight);
    out("both bars hide while scrolling down, the + with them", (await hidden()).every(Boolean) && outOfSight);
    await p.mouse.wheel(0, -100);
    await p.waitForTimeout(400);
    out("both bars come back scrolling up", (await hidden()).every((h) => !h));
    await p.mouse.wheel(0, 300);
    await p.waitForTimeout(400);
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(400);
    out("both bars come back at the top of the page", (await hidden()).every((h) => !h));

    // "+" adds a task to Today.
    await p.locator('[aria-label="New task for today"][data-quick-add]').click();
    await p.locator('[role="dialog"][aria-label="New task for today"] textarea').fill("Water the plants");
    await p.keyboard.press("Enter");
    await p.waitForTimeout(600);
    await p.screenshot({ path: "standalone-phone-add.png" });
    await p.keyboard.press("Escape");
    await p.keyboard.press("Escape");
    const today = await p.locator('[data-tile="today"] [data-today-own] textarea').evaluateAll((els) => els.map((el) => el.value));
    out("+ puts the task in Today", today.includes("Water the plants"), JSON.stringify(today));
    out("+ closes with Escape", (await p.locator('[role="dialog"][aria-label="New task for today"]').count()) === 0);

    await p.locator('[aria-label="Search"]').click();
    await p.locator(`${STRIP} [role="searchbox"]`).fill("fitn");
    await p.locator('[data-search-result^="goal:"]').click();
    await p.waitForTimeout(400);
    const status = await p.locator('p[role="status"]').innerText().catch(() => "");
    out("goal picked in the strip filters the Tasks page", status.includes("Fitness"), status);
    out("the strip shows its folders again after a pick", await p.locator('nav[aria-label="Folders"]').isVisible());
    await p.goto("http://localhost:5173/stats");
    await p.locator('[aria-label="Search"]').click();
    await p.locator(`${STRIP} [role="searchbox"]`).fill("fitn");
    await p.locator('[data-search-result^="goal:"]').click();
    await p.waitForURL("http://localhost:5173/");
    await p.waitForTimeout(400);
    out("goal picked from another page goes to Tasks filtered", (await p.locator('p[role="status"]').innerText().catch(() => "")).includes("Fitness"));
    await p.locator('[aria-label="Search"]').click();
    await p.locator(`${STRIP} [role="searchbox"]`).fill("milk");
    await p.waitForTimeout(800);
    await p.screenshot({ path: "standalone-phone-search.png" });
    await p.keyboard.press("Escape");
    out("Escape closes the search", (await p.locator("[data-site-search]").count()) === 0);
    await p.locator('[data-folder-tab="Work"]').click({ button: "right" });
    await p.waitForTimeout(300);
    const editor = await p.locator('[role="dialog"][aria-label^="Folder"]').boundingBox();
    const strip = await p.locator(STRIP).boundingBox();
    out("folder editor opens under the strip", editor && editor.y >= strip.y + strip.height - 1, JSON.stringify(editor));
  }
  await ctx.close();
}

// In a browser tab: the old task bar, with Notes.
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
await p.goto("http://localhost:5173/login");
await p.fill('input[autocomplete="username"]', user);
await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter");
await p.waitForSelector("section[data-drop-list]");
out("browser tab: clock shown", await p.locator('[aria-label="Time and date"]').isVisible());
out("browser tab: search on the page", (await p.locator("main [data-site-search]").count()) === 1);
const tabs = await p.locator('nav[aria-label="Pages"]').innerText();
out("browser tab: tab words, Notes too", tabs.includes("Tasks") && tabs.includes("Notes"), JSON.stringify(tabs));
await b.close();
