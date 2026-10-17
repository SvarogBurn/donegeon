import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 1000 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
console.log("USER", user);
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 450) => p.waitForTimeout(ms);
const api = (path, method = "GET", body) => p.evaluate(async ([path, method, body]) => {
  const r = await fetch("/api" + path, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
}, [path, method, body]);
// The same request twice at once, as a double click on a slow connection sends it.
const twice = (path, method, body) => p.evaluate(async ([path, method, body]) => {
  const send = () => fetch("/api" + path, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) }).then((r) => r.status);
  return Promise.all([send(), send()]);
}, [path, method, body]);
const balance = async () => (await api("/points")).json.balance;
const isDone = async (id) => (await api(`/tasks/${id}`)).json.task.isComplete;
const row = (title) => p.locator(`[data-task-row]:has(textarea:text-is("${title}"))`).first();

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await wait(1200);
await api("/auth/me", "PATCH", { tutorialSeen: true });
const list = (await api("/lists")).json.lists[0];
const made = async (title, changes, listId = list.id) => { const t = (await api("/tasks", "POST", { title, listId })).json.task; if (changes) await api(`/tasks/${t.id}`, "PATCH", changes); return t; };

// --- ticking twice at once
const work = await made("Work", { points: 5 });
const statuses = await twice(`/tasks/${work.id}/toggle`, "PATCH", { done: true });
out("two ticks at once both answer", statuses.every((s) => s === 200), statuses.join(","));
out("and book the points once", (await balance()) === 5 && (await isDone(work.id)), await balance());
await api(`/tasks/${work.id}/toggle`, "PATCH", { done: false });
out("an untick takes them back", (await balance()) === 0 && !(await isDone(work.id)), await balance());
await api(`/tasks/${work.id}/toggle`, "PATCH", { done: false });
out("unticking an open task changes nothing", (await balance()) === 0 && !(await isDone(work.id)), await balance());
await twice(`/tasks/${work.id}/toggle`, "PATCH");
out("two flips at once (no body, the old way) tick it once", (await balance()) === 5 && (await isDone(work.id)), await balance());

// --- no paying twice for one task
const shop = (await api("/lists", "POST", { name: "Shop", kind: "reward", defaultPoints: 5 })).json.list;
const treat = await made("Treat", null, shop.id);
await api(`/tasks/${treat.id}/toggle`, "PATCH", { done: true });
out("the points are spent on a reward", (await balance()) === 0, await balance());
await api(`/tasks/${work.id}/toggle`, "PATCH", { done: false });
out("unticking the task keeps the spent points (the balance can't go below 0)", (await balance()) === 0 && !(await isDone(work.id)), await balance());
await api(`/tasks/${work.id}/toggle`, "PATCH", { done: true });
out("ticking it again doesn't pay a second time", (await balance()) === 0 && (await isDone(work.id)), await balance());

// --- a double click in the page
const click = await made("Click", { points: 3 });
const again = await made("Again", { points: 2, isPersistent: true });
await p.goto("http://localhost:5173/"); await row("Click").waitFor();
const before = await balance();
await row("Click").locator("input[type=checkbox]").first().dblclick(); await wait(1200);
out("a double click on a checkbox ticks once", (await balance()) === before + 3 && (await isDone(click.id)), `${before} -> ${await balance()}`);
await row("Again").locator('button[aria-label^="Done"]').dblclick(); await wait(1200);
out("a double click on “done it” counts once", (await balance()) === before + 5, `${before} -> ${await balance()}`);

// --- deletes: restorable for a minute, then gone
const soon = await made("Soon");
await api(`/tasks/${soon.id}`, "DELETE");
out("a delete undone at once comes back", (await api(`/tasks/${soon.id}/restore`, "POST")).status === 204 && (await api(`/tasks/${soon.id}`)).status === 200);
const late = await made("Late");
const box = (await api("/lists", "POST", { name: "Box" })).json.list;
await api(`/tasks/${late.id}`, "DELETE"); await api(`/lists/${box.id}`, "DELETE");
console.log("(waiting 61 s for the restore window to close)");
await p.waitForTimeout(61_000);
const tooLate = await api(`/tasks/${late.id}/restore`, "POST");
out("a minute later the undo is refused, and says why", tooLate.status === 410 && /too late/i.test(tooLate.json?.error ?? ""), `${tooLate.status} ${tooLate.json?.error}`);
out("the same for a list", (await api(`/lists/${box.id}/restore`, "POST")).status === 410);

await b.close();
