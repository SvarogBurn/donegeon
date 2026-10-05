import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 1100 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 500) => p.waitForTimeout(ms);
const card = (name) => p.locator(`section[data-drop-list]:has(input[aria-label="List name"][value="${name}"])`);
const color = (name) => card(name).getAttribute("data-list-color");
const frame = (name) => card(name).evaluate((el) => getComputedStyle(el).borderImageSource);
const track = (name) => card(name).locator(".kind-switch").evaluate((el) => getComputedStyle(el).backgroundImage);
const titleColor = (name) => card(name).locator(".tile-band").evaluate((el) => getComputedStyle(el).color);
// What the recoloured art really holds: the picked colour, and none of the original blue.
const art = (url) => p.evaluate(async (url) => (await (await fetch(url.slice(5, -2))).text()).toLowerCase(), url);
const pick = async (name, swatch) => { await card(name).locator('button[aria-label="List colour"]').click(); await card(name).locator(`[role=dialog] button[aria-label="${swatch}"]`).click(); await wait(); await p.keyboard.press("Escape"); await wait(200); };

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', "uitest" + Date.now()); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("section[data-drop-list]"); await wait();
await p.fill('[aria-label="New list name"]', "Treats"); await p.locator('form [aria-label="Reward list"]').click(); await p.locator('[aria-label="New list name"]').press("Enter"); await wait(800);

const blueFrame = await frame("List"), orangeFrame = await frame("Treats");
out("to start with: task lists blue, reward lists orange", await color("List") === "#5b6ee1" && await color("Treats") === "#df7126" && blueFrame !== orangeFrame, `${await color("List")} ${await color("Treats")}`);

await pick("List", "Green");
const greenFrame = await frame("List"), greenTrack = await track("List");
out("a picked colour recolours the box's band", await color("List") === "#37946e" && greenFrame !== blueFrame && (await art(greenFrame)).includes("#37946e") && !(await art(greenFrame)).includes("#5b6ee1"));
out("and the switch's track", (await art(greenTrack)).includes("#37946e") && !(await art(greenTrack)).includes("#5b6ee1"));
out("the other list keeps its own", await frame("Treats") === orangeFrame);
out("title stays white on a dark colour", await titleColor("List") === "rgb(255, 255, 255)", await titleColor("List"));
await pick("List", "Yellow");
out("title turns dark on a light colour", await titleColor("List") === "rgb(34, 32, 52)", await titleColor("List"));

await p.reload(); await p.waitForSelector("section[data-drop-list]"); await wait();
out("the colour is kept after a reload", await color("List") === "#e0b000", await color("List"));

// Any other colour, from the browser's picker.
await card("Treats").locator('button[aria-label="List colour"]').click();
await card("Treats").locator('input[type="color"]').fill("#123456"); await wait(); await p.keyboard.press("Escape"); await wait(200);
out("any other colour can be picked", await color("Treats") === "#123456" && (await art(await frame("Treats"))).includes("#123456"), await color("Treats"));
await card("Treats").locator('[aria-label="Reward list"]').click(); await wait();
out("a picked colour stays when the kind changes", await color("Treats") === "#123456", await color("Treats"));
await card("Treats").locator('button[aria-label="List colour"]').click();
await card("Treats").locator('[role=dialog] button:has-text("Back to blue")').click(); await wait(); await p.keyboard.press("Escape"); await wait(200);
out("back to the kind's own colour", await color("Treats") === "#5b6ee1" && (await art(await frame("Treats"))).includes("#5b6ee1"), await color("Treats"));
await card("Treats").locator('[aria-label="Reward list"]').click(); await wait();
out("which follows the kind again", await color("Treats") === "#df7126" && (await art(await frame("Treats"))).includes("#df7126"), await color("Treats"));
await pick("Treats", "Purple");
await card("List").locator('button[aria-label="List colour"]').click(); await wait(300);
await p.screenshot({ path: "colors.png" });
await b.close();
