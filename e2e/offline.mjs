// Working offline: changes shown at once and kept on the device, the app opening with no connection, and the
// changes saved in order once it's back. Needs the built app (service worker): `npm run build && npx vite preview`
// in frontend/ (port 4173, which proxies /api to the dev API on :3001). BASE overrides the address.
import { chromium } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:4173";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1200, height: 1400 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR", String(e)));
p.on("response", async (r) => r.status() >= 500 && r.status() !== 503 && console.log("HTTP", r.status(), r.url()));
const user = "uitest" + Date.now();
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 450) => p.waitForTimeout(ms);
const row = (title) => p.locator(`[data-task-row]:has(textarea:text-is("${title}"))`).first();
const titles = () => p.locator("[data-task-row] textarea").evaluateAll((els) => els.map((e) => e.value));
const add = async (text) => {
  await p.locator('[data-task-editor^="add:"]').first().click();
  await p.keyboard.type(text);
  // A shortcut's dropdown takes the first Enter.
  if (await p.locator("[data-syntax-options]").count()) await p.keyboard.press("Escape");
  await p.keyboard.press("Enter");
  await wait();
  await p.keyboard.press("Escape");
};
/** What the server has, asked from the page (same cookie). */
const server = (path) => p.evaluate(async (path) => (await fetch(`/api${path}`)).json(), path);
const allTasks = async () => {
  const flat = (nodes) => nodes.flatMap((n) => [n, ...flat(n.children)]);
  return flat((await server("/tasks")).tasks);
};

await p.goto(BASE + "/");
await p.waitForSelector("text=Create an account");
await p.click("text=Create an account");
await p.waitForSelector('button:text-is("Sign up")');
await p.fill('input[autocomplete="username"]', user);
await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter");
await p.waitForSelector("section[data-drop-list]");
for (const t of ["Tick me", "Rename me", "Delete me", "Move me", "Gym @daily"]) await add(t);
await p.evaluate(() => navigator.serviceWorker.ready);
await wait(2000);
const before = await allTasks();
out("set up online", before.length === 5, before.map((t) => t.title).join());

// Offline.
await ctx.setOffline(true);
await wait(300);
out("says it's offline", (await p.locator("[data-offline]").count()) === 1);
await add("Written offline #errands");
await row("Tick me").locator("input[type=checkbox]").click();
await wait();
await row("Gym").locator(".repeat-button").click();
await wait();
await row("Rename me").locator("textarea").click();
await p.keyboard.press("End");
await p.keyboard.type(" again");
await p.keyboard.press("Enter");
await wait();
await p.keyboard.press("Escape");
await row("Move me").locator("textarea").click();
await p.keyboard.press("Alt+ArrowUp");
await wait();
await p.keyboard.press("Escape");
await row("Delete me").locator("textarea").click();
await p.keyboard.press("End");
await p.keyboard.press("Delete");
await wait();

const shown = await titles();
out("a task written offline shows at once", shown.includes("Written offline"), shown.join());
out("the tick shows at once", await row("Tick me").locator("input[type=checkbox]").isChecked());
out("the rename shows", shown.includes("Rename me again"), shown.join());
out("the delete shows", !shown.includes("Delete me"), shown.join());
out("the move shows", shown.indexOf("Move me") < shown.indexOf("Delete me") || !shown.includes("Delete me"), shown.join());
out("the new tag is on the task", (await row("Written offline").locator('[title="Tag: errands"]').count()) === 1);
const waiting = await p.locator("[data-offline]").textContent();
out("counts the changes waiting", /6 changes waiting/.test(waiting ?? ""), waiting);
out("lists can't be changed offline", await p.locator('input[aria-label="List name"]').first().isDisabled());

// Closed and opened again, still offline: the app and the changes are kept on the device.
await wait(1500);
await p.reload();
await p.waitForSelector("[data-task-row]", { timeout: 10_000 });
await wait(800);
const reopened = await titles();
out("opens offline with the changes still shown", reopened.includes("Written offline") && reopened.includes("Rename me again") && !reopened.includes("Delete me"), reopened.join());
out("still counts them after reopening", /6 changes waiting/.test((await p.locator("[data-offline]").textContent()) ?? ""));

// Back online: sent in order, then the page shows the server's own.
await ctx.setOffline(false);
await p.waitForFunction(() => !document.querySelector("[data-offline]") && !document.querySelector("[data-saving]"), null, { timeout: 30_000 });
await wait(1500);
const after = await allTasks();
const byTitle = (t) => after.find((x) => x.title === t);
out("the task written offline is saved, with its tag", !!byTitle("Written offline") && byTitle("Written offline").tagIds.length === 1);
out("the tick is saved", byTitle("Tick me")?.isComplete === true);
out("the rename is saved", !!byTitle("Rename me again"));
out("the delete is saved", !byTitle("Delete me"));
out("the press is saved, once", byTitle("Gym")?.completions.length === 1, JSON.stringify(byTitle("Gym")?.completions));
out("nothing doubled", after.filter((t) => t.title === "Written offline").length === 1);
const tags = (await server("/tags")).tags;
out("the tag is made once", tags.filter((t) => t.name === "errands").length === 1, tags.map((t) => t.name).join());
out("no failure notice", (await p.locator("[data-save-failure]").count()) === 0);

// A change the server refuses when it comes in: the task was deleted elsewhere meanwhile.
await ctx.setOffline(true);
await row("Move me").locator("input[type=checkbox]").click();
await add("Also offline");
const doomed = byTitle("Move me").id;
// Deleted from "another device" while this one is offline (the context's own requests aren't cut off).
await ctx.request.delete(`${BASE}/api/tasks/${doomed}`);
await ctx.setOffline(false);
await p.waitForSelector("[data-save-failure]", { timeout: 30_000 });
const failure = await p.locator("[data-save-failure]").textContent();
out("a refused change is named in the notice", /Move me/.test(failure ?? ""), failure);
await wait(1500);
out("the changes after it are still saved", !!(await allTasks()).find((t) => t.title === "Also offline"));
await p.locator("[data-save-failure] button").click();
out("the notice can be dismissed", (await p.locator("[data-save-failure]").count()) === 0);

await b.close();
