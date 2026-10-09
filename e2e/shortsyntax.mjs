import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 1400 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
console.log("USER", user);
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 600) => p.waitForTimeout(ms);
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`; };
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const row = (title) => p.locator(`[data-task-row]:has(textarea:text-is("${title}"))`).first();
const today = p.locator('section[aria-label="Today"]');
const inToday = (title) => today.locator(`[data-today-item]:has-text("${title}")`).count();
const add = (i) => p.locator('[data-tile^="list:"] [data-task-editor^="add:"]').nth(i);
const options = () => p.locator("[data-syntax-options] [role=option]").evaluateAll((els) => els.map((el) => el.firstElementChild.textContent).join(","));
const chips = () => p.locator("[data-syntax-chip]").evaluateAll((els) => els.map((el) => el.textContent).join(","));
const deadline = async (title) => { const pill = row(title).locator('[title^="Hard deadline"], [title^="Soft deadline"]'); return (await pill.count()) ? `${(await pill.getAttribute("title")).slice(0, 4)} ${await pill.innerText()}` : "none"; };
const type = async (field, text) => { await field.click(); await p.keyboard.type(text); await wait(200); };
const expandAll = async () => { while (await p.evaluate(() => { const closed = [...document.querySelectorAll('[aria-label="Expand subtasks"]:enabled')]; closed.forEach((b) => b.click()); return closed.length; })) await p.waitForTimeout(50); };

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("h2:text-is('Goals')");
await p.fill('[aria-label="New tag name"]', "home"); await p.keyboard.press("Enter"); await wait();
await p.fill('[aria-label="New list name"]', "Chores"); await p.keyboard.press("Enter"); await wait();

// The dropdown and the chips, before anything is added.
await type(add(0), "Sweep #");
out("typing # offers the tags there are", await options() === "#home", await options());
await p.keyboard.type("ho"); await wait(200);
out("... narrowed as it is typed, with making a new one", await options() === "#home,#ho", await options());
await p.keyboard.press("Enter"); await wait(200);
out("Enter picks from the dropdown instead of adding the task", await add(0).inputValue() === "Sweep #home " && await p.locator("[data-task-row]").count() === 0, await add(0).inputValue());
out("the chips say what the task will get", await chips() === "#home", await chips());
await p.keyboard.type("@to"); await wait(200);
out("typing @ offers days", await options() === "@today,@tomorrow", await options());
await p.keyboard.press("ArrowDown"); await p.keyboard.press("Tab"); await wait(200);
out("arrows move in the dropdown, Tab picks", await add(0).inputValue() === "Sweep #home @tomorrow ", await add(0).inputValue());
await p.keyboard.type("#"); await wait(200); const wasOpen = await p.locator("[data-syntax-options]").count(); await p.keyboard.press("Escape"); await wait(200);
out("Esc closes the dropdown and keeps the text", wasOpen === 1 && await p.locator("[data-syntax-options]").count() === 0 && await add(0).inputValue() === "Sweep #home @tomorrow #", await add(0).inputValue());
await p.keyboard.press("Backspace"); await p.keyboard.type("^Clean 5p"); await wait(200);
out("chips for a tag, a hard deadline, a new goal and points", (await chips()).replace(/hard \w+ /, "hard ") === `#home,hard ${day(1)},^Clean (new),5 pts`, await chips());
await p.keyboard.press("Enter"); await wait(900);
out("the task is added with a clean title", await row("Sweep").count() === 1 && await add(0).inputValue() === "", await p.locator("[data-task-row] textarea").evaluateAll((els) => els.map((el) => el.value).join(",")));
out("... with its tag and its new goal", await row("Sweep").locator('[title="Tag: home"]').count() === 1 && await row("Sweep").locator('[title="Goal: Clean"]').count() === 1);
out("... a hard deadline tomorrow", await deadline("Sweep") === `Hard ${day(1)}`, await deadline("Sweep"));
out("... and 5 points", (await row("Sweep").locator("[data-value-chip]").innerText()).includes("5"), await row("Sweep").locator("[data-value-chip]").innerText());
out("the new goal is in the Goals box", await p.locator('[aria-label="Goals"] li:has-text("Clean")').count() === 1);

await type(add(0), "Call bank ~in 3 days @today"); await p.keyboard.press("Enter"); await wait(900);
out("~ is a soft deadline, @today puts it in Today", await deadline("Call bank") === `Soft ${day(3)}` && await inToday("Call bank") === 1 && await row("Call bank").getAttribute("data-today") === "", `${await deadline("Call bank")} today:${await inToday("Call bank")}`);

await type(add(0), "Vacuum @every 2 weeks"); await p.keyboard.press("Enter"); await wait(900);
out("@every makes a task on a schedule, due today", await row("Vacuum").locator("[data-next-due]").getAttribute("data-next-due") === iso(0) && await row("Vacuum").locator("[data-next-due]").getAttribute("title") === "Repeats every 2 weeks");

await type(add(0), "Milk /cho"); await wait(200);
out("typing / offers the lists", (await options()).startsWith("/Chores"), await options());
await p.keyboard.press("Enter"); await p.keyboard.press("Enter"); await wait(900);
out("/list puts the task in that list", await p.locator('[data-tile^="list:"]').nth(1).locator('[data-task-row]:has(textarea:text-is("Milk"))').count() === 1 && await p.locator('[data-tile^="list:"]').nth(0).locator('[data-task-row]:has(textarea:text-is("Milk"))').count() === 0);

for (const title of ["Fix bug #123", "mail bob@example.com", "this and/or that", "Read \\#home sign"]) { await type(add(0), title); await p.keyboard.press("Enter"); await wait(700); }
out("what only looks like a shortcut stays in the title", await row("Fix bug #123").count() === 1 && await row("mail bob@example.com").count() === 1 && await row("this and/or that").count() === 1);
out("a backslash keeps a shortcut as text", await row("Read #home sign").count() === 1 && await row("Read #home sign").locator('[title="Tag: home"]').count() === 0);

await type(add(0), "#home"); await p.keyboard.press("Enter"); await wait(900);
out("shortcuts alone are not a task", await p.locator("text=A task needs a title too").count() === 1 && await add(0).inputValue() === "#home", await add(0).inputValue());
await add(0).fill(""); await p.keyboard.press("Escape");

// The row opened by Ctrl+Enter: a subtask can have a deadline, one below it can't.
await row("Sweep").locator("textarea").focus(); await p.keyboard.press("Control+Enter"); await p.keyboard.type("Corners ~tomorrow"); await p.keyboard.press("Control+Enter"); await wait(900);
await p.keyboard.type("Dust @tomorrow #home"); await wait(200);
out("deeper down, a deadline is not offered as a chip", await chips() === "#home", await chips());
await p.keyboard.press("Enter"); await wait(900); await p.keyboard.press("Escape"); await wait(300); await expandAll();
out("a direct subtask gets its deadline", await deadline("Corners") === `Soft ${day(1)}`, await deadline("Corners"));
out("one below keeps the words and still gets its tag", await row("Dust @tomorrow").count() === 1 && await row("Dust @tomorrow").locator('[title="Tag: home"]').count() === 1);

// A task written into Today.
await type(p.locator('[data-task-editor="today-add"]'), "Stretch 3p #new"); await p.keyboard.press("Enter"); await wait(900);
out("the Today box reads shortcuts too, and makes the new tag", await today.locator('textarea:text-is("Stretch")').count() === 1 && await today.locator('[title="Tag: new"]').count() === 1 && await p.locator('[aria-label="Tags"] li:has-text("new")').count() === 1);

await p.reload(); await p.waitForSelector("[data-task-row]"); await wait();
out("all of it is there after a reload", await deadline("Sweep") === `Hard ${day(1)}` && await row("Sweep").locator('[title="Goal: Clean"]').count() === 1 && await inToday("Call bank") === 1);

// The cheat sheet.
await type(add(0), "x #"); await p.locator('[data-syntax-options] a:text-is("All shortcuts")').click(); await wait();
out("the dropdown's link goes to the cheat sheet on the user page", p.url().endsWith("/user#shortcuts") && await p.locator("[data-cheatsheet]").isVisible());
const boxes = await p.locator("main section, section").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")).filter(Boolean).join(","));
out("it sits under the mail box", boxes.includes("Cheat sheet") && boxes.indexOf("Cheat sheet") > boxes.indexOf("Settings"), boxes);
out("it lists every shortcut", await p.locator("[data-syntax-help] li").count() === 9 && await p.locator('[data-syntax-help] kbd:text-is("~date")').count() === 1);
await p.screenshot({ path: "shortsyntax-cheatsheet.png", fullPage: true });
await p.setViewportSize({ width: 390, height: 800 }); await wait(300);
out("phone width: no sideways scroll", await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
await p.screenshot({ path: "shortsyntax-phone.png", fullPage: true });
await p.setViewportSize({ width: 1200, height: 1400 }); await p.goto("http://localhost:5173/"); await p.waitForSelector("[data-task-row]");
await type(add(0), "Plan trip @"); await wait(300);
await p.screenshot({ path: "shortsyntax.png", fullPage: true });
await b.close();
