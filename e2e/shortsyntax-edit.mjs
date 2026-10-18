import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 1400 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
console.log("USER", user);
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 600) => p.waitForTimeout(ms);
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`; };
const row = (title) => p.locator(`[data-task-row]:has(textarea:text-is("${title}"))`).first();
const field = (title) => row(title).locator("textarea");
const today = p.locator('section[aria-label="Today"]');
const inToday = (title) => today.locator(`[data-today-item]:has-text("${title}")`).count();
const add = (i) => p.locator('[data-tile^="list:"] [data-task-editor^="add:"]').nth(i);
const options = () => p.locator("[data-syntax-options] [role=option]").evaluateAll((els) => els.map((el) => el.firstElementChild.textContent).join(","));
const chips = () => p.locator("[data-syntax-chip]").evaluateAll((els) => els.map((el) => el.textContent).join(","));
const deadline = async (title) => { const pill = row(title).locator('[title^="Hard deadline"], [title^="Soft deadline"]'); return (await pill.count()) ? `${(await pill.getAttribute("title")).slice(0, 4)} ${await pill.innerText()}` : "none"; };
const addTask = async (text) => { await add(0).click(); await p.keyboard.type(text); await p.keyboard.press("Enter"); await wait(900); };
// Clicks into an existing title with the caret at its end, then types.
const typeInto = async (title, text) => { await field(title).focus(); await p.keyboard.press("End"); await p.keyboard.type(text); await wait(200); };

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("h2:text-is('Goals')");
await p.fill('[aria-label="New tag name"]', "home"); await p.keyboard.press("Enter"); await wait();
await p.fill('[aria-label="New list name"]', "Chores"); await p.keyboard.press("Enter"); await wait();
await addTask("Sweep");
await addTask("Read \\#home sign");

// The dropdown and the chips in a title that exists.
await typeInto("Sweep", " #");
out("typing # in an existing title offers the tags", await options() === "#home", await options());
await p.keyboard.press("Enter"); await wait(200);
out("Enter picks from the dropdown instead of saving", await row("Sweep").count() === 0 && await p.locator('textarea:text-is("Sweep #home ")').count() === 1);
await p.keyboard.type("@tomorrow 5p ^Clean"); await wait(200);
out("the chips say what the task will get", (await chips()).replace(/hard [^,]+/, "hard") === "#home,hard,5 pts,^Clean (new)", await chips());
await p.keyboard.press("Enter"); await wait(900); await p.keyboard.press("Escape"); await wait(300);
out("the title is saved without its shortcuts", await row("Sweep").count() === 1, await p.locator("[data-task-row] textarea").evaluateAll((els) => els.map((el) => el.value).join(",")));
out("... with the tag and the new goal", await row("Sweep").locator('[title="Tag: home"]').count() === 1 && await row("Sweep").locator('[title="Goal: Clean"]').count() === 1);
out("... a hard deadline tomorrow", await deadline("Sweep") === `Hard ${day(1)}`, await deadline("Sweep"));
out("... and 5 points", (await row("Sweep").locator("[data-value-chip]").innerText()).includes("5"), await row("Sweep").locator("[data-value-chip]").innerText());

// Labels it had already stay.
await typeInto("Sweep", " #extra"); await field("Sweep #extra").blur(); await wait(900);
out("a tag added later joins the ones it has", await row("Sweep").locator('[title="Tag: home"]').count() === 1 && await row("Sweep").locator('[title="Tag: extra"]').count() === 1);

await typeInto("Sweep", " @today ~in 3 days"); await field("Sweep @today ~in 3 days").blur(); await wait(900);
out("@today puts it in Today, ~ makes the deadline a soft one", await inToday("Sweep") === 1 && await deadline("Sweep") === `Soft ${day(3)}`, `${await deadline("Sweep")} today:${await inToday("Sweep")}`);

await typeInto("Sweep", " // under the bed"); await field("Sweep // under the bed").blur(); await wait(900);
out("// gives it a note", await row("Sweep").locator('.notes-button:not([data-empty])').count() === 1);

await typeInto("Sweep", " /Chores"); await field("Sweep /Chores").blur(); await wait(900);
out("/list moves it to that list", await p.locator('[data-tile^="list:"]').nth(1).locator('[data-task-row]:has(textarea:text-is("Sweep"))').count() === 1 && await p.locator('[data-tile^="list:"]').nth(0).locator('[data-task-row]:has(textarea:text-is("Sweep"))').count() === 0);

// What stood in the title already stays text.
out("an old title that reads as a shortcut shows no chips", await row("Read #home sign").locator("[data-syntax-chip]").count() === 0);
await typeInto("Read #home sign", "s"); await field("Read #home signs").blur(); await wait(900);
out("... and editing it keeps that text and adds no tag", await row("Read #home signs").count() === 1 && await row("Read #home signs").locator('[title="Tag: home"]').count() === 0);

await typeInto("Read #home signs", " @every 2 weeks"); await field("Read #home signs @every 2 weeks").blur(); await wait(900);
out("@every puts it on a schedule", await row("Read #home signs").locator("[data-next-due]").getAttribute("title") === "Repeats every 2 weeks");

// A plain rename still works as before.
await field("Read #home signs").fill("Read signs"); await field("Read signs").blur(); await wait(900);
out("a plain rename is saved", await row("Read signs").count() === 1);

await p.reload(); await p.waitForSelector("[data-task-row]"); await wait();
out("all of it is there after a reload", await deadline("Sweep") === `Soft ${day(3)}` && await row("Sweep").locator('[title="Goal: Clean"]').count() === 1 && await inToday("Sweep") === 1);
await b.close();
