import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 500) => p.waitForTimeout(ms);
const keys = () => p.locator("[data-tile]").evaluateAll((els) => els.map((e) => e.dataset.tile.replace(/^list:.*/, "list")).join(","));
const hiddenRow = p.locator('[aria-label="Hidden boxes"]');

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', "uitest" + Date.now()); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("section[data-drop-list]"); await wait();
const before = await keys();
out("a new account shows goals, today, a list, new list, tags, done", before === "goals,today,list,newList,tags,done", before);
out("no Hidden row while nothing is hidden", (await hiddenRow.count()) === 0);
out("every box has a hide button, the list too", (await p.locator('[aria-label^="Hide "]').count()) === 6 && (await p.locator('[data-tile^="list:"] [aria-label^="Hide "]').count()) === 1);
const bandButtons = await p.locator('[data-tile^="list:"] .tile-band button').evaluateAll((els) => els.map((el) => el.getAttribute("aria-label").split(" ")[0]).join(","));
out("on a list it sits after the move button and before the delete button", bandButtons === "Pin,Drag,Hide,Delete", bandButtons);

await p.click('[aria-label="Hide Tags"]'); await wait();
await p.click('[aria-label="Hide Today"]'); await wait();
out("hidden boxes leave the page", (await keys()) === "goals,list,newList,done", await keys());
out("and are offered in the Hidden row", (await hiddenRow.innerText()).replace(/\s+/g, " ") === "Hidden: Today Tags", await hiddenRow.innerText());

await p.reload(); await p.waitForSelector("section[data-drop-list]"); await wait();
out("still hidden after a reload", (await keys()) === "goals,list,newList,done", await keys());

await hiddenRow.locator('button:text-is("Today")').click(); await wait();
out("brought back where it was", (await keys()) === "goals,today,list,newList,done", await keys());
await hiddenRow.locator('button:text-is("Tags")').click(); await wait();
out("all back: same order as before, Hidden row gone", (await keys()) === before && (await hiddenRow.count()) === 0, await keys());

await p.click('[aria-label="Hide the new-list field"]'); await wait();
out("the new-list box can be hidden too, under a readable name", (await hiddenRow.innerText()).includes("New list"), await hiddenRow.innerText());

// Lists.
await p.locator('[data-task-editor^="add:"]').first().click(); await p.keyboard.type("Sweep"); await p.keyboard.press("Enter"); await wait(); await p.keyboard.press("Escape");
await p.click('[aria-label=\'Hide list "List"\']'); await wait();
out("a list can be hidden: offered under its name", (await keys()) === "goals,today,tags,done" && (await hiddenRow.innerText()).replace(/\s+/g, " ") === "Hidden: List New list", `${await keys()} / ${await hiddenRow.innerText()}`);
await p.reload(); await p.waitForSelector('[aria-label="Hidden boxes"]'); await wait();
out("still hidden after a reload", (await keys()) === "goals,today,tags,done", await keys());
await hiddenRow.locator('button:text-is("List")').click(); await wait();
out("brought back where it was, with its tasks", (await keys()) === "goals,today,list,tags,done" && (await p.locator('[data-task-row]:has(textarea:text-is("Sweep"))').count()) === 1, await keys());
await b.close();
