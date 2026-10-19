import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 400) => p.waitForTimeout(ms);
const path = () => new URL(p.url()).pathname;
const api = (url, method, body) => p.evaluate(async ([url, method, body]) => {
  const res = await fetch("/api" + url, { method, headers: { "Content-Type": "application/json", "X-Local-Date": new Date().toLocaleDateString("sv") }, body: body && JSON.stringify(body) });
  return res.status === 204 ? null : res.json();
}, [url, method, body]);
const idOf = (r) => (r.task ?? r).id;
const add = async (title, where) => idOf(await api("/tasks", "POST", { title, ...where }));
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv"); };

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("h2:text-is('Goals')");
const lists = await api("/lists", "GET"); const listId = (lists.lists ?? lists)[0].id;

// A big task (hard deadline, two subtasks) with one subtask in Today, the big task itself in Today, and a small task in Today.
const big = await add("Thesis", { listId });
const chapter = await add("Chapter one", { parentId: big }); await add("Chapter two", { parentId: big });
await api(`/tasks/${big}`, "PATCH", { deadlineDate: day(10), deadlineType: "hard", today: true });
await api(`/tasks/${chapter}`, "PATCH", { today: true });
const small = await add("Buy milk", { listId }); await api(`/tasks/${small}`, "PATCH", { today: true });
const plain = await add("Clean floor", { listId }); await add("Sweep", { parentId: plain }); await add("Mop", { parentId: plain }); await api(`/tasks/${plain}`, "PATCH", { today: true });
await p.reload(); await p.waitForSelector(`[data-today-item="${small}"]`);

const item = (id) => p.locator(`section[aria-label="Today"] [data-today-item="${id}"]`);
const title = (id) => item(id).locator("span.truncate").first();
const home = async () => { await p.goto("http://localhost:5173/"); await p.waitForSelector(`[data-today-item="${small}"]`); };
const found = (id) => p.locator(`[data-drop-list] [data-task-row="${id}"][data-found]`);
await title(big).click(); await wait();
out("a big task in Today opens its page", path() === `/tasks/${big}`, path());
out("the page has its table", await p.locator('section[aria-label="Countdown"] table').count() === 1);
await home();
await title(chapter).click(); await wait(700);
out("a subtask with no page of its own goes to its row in its list, unfolded and marked", path() === "/" && await found(chapter).count() === 1, path());
await home();
await title(small).click(); await wait(700);
out("a small task goes to its row in its list", path() === "/" && await found(small).count() === 1, path());
const subs = item(plain).locator("[data-today-subtasks]");
out("its arrow is there only with subtasks", await item(plain).locator(".task-arrow").isEnabled() && await item(small).locator(".task-arrow").isDisabled() && await subs.count() === 0);
await home();
await title(plain).click(); await wait(700);
out("a task with subtasks goes to its row too, not unfolding here", path() === "/" && await found(plain).count() === 1 && await subs.count() === 0, path());
await item(plain).locator(".task-arrow").click(); await wait();
out("the arrow shows the subtasks", (await subs.locator("textarea").evaluateAll((els) => els.map((el) => el.value))).join() === "Sweep,Mop");
await subs.locator("input[type=checkbox]").first().click(); await wait();
out("a subtask can be ticked from there", await subs.locator("input[type=checkbox]:checked").count() === 1);
await item(big).locator(".task-arrow").click(); await wait();
out("a big task's arrow shows its subtasks without leaving", path() === "/" && await item(big).locator("[data-today-subtasks] textarea").count() === 2, path());
await p.screenshot({ path: "todayopen.png" });
await item(chapter).locator("input[type=checkbox]").click(); await wait();
out("ticking in Today ticks, without leaving", path() === "/" && await item(chapter).locator("input[type=checkbox]").isChecked(), path());
await item(big).locator('button[aria-label^="Take"]').click(); await wait();
out("× takes it out of Today, without leaving", path() === "/" && await item(big).count() === 0, path());

// Carried over from two days ago: a deadline today says so instead.
const twoDaysAgo = (url, body) => p.evaluate(async ([url, body, d]) => {
  await fetch("/api" + url, { method: "PATCH", headers: { "Content-Type": "application/json", "X-Local-Date": d }, body: JSON.stringify(body) });
}, [url, body, day(-2)]);
const dueNow = await add("Pay rent", { listId }); await api(`/tasks/${dueNow}`, "PATCH", { deadlineDate: day(0), deadlineType: "hard" });
await twoDaysAgo(`/tasks/${dueNow}`, { today: true });
const old = await add("Call gran", { listId }); await twoDaysAgo(`/tasks/${old}`, { today: true });
await home();
out("a task carried over says so", await item(old).locator("[data-carried]").innerText() === "carried over 2 days");
out("…but one with its deadline today says that instead", await item(dueNow).locator("[data-carried]").count() === 0 && await item(dueNow).locator("[data-deadline-today]").innerText() === "deadline today");

// The put-off bin under Today.
const nextMonday = day(7 - ((new Date().getDay() + 6) % 7));
const later = await add("Repaint shed", { listId }); await api(`/tasks/${later}/week`, "POST", { day: nextMonday });
await home();
const bin = p.locator('section[aria-label="Today"] [data-next-week]');
out("under Today is the bin of what was put off to next week", await bin.isVisible() && await bin.locator(`[data-week-item="${later}"]`).count() === 1);
{
  const handle = p.locator(`[data-drop-list] [data-task-row="${old}"] [aria-label="Drag to move this task"]`);
  await handle.scrollIntoViewIfNeeded();
  const h = await handle.boundingBox(); await bin.locator("header").scrollIntoViewIfNeeded(); const t = await bin.locator("header").boundingBox();
  await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await p.mouse.down();
  await p.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 20 }); await wait(200); await p.mouse.up(); await wait(900);
}
const putOff = (await api("/tasks", "GET")).tasks.find((t) => t.id === old);
out("…and a task dragged there is put off", putOff.weekDay === nextMonday && await bin.locator(`[data-week-item="${old}"]`).count() === 1, putOff.weekDay);
out("…out of Today, its days carried over forgotten", putOff.todaySince === null && await item(old).count() === 0 && await bin.locator(`[data-week-item="${old}"] [data-carried]`).count() === 0, putOff.todaySince);

// A carried-over row of Today goes into the bin by its own handle.
const waited = await add("Fix bike", { listId }); await twoDaysAgo(`/tasks/${waited}`, { today: true });
await home();
{
  const handle = item(waited).locator('[aria-label^="Drag"]');
  await handle.scrollIntoViewIfNeeded();
  const h = await handle.boundingBox(); const t = await bin.locator("header").boundingBox();
  await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await p.mouse.down();
  await p.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 20 }); await wait(200); await p.mouse.up(); await wait(900);
}
const fromToday = (await api("/tasks", "GET")).tasks.find((t) => t.id === waited);
out("a carried-over row of Today dragged by its handle into the bin is put off and leaves Today",
  fromToday.weekDay === nextMonday && fromToday.todaySince === null && await item(waited).count() === 0 && await bin.locator(`[data-week-item="${waited}"]`).count() === 1,
  `${fromToday.weekDay} ${fromToday.todaySince}`);

await b.close();
