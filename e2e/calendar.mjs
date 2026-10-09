import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 500) => p.waitForTimeout(ms);
const today = new Date().toLocaleDateString("sv");
const plus = (n) => { const d = new Date(today + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const api = (url, method, body, day = today) => p.evaluate(async ([url, method, body, day]) => {
  const res = await fetch("/api" + url, { method, headers: { "Content-Type": "application/json", "X-Local-Date": day }, body: body && JSON.stringify(body) });
  return res.status === 204 ? null : res.json();
}, [url, method, body, day]);
const add = async (title, where) => (await api("/tasks", "POST", { title, ...where })).task.id;
const col = (day) => p.locator(`[data-day="${day}"]`);
const left = (day) => col(day).evaluate((el) => Math.round(el.getBoundingClientRect().left - el.parentElement.getBoundingClientRect().left));

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("h2:text-is('Goals')");
const listId = (await api("/lists", "GET")).lists[0].id;
const hard = await add("Hand in report", { listId }); await api(`/tasks/${hard}`, "PATCH", { deadlineDate: plus(3), deadlineType: "hard" });
const late = await add("Late thing", { listId }); await api(`/tasks/${late}`, "PATCH", { deadlineDate: plus(-2), deadlineType: "soft" });
const rep = await add("Water plants", { listId }); await api(`/tasks/${rep}`, "PATCH", { repeatEvery: 2, repeatUnit: "day" });
const marked = await add("Picked for today", { listId }); await api(`/tasks/${marked}`, "PATCH", { today: true });
const old = await add("Done yesterday", { listId }); await api(`/tasks/${old}/toggle`, "PATCH", undefined, plus(-1));

// What the API was just handed is not in the page yet.
await p.reload(); await p.waitForSelector("h2:text-is('Goals')");
await p.locator('nav [aria-label="Calendar"]').click(); await p.waitForSelector("[data-day-strip]"); await wait();
out("the Calendar tab opens the page with this month", p.url().endsWith("/calendar") && await p.locator(`[data-month="${today.slice(0, 7)}"]`).count() === 1);
out("the row of days starts at today", Math.abs(await left(today)) <= 2, await left(today));
out("a deadline is on its day, marked hard", await col(plus(3)).locator(`[data-plan-item="${hard}"][data-plan-kind="deadline"]`).count() === 1 && await col(plus(3)).getByText("hard deadline").count() === 1);
out("an overdue one is on today", await col(today).locator(`[data-plan-item="${late}"][data-plan-kind="overdue"]`).count() === 1);
out("a task on a schedule is due today, and on its later rounds", await col(today).locator(`[data-plan-item="${rep}"][data-plan-kind="due"]`).count() === 1 && await col(plus(2)).locator(`[data-plan-item="${rep}"][data-plan-kind="round"]`).count() === 1 && await col(plus(1)).locator(`[data-plan-item="${rep}"]`).count() === 0);
out("what is marked for Today is on today", await col(today).locator(`[data-plan-item="${marked}"][data-plan-kind="today"]`).count() === 1);
out("today counts what is open", (await col(today).locator("[data-day-summary]").innerText()).includes("3 to do"), await col(today).locator("[data-day-summary]").innerText());
out("the month marks the days", await p.locator(`[data-cal-day="${today}"] [data-cal-open="3"]`).count() === 1 && (today.slice(0, 7) !== plus(3).slice(0, 7) || await p.locator(`[data-cal-day="${plus(3)}"] [data-cal-open="1"]`).count() === 1));
out("a day gone by shows what was done", await col(plus(-1)).locator(`[data-done-item="${old}"]`).count() === 1 && await col(plus(-1)).getByText("+ Add").count() === 0);

await col(plus(5)).getByText("+ Add").click(); await p.keyboard.type("Dentist"); await p.keyboard.press("Enter"); await wait(900);
const made = (await api("/tasks", "GET")).tasks.find((t) => t.title === "Dentist");
out("+ Add writes a task into the list with that day as a soft deadline", made?.deadlineDate === plus(5) && made.deadlineType === "soft" && made.listId === listId && made.todaySince === null);
out("and it is on that day", await col(plus(5)).locator(`[data-plan-item="${made?.id}"]`).count() === 1);

await col(today).locator(`[data-plan-item="${marked}"] input[type=checkbox]`).click(); await wait(900);
out("ticking from a day ticks the task", (await api("/tasks", "GET")).tasks.find((t) => t.id === marked).isComplete && (await col(today).locator("[data-day-summary]").innerText()).includes("2 to do"));
await col(today).locator(`[data-plan-item="${rep}"] .repeat-button`).click(); await wait(900);
out("pressing a due task moves it on to its next day", await col(today).locator(`[data-plan-item="${rep}"]`).count() === 0 && await col(plus(2)).locator(`[data-plan-item="${rep}"][data-plan-kind="next"]`).count() === 1);

const far = plus(12);
if (far.slice(0, 7) !== today.slice(0, 7)) await p.locator('button[aria-label="Next month"]').click();
await p.locator(`[data-cal-day="${far}"] > button`).first().click(); await wait(1200);
out("a click on a day of the month brings it to the front of the row", Math.abs(await left(far)) <= 2 && await p.locator(`[data-cal-day="${far}"][data-selected]`).count() === 1, await left(far));
for (let i = 0; i < 6; i++) await p.locator('button[aria-label="Next month"]').click();
const months = await p.locator("[data-month]").getAttribute("data-month");
await p.locator(`[data-cal-day="${months}-15"] > button`).click(); await wait(1200);
out("a day months away starts the row afresh around it", Math.abs(await left(`${months}-15`)) <= 2 && await col(today).count() === 0);
await p.locator("[data-days-today]").click(); await wait(1200);
out("Today comes back to today", Math.abs(await left(today)) <= 2 && await p.locator(`[data-month="${today.slice(0, 7)}"]`).count() === 1, await left(today));
const strip = p.locator("[data-day-strip]");
out("the row has no scroll bar, and comes before the month", await strip.evaluate((el) => el.offsetHeight === el.clientHeight && getComputedStyle(el).scrollbarWidth === "none") && await p.locator('section[aria-label="Days"]').evaluate((el) => el.getBoundingClientRect().top < document.querySelector('section[aria-label="Calendar"]').getBoundingClientRect().top));
out("the month is as wide as the days", await p.locator('section[aria-label="Calendar"]').evaluate((el) => el.offsetWidth >= document.querySelector('section[aria-label="Days"]').offsetWidth));
const first = await p.locator("[data-day]").first().getAttribute("data-day");
for (let i = 0; i < 4; i++) { await p.locator('button[aria-label="Earlier days"]').click(); await wait(700); }
out("going back never reaches an end: days are put in front", await p.locator("[data-day]").first().getAttribute("data-day") < first && await strip.evaluate((el) => el.scrollLeft > 600), await p.locator("[data-day]").first().getAttribute("data-day"));
const count = await p.locator("[data-day]").count();
for (let i = 0; i < 12; i++) { await p.locator('button[aria-label="Later days"]').click(); await wait(500); }
out("nor does going on", await p.locator("[data-day]").count() > count && await strip.evaluate((el) => el.scrollWidth - el.scrollLeft - el.clientWidth > 600), `${count} -> ${await p.locator("[data-day]").count()}`);
const box = await strip.boundingBox(); const at = await strip.evaluate((el) => el.scrollLeft);
await p.mouse.move(box.x + 300, box.y + box.height - 8); await p.mouse.down(); await p.mouse.move(box.x + 100, box.y + box.height - 8, { steps: 5 }); await p.mouse.up();
out("the row is dragged with the mouse", await strip.evaluate((el) => el.scrollLeft) - at === 200, await strip.evaluate((el) => el.scrollLeft) - at);

await p.locator("[data-days-today]").click(); await wait(1200);
out("the month names the tasks on a day", await p.locator(`[data-cal-day="${plus(5)}"] [data-cal-task="${made.id}"]`).isVisible() || today.slice(0, 7) !== plus(5).slice(0, 7));
await col(plus(5)).locator(`[data-plan-item="${made.id}"] [data-task-name]`).click(); await wait(300);
const info = p.locator(`[data-task-info="${made.id}"]`);
out("a click on a task in the days opens more about it", await info.count() === 1 && (await info.innerText()).includes("soft") && (await info.innerText()).includes("in 5 days"), (await info.innerText()).replace(/\n/g, " | "));
await info.getByText("Show in list").click(); await p.waitForSelector(`[data-task-row="${made.id}"]`); await wait(600);
out("and leads to its place in its list", new URL(p.url()).pathname === "/" && await p.locator(`[data-task-row="${made.id}"]`).isVisible());
const big = await add("Big thing", { listId }); await add("Part one", { parentId: big }); await add("Part two", { parentId: big });
await api(`/tasks/${big}`, "PATCH", { deadlineDate: plus(1), deadlineType: "hard" });
await p.goto("http://localhost:5173/calendar"); await p.waitForSelector("[data-day-strip]"); await wait();
if (today.slice(0, 7) === plus(1).slice(0, 7)) {
  await p.locator(`[data-cal-day="${plus(1)}"] [data-cal-task="${big}"]`).click(); await wait(300);
  out("a click on a task in the month opens it too, with its subtasks", (await p.locator(`[data-task-info="${big}"]`).innerText()).includes("0/2 done"));
  await p.locator(`[data-task-info="${big}"]`).getByText("Open task").click(); await wait(600);
  out("a big task leads to its own page", new URL(p.url()).pathname === `/tasks/${big}`);
  await p.goto("http://localhost:5173/calendar"); await p.waitForSelector("[data-day-strip]"); await wait();
}
await col(plus(-1)).locator(`[data-done-item="${old}"] [data-task-name]`).click(); await wait(300);
out("something done on a day gone by opens too", await p.locator(`[data-task-info="${old}"]`).count() === 1);
await p.keyboard.press("Escape"); await wait(200);
out("Escape closes it", await p.locator("[data-task-info]").count() === 0);

const dragTo = async (name, target) => {
  const handle = await p.locator(`section[aria-label="${name}"] .tile-button-tab`).boundingBox();
  // The "New" tab is only there while a box is dragged.
  await p.mouse.move(handle.x + 5, handle.y + 5); await p.mouse.down(); await p.mouse.move(handle.x + 9, handle.y + 9); const to = await p.locator(target).boundingBox(); await p.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 }); await p.mouse.up(); await wait(700);
};
out("on the Calendar page the boxes have a tab button and no pin", await p.locator(".tile-button-tab").count() === 2 && await p.locator(".tile-button-pin").count() === 0);
await dragTo("Days", 'nav [data-tab-drop="main"]');
out("a box dropped on Tasks says so and stays", (await p.locator("[data-cal-note]").innerText()).includes("Tasks page") && await p.locator('section[aria-label="Days"]').count() === 1);
await p.locator('nav [aria-label="Tasks"]').click(); await p.waitForSelector("h2:text-is('Goals')"); await wait();
out("and is on the Tasks page, as a tile, with the tasks", await p.locator('[data-tile="cal:days"] [data-day-strip]').count() === 1 && await p.locator('[data-tile="cal:month"]').count() === 0 && await p.locator(`[data-tile="cal:days"] [data-day="${today}"] [data-plan-item="${late}"]`).count() === 1);
out("where the page still fits", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
await p.locator('[data-tile="cal:days"] .tile-button-min').click(); await wait();
out("it can be hidden there", await p.locator('[data-tile="cal:days"]').count() === 0 && await p.getByRole("button", { name: "Days" }).count() >= 1);
await p.goto("http://localhost:5173/calendar"); await p.waitForSelector("[data-day-strip]"); await wait();
await dragTo("Calendar", 'nav [data-tab-drop="new"]'); await wait(600);
const folder = (await api("/folders", "GET")).folders.find((f) => f.views.includes("cal:month"));
out("a box dropped on New makes a folder that shows it", Boolean(folder));
await p.keyboard.press("Escape"); await p.goto(`http://localhost:5173/folders/${folder?.id}`); await p.waitForSelector('[data-tile="cal:month"]'); await wait();
out("and the folder's page has the month", await p.locator('[data-tile="cal:month"] [data-month]').count() === 1);
await p.screenshot({ path: "calendar-folder.png", fullPage: true });
await p.goto("http://localhost:5173/calendar"); await p.waitForSelector("[data-day-strip]"); await wait();
await p.screenshot({ path: "calendar.png", fullPage: true });

await p.setViewportSize({ width: 390, height: 800 }); await p.reload(); await p.waitForSelector("[data-day-strip]"); await wait();
out("fits a phone", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
await p.screenshot({ path: "calendar-phone.png", fullPage: true });
await b.close();
