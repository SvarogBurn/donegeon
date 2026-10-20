import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 500) => p.waitForTimeout(ms);
const boxes = () => p.locator("main section.tile-frame, section.tile-frame").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")).join(","));
const hiddenRow = p.locator('[aria-label="Hidden boxes"]');

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', "uitest" + Date.now()); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("section[data-drop-list]"); await wait();
// The tutorial shows every box; a test account has seen it.
await p.evaluate(() => fetch("/api/auth/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tutorialSeen: true }) }));
await p.goto("http://localhost:5173/user"); await p.waitForSelector("[data-cheatsheet]"); await wait();
const before = await boxes();
out("the user page shows every box", before === "Character,Account,Settings,Send mail to devs,Cheat sheet", before);
out("every box has a hide button and a drag tab", (await p.locator('[aria-label^="Hide "]').count()) === 5 && (await p.locator(".tile-button-tab").count()) === 5);
out("no Hidden row while nothing is hidden", (await hiddenRow.count()) === 0);
const charButtons = await p.locator("[data-character] .tile-band button").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? el.textContent.trim()).join(","));
out("on the Character box they sit before Edit", charButtons === "Drag to move Character,Hide Character,Edit", charButtons);

await p.click('[aria-label="Hide Settings"]'); await wait();
await p.click('[aria-label="Hide Cheat sheet"]'); await wait();
out("hidden boxes leave the page", (await boxes()) === "Character,Account,Send mail to devs", await boxes());
out("the Hidden row offers them", (await hiddenRow.innerText()).includes("Settings") && (await hiddenRow.innerText()).includes("Cheat sheet"));
await p.screenshot({ path: "userhide.png", fullPage: true });

await p.reload(); await p.waitForSelector('[aria-label="Hidden boxes"]'); await wait();
out("still hidden after a reload", (await boxes()) === "Character,Account,Send mail to devs", await boxes());

await p.goto("http://localhost:5173/user#shortcuts"); await p.waitForSelector("[data-cheatsheet]"); await wait();
out("the All shortcuts link shows the cheat sheet even when hidden", await p.locator("[data-cheatsheet]").isVisible());

await p.goto("http://localhost:5173/user"); await p.waitForSelector('[aria-label="Hidden boxes"]'); await wait();
await hiddenRow.getByRole("button", { name: "Settings" }).click(); await wait();
out("brought back in its place", (await boxes()) === "Character,Account,Settings,Send mail to devs", await boxes());
await p.reload(); await p.waitForSelector("[data-character]"); await wait();
out("kept after a reload", (await boxes()) === "Character,Account,Settings,Send mail to devs", await boxes());

// Settings dragged up onto Character takes its place; the order is kept with the account.
const handle = await p.locator('section[aria-label="Settings"] .tile-button-tab').boundingBox();
await p.mouse.move(handle.x + 5, handle.y + 5); await p.mouse.down(); await p.mouse.move(handle.x + 9, handle.y + 9);
const to = await p.locator('section[aria-label="Character"]').boundingBox();
await p.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 8 });
const marked = await p.locator("[data-box][data-drop]").evaluateAll((els) => els.map((el) => `${el.dataset.box} ${el.dataset.drop}`).join());
await p.mouse.up(); await wait(800);
out("dragging Settings onto Character marks it above, and puts Settings first", marked === "character above" && (await boxes()) === "Settings,Character,Account,Send mail to devs", `${marked} / ${await boxes()}`);
out("the New folder tab doesn't come out for it", (await p.locator("html[data-dragging-list]").count()) === 0);
await p.reload(); await p.waitForSelector("[data-character]"); await wait();
out("the new order is kept after a reload", (await boxes()) === "Settings,Character,Account,Send mail to devs", await boxes());

await p.click('[aria-label="Hide Account"]'); await wait();
await p.locator("[data-start-tutorial]").click(); await wait();
await p.goto("http://localhost:5173/user"); await p.waitForSelector("[data-character]"); await wait(800);
out("while the tutorial runs, hidden boxes show", await p.locator('section[aria-label="Account"]').isVisible() && await p.locator("[data-cheatsheet]").isVisible());
await b.close();
