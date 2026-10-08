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
await p.reload(); await p.waitForSelector(`[data-today-item="${small}"]`);

const item = (id) => p.locator(`section[aria-label="Today"] [data-today-item="${id}"]`);
const title = (id) => item(id).locator("span.truncate").first();
await title(big).click(); await wait();
out("a big task in Today opens its page", path() === `/tasks/${big}`, path());
out("the page has its table", await p.locator('section[aria-label="Countdown"] table').count() === 1);
await p.goto("http://localhost:5173/"); await p.waitForSelector(`[data-today-item="${small}"]`);
await title(chapter).click(); await wait();
out("a subtask of a big task opens the big task's page", path() === `/tasks/${big}`, path());
await p.goto("http://localhost:5173/"); await p.waitForSelector(`[data-today-item="${small}"]`);
await title(small).click(); await wait();
out("a small task has no page: stays put", path() === "/", path());
await item(chapter).locator("input[type=checkbox]").click(); await wait();
out("ticking in Today ticks, without leaving", path() === "/" && await item(chapter).locator("input[type=checkbox]").isChecked(), path());
await item(big).locator('button[aria-label^="Take"]').click(); await wait();
out("× takes it out of Today, without leaving", path() === "/" && await item(big).count() === 0, path());

await b.close();
