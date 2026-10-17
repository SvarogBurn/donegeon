import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 1400 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 500) => p.waitForTimeout(ms);
const sv = (d) => d.toLocaleDateString("sv");
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return sv(d); };
const toMonday = (new Date().getDay() + 6) % 7;
const today = day(0);
const monday = day(-toMonday);
const nextMonday = day(7 - toMonday);
// Another day of this week than today, for moving tasks between days.
const other = today === monday ? day(1) : monday;
const api = (url, method, body) => p.evaluate(async ([url, method, body]) => {
  const res = await fetch("/api" + url, { method, headers: { "Content-Type": "application/json", "X-Local-Date": localStorage.getItem("donegeon.devDate") ?? new Date().toLocaleDateString("sv") }, body: body && JSON.stringify(body) });
  return res.status === 204 ? null : res.json();
}, [url, method, body]);
const add = async (title, where) => (await api("/tasks", "POST", { title, ...where })).task.id;
const pretend = async (d) => { await p.evaluate((d) => d ? localStorage.setItem("donegeon.devDate", d) : localStorage.removeItem("donegeon.devDate"), d); await p.reload(); await p.waitForSelector('section[aria-label="Today"]'); await wait(); };

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("h2:text-is('Goals')");
const lists = await api("/lists", "GET"); const listId = (lists.lists ?? lists)[0].id;
// Keep the tutorial out of the way.
await api("/auth/me", "PATCH", { tutorialSeen: true });

const ids = {};
for (const name of ["Alpha", "Bravo", "Charlie", "Delta", "Echo"]) ids[name] = await add(name, { listId });
await api(`/tasks/${ids.Alpha}`, "PATCH", { week: true });
// Enough on a day the checks don't use that the week needs scrolling. Taken away again before the next week.
const midweek = (n) => day(-toMonday + n);
const otherToday = today === midweek(2) ? midweek(3) : midweek(2);
const fillDay = [0, 1, 2, 3, 4, 5, 6].map(midweek).find((d) => ![today, other, otherToday].includes(d));
const fillers = [];
for (let i = 1; i <= 10; i++) fillers.push((await api("/tasks", "POST", { title: `Filler ${i}`, weekDay: fillDay })).task.id);
await p.reload(); await p.waitForSelector('section[aria-label="Today"]');

const box = p.locator('section[aria-label="Today"]');
const tab = (name) => box.locator(`[role=tab]:text-is("${name}")`);
const column = (d) => box.locator(`[data-week-day="${d}"]`);
const listRow = (title) => p.locator(`section[data-drop-list] [data-task-row]:has(textarea:text-is("${title}"))`).first();
const nameOf = Object.fromEntries(Object.entries(ids).map(([k, v]) => [v, k]));
const order = async (d) => (await column(d).locator("[data-week-item]").evaluateAll((els) => els.map((el) => el.dataset.weekItem))).map((id) => nameOf[id] ?? id);
const item = (name) => box.locator(`[data-week-item="${ids[name]}"]`);
const drag = async (handle, target, where) => {
  await target.scrollIntoViewIfNeeded(); await handle.scrollIntoViewIfNeeded();
  const h = await handle.boundingBox(); const t = await target.boundingBox();
  const y = where === "before" ? t.y + 2 : where === "after" ? t.y + t.height - 2 : t.y + t.height / 2;
  await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await p.mouse.down();
  await p.mouse.move(t.x + Math.min(60, t.width / 2), y, { steps: 10 }); await p.mouse.up(); await wait(900);
};

// To a day out of sight in the Week tab: held at the top or bottom edge of its scrolling part until the day comes into view.
const area = box.locator("[data-week-scroll]");
const dragAcross = async (handle, target, where) => {
  await handle.scrollIntoViewIfNeeded();
  const h = await handle.boundingBox(); const a = await area.boundingBox();
  await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await p.mouse.down();
  const t0 = await target.boundingBox();
  const up = t0.y < a.y;
  const hidden = up || t0.y + t0.height > a.y + a.height;
  if (hidden) await p.mouse.move(h.x, up ? a.y + 5 : a.y + a.height - 5, { steps: 10 });
  for (let i = 0; hidden && i < 100; i++) {
    const t = await target.boundingBox();
    // Well clear of the edge, where the week would go on scrolling under the pointer.
    if (up ? t.y >= a.y + 80 : t.y + t.height <= a.y + a.height - 80) break;
    await wait(50);
  }
  // Out of the edges first (the handle itself may be near one), so the week stops scrolling, then onto the target
  // where it now is.
  await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2, { steps: 4 }); await wait(200);
  const t = await target.boundingBox();
  await p.mouse.move(t.x + 80, where === "before" ? t.y + 2 : where === "after" ? t.y + t.height - 2 : t.y + t.height / 2, { steps: 10 }); await p.mouse.up(); await wait(900);
};
/** Whether the day's section is at the top of the Week tab's scrolling part, or as near as the scrolling goes. */
const atTop = (d) => area.evaluate((el, d) => {
  const section = el.querySelector(`[data-week-day="${d}"]`);
  return Math.abs(el.scrollTop - Math.min(section.offsetTop, el.scrollHeight - el.clientHeight)) <= 1;
}, d);

out("the box has Today and Week tabs, Today open", await tab("Today").getAttribute("aria-selected") === "true" && await tab("Week").getAttribute("aria-selected") === "false");
await tab("Week").click(); await wait();
const shownDays = await box.locator("[data-week-day]").evaluateAll((els) => els.map((el) => [el.dataset.weekDay, el.offsetLeft, el.offsetTop]));
out("Week has each day, Monday to Sunday, top to bottom, then Next week", shownDays.length === 8 && shownDays[7][0] === day(7 - toMonday) && await box.locator("[data-next-week]").count() === 1 && shownDays[0][0] === monday && shownDays.every(([, x, y], i) => i === 0 || (x === shownDays[0][1] && y > shownDays[i - 1][2])), JSON.stringify(shownDays));
out("the week is taller than the box shows: it scrolls", await area.evaluate((el) => el.scrollHeight > el.clientHeight + 100));
out("…and opens on today", await atTop(today));
out("a task marked for the week is on today", (await order(today)).join() === "Alpha", (await order(today)).join());

// The ⋯ menu's "Do this week".
await listRow("Bravo").locator('[aria-label="Task options"]').first().click(); await wait(300);
await p.locator('[data-menu-part="week"]').click(); await wait();
await p.keyboard.press("Escape"); await wait(300);
out("“Do this week” in the menu puts it last on today", (await order(today)).join() === "Alpha,Bravo", (await order(today)).join());

// Typed into a day: lives there alone.
await column(today).locator(`[data-task-editor="week-add:${today}"]`).fill("Own one"); await p.keyboard.press("Enter"); await wait(900);
const ownRow = box.locator('[data-task-row]:has(textarea:text-is("Own one"))');
out("a task typed into a day shows there, editable", await ownRow.count() === 1);
ids.Own = await ownRow.getAttribute("data-task-row"); nameOf[ids.Own] = "Own";
out("…last on that day", (await order(today)).join() === "Alpha,Bravo,Own", (await order(today)).join());
out("…in no list", await listRow("Own one").count() === 0);

// A list's task dropped on another day, and a row moved between days.
await drag(listRow("Charlie").locator('[aria-label="Drag to move this task"]'), column(other).locator("header"), "middle");
out("a list task dropped on a day comes in on that day", (await order(other)).join() === "Charlie", (await order(other)).join());
out("…and stays in its list", await listRow("Charlie").count() === 1);
await item("Alpha").scrollIntoViewIfNeeded();
await dragAcross(item("Alpha").locator('[aria-label="Drag to reorder the week"]'), item("Charlie").locator("[data-week-row]"), "before");
out("a row dragged onto another day moves there, at the place it was dropped", (await order(other)).join() === "Alpha,Charlie" && (await order(today)).join() === "Bravo,Own", `${await order(other)} | ${await order(today)}`);

// Reordering within a day.
await drag(item("Own").locator('[aria-label="Drag to move this task"]').first(), item("Bravo").locator("[data-week-row]"), "before");
out("dragging a row reorders its day", (await order(today)).join() === "Own,Bravo", (await order(today)).join());
await ownRow.locator("textarea").focus(); await p.keyboard.press("Alt+ArrowDown"); await wait(900);
out("Alt+↓ moves a task typed into Week down its day", (await order(today)).join() === "Bravo,Own", (await order(today)).join());

// Enter in it opens a new row right under it, on the same day.
await ownRow.locator("textarea").focus(); await p.keyboard.press("End"); await p.keyboard.press("Enter"); await wait(300);
await p.keyboard.type("Own two"); await p.keyboard.press("Enter"); await wait(1200); await p.keyboard.press("Escape"); await wait(300);
const own2 = await box.locator('[data-task-row]:has(textarea:text-is("Own two"))').getAttribute("data-task-row").catch(() => null);
if (own2) { nameOf[own2] = "Own2"; ids.Own2 = own2; }
out("Enter in a Week task adds the next one under it, on its day", (await order(today)).join() === "Bravo,Own,Own2", (await order(today)).join());

await p.reload(); await p.waitForSelector('section[aria-label="Today"]'); await wait();
out("opened again after a reload, Week is on today", await atTop(today));
out("days, order and the open tab survive a reload", await tab("Week").getAttribute("aria-selected") === "true" && (await order(today)).join() === "Bravo,Own,Own2" && (await order(other)).join() === "Alpha,Charlie", `${await order(today)} | ${await order(other)}`);

// The ⋯ menu of a task in Week: on the page, under its button, not cut off or stretched by the week's scrolling part.
{
  const dots = ownRow.locator('[aria-label="Task options"]');
  await dots.scrollIntoViewIfNeeded();
  const heightBefore = await area.evaluate((el) => el.scrollHeight);
  await dots.click(); await wait(400);
  const menu = p.locator('[role=dialog][aria-label="Task options"]');
  const under = async () => { const [m, b] = await Promise.all([menu.boundingBox(), dots.boundingBox()]); return Math.abs(m.y - (b.y + b.height + 4)) <= 2 && Math.abs(m.x + m.width - (b.x + b.width)) <= 2; };
  out("the menu opens right under its ⋯", await under());
  out("…on the page, not in the week's scrolling part, which keeps its height", await area.locator("[role=dialog]").count() === 0 && (await area.evaluate((el) => el.scrollHeight)) === heightBefore);
  const m = await menu.boundingBox();
  const corners = await p.evaluate(({ x, y, width, height }) => [[x + 4, y + 4], [x + width - 4, y + 4], [x + 4, y + height - 4], [x + width - 4, y + height - 4]].map(([cx, cy]) => Boolean(document.elementFromPoint(cx, cy)?.closest('[role=dialog][aria-label="Task options"]'))), m);
  out("…wholly visible, every corner of it", corners.every(Boolean), JSON.stringify(corners));
  await area.evaluate((el) => (el.scrollTop = el.scrollTop > 40 ? el.scrollTop - 40 : el.scrollTop + 40)); await wait(300);
  out("…and it stays under its ⋯ as the week scrolls", await under());
  const moved = await menu.boundingBox();
  await p.mouse.click(moved.x + 6, moved.y + 6); await wait(200);
  out("a click in the menu leaves it open", await menu.count() === 1);
  await p.mouse.click(5, 300); await wait(300);
  out("a click outside closes it", await menu.count() === 0);
}

// Ticking, taking out.
await item("Alpha").locator("input[type=checkbox]").first().click(); await wait(1200);
out("a ticked task stays on its day, under the open ones", (await order(other)).join() === "Charlie,Alpha" && await item("Alpha").locator("input[type=checkbox]").first().isChecked(), (await order(other)).join());
await item("Bravo").locator('button[aria-label^="Take"]').click(); await wait(900);
out("× takes it out of Week…", !(await order(today)).includes("Bravo"), (await order(today)).join());
out("…and it stays in its list", await listRow("Bravo").count() === 1);

// Dropping on the Today tab while Week is open.
await drag(listRow("Delta").locator('[aria-label="Drag to move this task"]'), tab("Today"), "middle");
await box.screenshot({ path: "week.png" });
await tab("Today").click(); await wait();
out("a task dropped on the Today tab is in Today", await box.locator(`[data-today-item="${ids.Delta}"]`).count() === 1);
out("Week's own tasks are not in Today", await box.locator('[data-task-row]:has(textarea:text-is("Own one"))').count() === 0);
await box.screenshot({ path: "week-today.png" });
await tab("Week").click(); await wait();

// Each day's count sits at the right, after the heading.
{
  const [h, n, sec] = await Promise.all([column(today).locator("h3").boundingBox(), column(today).locator("[data-day-summary]").boundingBox(), column(today).boundingBox()]);
  out("a day's “to do” count is at the right", n.x > h.x + h.width + 20 && sec.x + sec.width - (n.x + n.width) < 20, JSON.stringify([h, n, sec]));
  out("…and its name in the middle", Math.abs(h.x + h.width / 2 - (sec.x + sec.width / 2)) < 6, `${h.x + h.width / 2} vs ${sec.x + sec.width / 2}`);
}

// Coming into Week by itself: tasks on a schedule, and (if chosen) deadlines.
const auto = (d, id) => column(d).locator(`[data-auto-id="${id}"]`);
const later = [1, 2, 3, 4, 5, 6].map((n) => day(n)).filter((d) => d <= day(6 - toMonday));
const sunday = day(6 - toMonday);
ids.Skip = await add("Weekly skipped", { listId, repeatEvery: 1, repeatUnit: "week", nextDue: day(-toMonday - 14) });
ids.MakeUp = await add("Weekly made up", { listId, repeatEvery: 1, repeatUnit: "week", nextDue: day(-toMonday - 14) });
await api(`/tasks/${ids.MakeUp}`, "PATCH", { repeatMakeUp: true });
ids.Daily = await add("Daily", { listId, repeatEvery: 1, repeatUnit: "day", nextDue: today });
const thursday = day(-toMonday + 3);
ids.Thu = await add("Thursdays", { listId, repeatEvery: 1, repeatUnit: "week", nextDue: day(-toMonday + 3 - 14) });
ids.Due = await add("Report due", { listId, deadlineDate: sunday, deadlineType: "hard" }); nameOf[ids.Due] = "Due";
await p.reload(); await p.waitForSelector('section[aria-label="Today"]'); await wait();
out("a weekly task missed in earlier weeks is on Monday, with a red !", await auto(monday, ids.Skip).locator("[data-missed]").count() === 1 && await auto(monday, ids.Skip).getAttribute("data-week-auto") === "due");
out("…skipping: no count of rounds to make up", await auto(monday, ids.Skip).locator("[data-rounds]").count() === 0);
out("skipping, missed on a Thursday weeks ago: Monday has only a reminder, with a red ! and nothing to press", await auto(monday, ids.Thu).getAttribute("data-week-auto") === "missed" && await auto(monday, ids.Thu).locator("[data-missed]").count() === 1 && await auto(monday, ids.Thu).locator(".repeat-button, input[type=checkbox]").count() === 0);
out("…and it is on its own day this week as ever", await auto(thursday, ids.Thu).getAttribute("data-week-auto") === (thursday <= today ? "due" : "round"), await auto(thursday, ids.Thu).getAttribute("data-week-auto"));
out("…its row in the list is flagged and points at this week's round", await listRow("Thursdays").locator("[data-missed]").count() === 1 && await listRow("Thursdays").locator("[data-next-due]").getAttribute("data-next-due") === thursday);
out("making up: on Monday with a red ! and every missed round to do", await auto(monday, ids.MakeUp).locator("[data-missed]").count() === 1 && await auto(monday, ids.MakeUp).locator("[data-rounds]").getAttribute("data-rounds") === "3", await auto(monday, ids.MakeUp).locator("[data-rounds]").getAttribute("data-rounds").catch(() => "none"));
out("a daily task is due today and greyed on the days still to come", await auto(today, ids.Daily).getAttribute("data-week-auto") === "due" && (await Promise.all(later.map((d) => auto(d, ids.Daily).getAttribute("data-week-auto")))).every((k) => k === "round"), later.join());
out("what came by itself has no × or handle", await auto(monday, ids.Skip).locator('button[aria-label^="Take"], [aria-label="Drag to reorder the week"]').count() === 0);
out("deadlines stay out while they don't come into Today (the default)", await box.locator(`[data-auto-id="${ids.Due}"]`).count() === 0);
await api("/auth/me", "PATCH", { deadlineToday: "day" }); await p.reload(); await p.waitForSelector('section[aria-label="Today"]'); await wait();
out("with deadlines coming into Today, one is on its day in Week", await auto(sunday, ids.Due).getAttribute("data-week-auto") === "deadline");
await dragAcross(auto(sunday, ids.Due).locator('[aria-label="Drag to reorder the week"]'), column(other).locator("header"), "middle");
out("a deadline's row dragged to another day is planned there", (await order(other)).includes("Due") && await auto(sunday, ids.Due).count() === 0, (await order(other)).join());

// A round of a task on a schedule moved: to Sunday, then to next week, then back from the menu.
const bucket = box.locator("[data-next-week]");
const thuRound = () => box.locator(`[data-auto-id="${ids.Thu}"]:not([data-week-auto="missed"])`);
if (thursday !== sunday) {
  await dragAcross(auto(thursday, ids.Thu).locator('[aria-label="Drag this round to another day"]'), column(sunday).locator("header"), "middle");
  const where = await box.locator(`[data-auto-id="${ids.Thu}"]`).evaluateAll((els) => els.map((el) => `${el.closest("[data-week-day]").dataset.weekDay}:${el.dataset.weekAuto}`).join());
  out("a round dragged to another day is done there instead", await auto(sunday, ids.Thu).count() === 1 && await auto(thursday, ids.Thu).count() === 0 && await auto(monday, ids.Thu).getAttribute("data-week-auto") === "missed", where);
}
await dragAcross(thuRound().locator('[aria-label="Drag this round to another day"]'), bucket.locator("header"), "middle");
out("…and dragged into Next week it is put off there", await bucket.locator(`[data-auto-id="${ids.Thu}"]`).count() === 1 && await column(sunday).locator(`[data-auto-id="${ids.Thu}"]`).count() === 0);
const thuMoves = (await api("/tasks", "GET")).tasks.find((t) => t.id === ids.Thu).roundMoves;
out("…only that round: the schedule keeps its planned days", JSON.stringify(thuMoves) === JSON.stringify({ [thursday]: day(7 - toMonday) }), JSON.stringify(thuMoves));
await listRow("Thursdays").locator('[aria-label="Task options"]').first().click(); await wait(300);
out("the menu says this round is put off to next week", await p.locator('[data-menu-part="next-week"] input').isChecked());
await p.locator('[data-menu-part="next-week"]').click(); await wait(800); await p.keyboard.press("Escape"); await wait(300);
out("…unticking it brings the round back to its own day", await auto(thursday, ids.Thu).count() === 1 && await bucket.locator(`[data-auto-id="${ids.Thu}"]`).count() === 0);
await api("/auth/me", "PATCH", { deadlineToday: "never" });
await auto(monday, ids.MakeUp).scrollIntoViewIfNeeded(); await auto(monday, ids.MakeUp).locator(".repeat-button").click(); await wait(1200);
out("making up: a press does one round, the rest still to do", await auto(monday, ids.MakeUp).locator("[data-rounds]").getAttribute("data-rounds") === "2");
await auto(monday, ids.Skip).scrollIntoViewIfNeeded(); await auto(monday, ids.Skip).locator(".repeat-button").click(); await wait(1200);
out("skipping: one press and it waits for its next planned day", await box.locator(`[data-auto-id="${ids.Skip}"][data-week-auto="due"]`).count() === 0);
for (const id of [ids.Skip, ids.MakeUp, ids.Daily, ids.Due, ids.Thu]) await api(`/tasks/${id}`, "DELETE");
await p.reload(); await p.waitForSelector('section[aria-label="Today"]'); await wait();

// Put off to next week: from the menu, and typed into the bucket.
await listRow("Echo").locator('[aria-label="Task options"]').first().click(); await wait(300);
await p.locator('[data-menu-part="next-week"]').click(); await wait(800); await p.keyboard.press("Escape"); await wait(300);
const nextWeek = day(7 - toMonday);
out("“Do next week” in the menu puts it in Next week", (await order(nextWeek)).join() === "Echo" && !(await order(today)).includes("Echo"), (await order(nextWeek)).join());
const leftBefore = await box.locator("header").first().innerText();
await area.evaluate((el) => (el.scrollTop = el.scrollHeight)); await wait(200);
await bucket.locator(`[data-task-editor="week-add:${nextWeek}"]`).fill("Later one"); await p.keyboard.press("Enter"); await wait(900);
ids.Later = await box.locator('[data-task-row]:has(textarea:text-is("Later one"))').getAttribute("data-task-row"); nameOf[ids.Later] = "Later";
out("a task typed into Next week lives there", (await order(nextWeek)).join() === "Echo,Later", (await order(nextWeek)).join());
out("…and isn't counted as left this week", (await box.locator("header").first().innerText()) === leftBefore, `${leftBefore} / ${await box.locator("header").first().innerText()}`);

// The box copied to a folder by dropping its tab button on the folder's tab.
const folder = (await api("/folders", "POST", { name: "Planning" })).folder ?? (await api("/folders", "GET")).folders?.find((f) => f.name === "Planning");
await p.reload(); await p.waitForSelector(`[data-tab-drop="${folder.id}"]`); await wait();
{
  const handle = p.locator('[data-tile="today"] [aria-label="Drag to move Today"]');
  await handle.scrollIntoViewIfNeeded();
  const h = await handle.boundingBox(); const t = await p.locator(`[data-tab-drop="${folder.id}"]`).boundingBox();
  await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await p.mouse.down();
  await p.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 15 }); await wait(200); await p.mouse.up(); await wait(900);
}
const folders = await api("/folders", "GET");
out("the Today box dropped on a folder's tab is shown by that folder", ((folders.folders ?? folders).find((f) => f.id === folder.id)?.views ?? []).includes("box:today"), JSON.stringify(folders));
await p.goto(`http://localhost:5173/folders/${folder.id}`); await p.waitForSelector('section[aria-label="Today"]'); await wait();
out("…and is on the folder's page, Week and all", await p.locator('section[aria-label="Today"] [data-week-day]').count() === 8 && await item("Own").count() === 1);
out("…while the Tasks page keeps its own", await (async () => { await p.goto("http://localhost:5173/"); await p.waitForSelector('section[aria-label="Today"]'); return p.locator('[data-tile="today"]').count(); })() === 1);

// Another day of the week: Week opens on that one.
await pretend(otherToday);
out(`on ${otherToday}, Week opens on that day`, await atTop(otherToday));

// A new week.
for (const id of fillers) await api(`/tasks/${id}`, "DELETE");
await pretend(nextMonday);
const all = async () => (await Promise.all([0, 1, 2, 3, 4, 5, 6].map((n) => { const d = new Date(nextMonday); d.setDate(d.getDate() + n); return order(sv(d)); }))).flat();
out("on Monday the ticked one is gone", !(await all()).includes("Alpha"), (await all()).join());
out("…everything still open is on the new Monday, what was put off to it too", (await order(nextMonday)).sort().join() === "Charlie,Echo,Later,Own,Own2", (await order(nextMonday)).join());
out("…a list's task with “carried over 1 week”", await item("Charlie").locator("[data-carried]").getAttribute("data-carried") === "1");
await pretend(null);

const refused = await api(`/tasks/${ids.Own}`, "PATCH", { week: false });
out("a task living only in Week can't be taken out of it", /only lives in Week/.test(refused?.error ?? JSON.stringify(refused)), JSON.stringify(refused));

await b.close();
