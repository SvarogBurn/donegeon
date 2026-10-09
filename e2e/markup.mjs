import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 1400 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
console.log("USER", user);
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 600) => p.waitForTimeout(ms);
const add = () => p.locator('[data-tile^="list:"] [data-task-editor^="add:"]').first();
const field = (n) => p.locator("[data-task-row] textarea").nth(n);
const row = (n) => p.locator("[data-task-row]").nth(n);
const styled = (n) => row(n).locator("[data-styled-title]").evaluate((el) => el.innerHTML.replace(/ class="[^"]*"/g, "").trim()).catch(() => "none");
const today = p.locator('section[aria-label="Today"]');

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("h2:text-is('Goals')");
for (const t of ["Pay **rent** *now* @today", "__under__ ==mark== ~~gone~~", "**a *b* c**", "5 * 3 * 2 and snake_case", "plain"]) { await add().click(); await p.keyboard.type(t); await p.keyboard.press("Enter"); await wait(700); }
await p.locator("h2:text-is('Goals')").click(); await wait(300);

out("bold and italic are shown styled, the markers hidden", await styled(0) === "Pay <b>rent</b> <i>now</i>", await styled(0));
out("the title itself keeps its markers", await field(0).inputValue() === "Pay **rent** *now*");
out("underline, highlight and crossed out", await styled(1) === "<u>under</u> <mark>mark</mark> <s>gone</s>", await styled(1));
out("one style inside another", await styled(2) === "<b>a <i>b</i> c</b>", await styled(2));
out("what is not markup is left as typed", await styled(3) === "none" && await styled(4) === "none" && await field(3).inputValue() === "5 * 3 * 2 and snake_case");
out("the styled words are really bold", await row(0).locator("[data-styled-title] b").evaluate((el) => Number(getComputedStyle(el).fontWeight) >= 600));
out("the Today box shows it styled too", await today.locator("[data-today-item] b:text-is('rent')").count() === 1 && await today.locator("text=**").count() === 0);
out("labels are said in plain words", await row(0).locator('[aria-label=\'Mark "Pay rent now" done\']').count() === 1);

await field(0).click(); await wait(200);
out("while typing in it the markers are back", await styled(0) === "none" && await field(0).evaluate((el) => getComputedStyle(el).color !== "rgba(0, 0, 0, 0)"));
await p.locator("h2:text-is('Goals')").click(); await wait(200);

// The keys, on the plain task.
await field(4).click(); await p.keyboard.press("Control+a"); await p.keyboard.press("Control+b"); await wait(200);
out("Ctrl+B puts bold around the selection", await field(4).inputValue() === "**plain**", await field(4).inputValue());
await p.keyboard.press("Control+i"); await wait(200);
out("Ctrl+I on the same words: italic inside it", await field(4).inputValue() === "***plain***", await field(4).inputValue());
await p.keyboard.press("Control+i"); await p.keyboard.press("Control+b"); await wait(200);
out("the same keys take them off again", await field(4).inputValue() === "plain", await field(4).inputValue());
await p.keyboard.press("Control+u"); await p.locator("h2:text-is('Goals')").click(); await wait(800);
out("Ctrl+U underlines, saved when the title is left", await styled(4) === "<u>plain</u>", await styled(4));
await p.reload(); await p.waitForSelector("[data-task-row]"); await wait();
out("all of it is there after a reload", await styled(0) === "Pay <b>rent</b> <i>now</i>" && await styled(4) === "<u>plain</u>");
await p.screenshot({ path: "markup.png", fullPage: true });

await p.goto("http://localhost:5173/user"); await p.waitForSelector("[data-cheatsheet]");
out("the cheat sheet shows each style as it looks", await p.locator("[data-markup-help] li").count() === 5 && await p.locator("[data-markup-help] mark:text-is('highlight')").count() === 1 && await p.locator("[data-markup-help] u:text-is('underline')").count() === 1);
await p.locator("[data-cheatsheet]").screenshot({ path: "markup-cheatsheet.png" });
await b.close();
