// The bell: a deadline whose day has passed, with the task still open, is a notification (the deadline day itself is
// not: it is the last day, its pill not overdue red). A tap on one asks for a new deadline; a day picked saves it and the
// notification is gone. × dismisses one and it stays away after a reload. In the browser's task bar and in the
// installed app's top strip.
import { chromium } from "playwright";
const b = await chromium.launch();
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const user = "uitest" + Date.now();
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR", String(e)));
const api = (url, method = "GET", body) => p.evaluate(async ([url, method, body]) => {
  const res = await fetch("/api" + url, { method, headers: { "Content-Type": "application/json", "X-Local-Date": new Date().toLocaleDateString("sv") }, body: body && JSON.stringify(body) });
  return res.status === 204 ? null : res.json();
}, [url, method, body]);
const add = async (title, where) => (await api("/tasks", "POST", { title, ...where })).task.id;
const bell = () => p.locator("[data-bell]");
const items = () => p.locator("[data-notification]").evaluateAll((els) => els.map((el) => el.dataset.notification));

await p.goto("http://localhost:5173/signup");
await p.fill('input[autocomplete="username"]', user);
await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter");
await p.waitForSelector("section[data-drop-list]");
await api("/auth/me", "PATCH", { tutorialSeen: true });
const listId = (await api("/lists")).lists[0].id;
const late = await add("Late essay", { listId, deadlineDate: day(-2), deadlineType: "hard" });
const old = await add("Old form", { listId, deadlineDate: day(-5), deadlineType: "soft" });
const now = await add("Due today", { listId, deadlineDate: day(0), deadlineType: "hard" });
await p.reload();
await p.waitForSelector("[data-task-row]");

const nowPill = await p.locator(`[data-task-row]:has(textarea:text-is("Due today")) .pixel-chip[title*="deadline"]`).first().getAttribute("title");
out("a deadline on its own day is not overdue", nowPill && !nowPill.includes("overdue"), nowPill);
out("the bell counts the passed deadlines", (await bell().getAttribute("aria-label")) === "Notifications: 2 new", await bell().getAttribute("aria-label"));
// The clock and the tiny bell beside it are one button: a click on the time opens the notifications, not a time changer.
await p.locator("[data-clock-time]").click();
out("a click on the clock opens the notifications", await p.locator('[role="dialog"][aria-label="Notifications"]').isVisible());
out("the clock no longer changes the time", (await p.locator('input[type="time"]').count()) === 0);
const tiny = await p.locator("[data-bell] .bar-glyph-bell-tiny").boundingBox();
out("the bell beside the clock is teeny (8x10)", tiny && tiny.width === 8 && tiny.height === 10, JSON.stringify(tiny));
out("the latest passed first, not the one due today", JSON.stringify(await items()) === JSON.stringify([late, old]), JSON.stringify(await items()));
await p.screenshot({ path: "notifications.png" });

// A tap asks for the new deadline; "Tomorrow" saves it.
await p.locator(`[data-notification="${late}"]`).click();
await p.waitForSelector(`[data-postpone="${late}"]`);
out("the popup asks for a new deadline", await p.getByText("For when would you like to change the deadline?").isVisible());
await p.screenshot({ path: "notifications-postpone.png" });
await p.getByRole("button", { name: /^Tomorrow/ }).click();
await p.waitForTimeout(800);
const moved = (await api(`/tasks/${late}`)).task;
out("the deadline moved to tomorrow", moved.deadlineDate === day(1), moved.deadlineDate);
out("one notification left", (await bell().getAttribute("aria-label")) === "Notifications: 1 new");

// Dismissed: gone, and still gone after a reload.
await bell().click();
await p.locator("li", { has: p.locator(`[data-notification="${old}"]`) }).getByRole("button", { name: "Dismiss" }).click();
out("dismissed, the bell is empty", (await bell().getAttribute("aria-label")) === "Notifications" && (await p.getByText("Nothing new.").isVisible()));
await p.reload();
await p.waitForSelector("[data-task-row]");
out("a dismissal survives a reload", (await bell().getAttribute("aria-label")) === "Notifications");

// The installed app: the bell in the top strip, the list under it.
const app = await b.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() });
await app.addInitScript(() => {
  const real = window.matchMedia.bind(window);
  window.matchMedia = (q) => (q.includes("display-mode: standalone") ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : real(q));
});
const q = await app.newPage();
await q.goto("http://localhost:5173/");
await q.waitForSelector("[data-task-row]");
const patched = await q.evaluate(async (id) => {
  const res = await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "X-Local-Date": new Date().toLocaleDateString("sv") }, body: JSON.stringify({ deadlineDate: "2026-01-01" }) });
  return res.status + " " + (await res.text()).slice(0, 200);
}, now);
if (!patched.startsWith("200")) console.log("PATCH", patched);
await q.reload();
await q.waitForSelector("[data-task-row]");
const strip = q.locator("header.top-0");
const stripBell = strip.locator("[data-bell]");
// The device's kept tasks show first; the server's arrive just after.
await q.waitForSelector('header.top-0 [data-bell][aria-label="Notifications: 1 new"]', { timeout: 5000 }).catch(() => {});
out("the strip has the bell with its count", (await stripBell.getAttribute("aria-label")) === "Notifications: 1 new", await stripBell.getAttribute("aria-label"));
await stripBell.click();
const box = await q.locator('[role="dialog"][aria-label="Notifications"]').boundingBox();
const top = await strip.boundingBox();
out("the list opens under the strip", box && top && box.y >= top.y + top.height - 1, JSON.stringify([box, top]));
await q.screenshot({ path: "notifications-phone.png" });

await b.close();
