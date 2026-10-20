// Folder tabs dragged into another order: with the mouse along the browser's task bar, and with a finger (held
// first) along the installed app's top strip, where a quick swipe still scrolls and a hold let go opens the name.
import { chromium } from "playwright";
const b = await chromium.launch();
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const user = "uitest" + Date.now();

// The browser's task bar, with the mouse.
const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
p.on("pageerror", (e) => console.log("PAGEERROR", String(e)));
p.on("response", async (r) => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const wait = (ms = 400) => p.waitForTimeout(ms);
await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("section[data-drop-list]");
for (const name of ["One", "Two", "Three", "Four"]) {
  await p.evaluate((name) => fetch("/api/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }), name);
}
await p.reload(); await p.waitForSelector('nav [data-folder-tab="Four"]');
const tabs = (page = p) => page.locator("nav [data-folder-tab]").evaluateAll((els) => els.map((el) => el.dataset.folderTab).join(","));
const saved = (page = p) => page.evaluate(async () => (await (await fetch("/api/folders")).json()).folders.map((f) => f.name).join(","));
const box = (name, page = p) => page.locator(`nav [data-folder-tab="${name}"]`).boundingBox();

{
  const from = await box("One"); const to = await box("Three");
  await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await p.mouse.down();
  await p.mouse.move(to.x + to.width * 0.8, to.y + to.height / 2, { steps: 12 }); await wait(100);
  const marked = await p.locator('[data-folder-id][data-reorder="after"] [data-folder-tab="Three"]').count();
  const dimmed = await p.locator('[data-folder-id][data-dragged] [data-folder-tab="One"]').count();
  await p.mouse.up(); await wait(700);
  out("a tab dragged over another marks the side it lands on, and is dimmed", marked === 1 && dimmed === 1);
  out("let go: it is there, and stays there", (await tabs()) === "Two,Three,One,Four" && (await saved()) === "Two,Three,One,Four", `${await tabs()} / ${await saved()}`);
  out("…without opening a folder", new URL(p.url()).pathname === "/", p.url());
}
{
  const from = await box("Four"); const to = await box("Two");
  await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await p.mouse.down();
  await p.mouse.move(to.x + 4, to.y + to.height / 2, { steps: 12 }); await p.mouse.up(); await wait(700);
  out("dragged to the front, before the first", (await tabs()) === "Four,Two,Three,One", await tabs());
}
{
  const from = await box("Two");
  await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await p.mouse.down();
  await p.mouse.move(from.x + from.width / 2, from.y - 300, { steps: 12 }); await p.mouse.up(); await wait(500);
  out("let go away from the bar, it stays where it was", (await tabs()) === "Four,Two,Three,One", await tabs());
}
await p.locator('nav [data-folder-tab="Three"]').click(); await wait();
out("a click still opens the folder", new URL(p.url()).pathname.startsWith("/folders/"), p.url());
await p.goto("http://localhost:5173/"); await p.waitForSelector('nav [data-folder-tab="One"]');
{
  const t = await box("One");
  await p.mouse.move(t.x + t.width / 2, t.y + t.height / 2); await p.mouse.down(); await wait(700);
  out("held: the tab lifts", await p.locator('[data-folder-id][data-lifted] [data-folder-tab="One"]').count() === 1);
  await p.mouse.up(); await wait(300);
  out("…let go: its name and colour open, and no folder is opened", await p.locator('nav [role=dialog][aria-label="Folder \\"One\\""]').count() === 1 && new URL(p.url()).pathname === "/");
  await p.keyboard.press("Escape");
}
const cookies = await p.context().cookies();
await p.close();

// The installed app's top strip on a phone, with a finger.
const fakeStandalone = () => {
  const real = window.matchMedia.bind(window);
  window.matchMedia = (q) => (q.includes("display-mode: standalone") ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : real(q));
};
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await ctx.addInitScript(fakeStandalone);
const q = await ctx.newPage();
q.on("pageerror", (e) => console.log("PAGEERROR", String(e)));
// The same session as above.
await ctx.addCookies(cookies);
await q.goto("http://localhost:5173/"); await q.waitForSelector('nav[aria-label="Folders"] [data-folder-tab="One"]');
const cdp = await ctx.newCDPSession(q);
const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
const finger = async (from, to, holdMs) => {
  await touch("touchStart", from.x, from.y); await q.waitForTimeout(holdMs);
  for (let i = 1; i <= 12; i++) { await touch("touchMove", from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12); await q.waitForTimeout(16); }
  await touch("touchEnd"); await q.waitForTimeout(700);
};
const mid = async (name, side = 0.5) => { const t = await box(name, q); return { x: t.x + t.width * side, y: t.y + t.height / 2 }; };
const before = await tabs(q);
await finger(await mid("Four"), await mid("Three", 0.8), 0);
out("phone: a quick swipe over the tabs moves none of them", (await tabs(q)) === before, await tabs(q));
await finger(await mid("Four"), await mid("Three", 0.8), 700);
out("phone: held, then dragged, the tab moves", (await tabs(q)) === "Two,Three,Four,One" && (await saved(q)) === "Two,Three,Four,One", `${await tabs(q)} / ${await saved(q)}`);
out("…and no folder or name was opened", new URL(q.url()).pathname === "/" && await q.locator('nav [role=dialog][aria-label^="Folder"]').count() === 0, q.url());
{
  const t = await mid("Two");
  await touch("touchStart", t.x, t.y); await q.waitForTimeout(700); await touch("touchEnd"); await q.waitForTimeout(400);
  out("phone: held and let go, its name and colour open", await q.locator('nav [role=dialog][aria-label="Folder \\"Two\\""]').count() === 1 && new URL(q.url()).pathname === "/", q.url());
}
await q.screenshot({ path: "foldertabs-phone.png" });
await b.close();
