import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 1400 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 400 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
console.log("USER", user);
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 450) => p.waitForTimeout(ms);
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const api = (path, method, body) => p.evaluate(async ([path, method, body, date]) => {
  const r = await fetch("/api" + path, { method, headers: { "Content-Type": "application/json", "X-Local-Date": date }, body: body && JSON.stringify(body) });
  return r.status === 204 ? null : r.json();
}, [path, method, body, day(0)]);
const sheet = 'section[aria-label="Character"]';
const attr = (sel, name) => p.locator(sel).first().getAttribute(name);
const openUser = async () => { await p.goto("http://localhost:5173/user"); await p.waitForSelector(`${sheet} [data-skill], ${sheet} [data-streak]`); await p.waitForSelector("[data-character-sprite] rect >> nth=10", { state: "attached" }); await wait(300); };

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("h2:text-is('Goals')");

// Six tasks done in Study, three in Gym, one in Study that stays open.
const study = (await api("/lists", "POST", { name: "Study" })).list;
const gym = (await api("/lists", "POST", { name: "Gym" })).list;
for (const [list, n] of [[study, 6], [gym, 3]]) {
  for (let i = 0; i < n; i++) {
    const { task } = await api("/tasks", "POST", { title: `${list.name} ${i}`, listId: list.id });
    await api(`/tasks/${task.id}/toggle`, "PATCH", { done: true });
  }
}
await api("/tasks", "POST", { title: "Still to read", listId: study.id });

await openUser();
out("the Character box is at the top of the page, above Account", await p.locator("section[aria-label]").first().getAttribute("aria-label") === "Character" && await p.locator('section[aria-label="Account"] [data-streak]').count() === 0);
out("its name plate says the username, its title Wanderer", await p.locator("[data-character-name]").innerText() === user && await p.locator("[data-character-title]").innerText() === "Wanderer");
out("9 tasks done: level 2 (5 exp), 4 of 10 into it", await attr("[data-character-level]", "data-character-level") === "2" && (await p.locator(`${sheet} [data-exp]`).first().innerText()) === "4 / 10 exp", await p.locator(`${sheet} [data-exp]`).first().innerText());
out("the streak and the tasks done this year, as the Account box had them", await attr(`${sheet} [data-streak]`, "data-streak") === "1" && await attr(`${sheet} [data-done-year]`, "data-done-year") === "9");
out("the character is drawn from its parts", await p.locator("[data-character-sprite] rect").count() > 100);
await p.screenshot({ path: "character.png" });

// The editor: longest streak off, open tasks on, a stat of Study and Gym with a target, Study as a skill.
await p.locator("[data-character-edit]").click(); await p.waitForSelector("[data-stats-editor]");
await p.fill("[data-character-title-field]", "Scholar");
await p.locator('[data-stat-switch="longest"]').click();
await p.locator('[data-stat-switch="open"]').click();
await p.locator("[data-add-stat]").click();
await p.fill("[data-custom-stat-name]", "STR");
await p.locator('[data-custom-stat-source="Study"]').click();
await p.locator('[data-custom-stat-source="Gym"]').click();
await p.fill("[data-custom-stat-target]", "10");
await p.locator("[data-add-skill]").click();
await p.selectOption("[data-skill-source]", { label: "Study" });
await p.fill("[data-skill-name]", "Reading");
await p.locator("[data-stats-save]").click(); await wait(800);
out("the title is the one written", await p.locator("[data-character-title]").innerText() === "Scholar");
out("longest streak switched off, open tasks on (1)", await p.locator(`${sheet} [data-stat="longest"]`).count() === 0 && (await p.locator(`${sheet} [data-stat="open"]`).innerText()).startsWith("1"));
out("STR counts Study and Gym: 9 of 10", await attr(`${sheet} [data-custom-stat="STR"]`, "data-value") === "9" && await p.locator(`${sheet} [data-custom-stat="STR"] .cell-bar-cell[data-filled]`).count() === 9);
out("the skill Reading (Study): 6 exp, level 2", await attr(`${sheet} [data-skill="Reading"]`, "data-skill-exp") === "6" && await attr(`${sheet} [data-skill="Reading"]`, "data-skill-level") === "2");
await openUser();
out("all of it is still there after a reload", await p.locator("[data-character-title]").innerText() === "Scholar" && await p.locator(`${sheet} [data-skill="Reading"]`).count() === 1 && await p.locator(`${sheet} [data-stat="longest"]`).count() === 0);
await p.screenshot({ path: "character-sheet.png" });

// The creator: the next body, its option rows, fur in ginger, the coat in teal.
const fills = () => p.locator(`${sheet} [data-character-sprite] rect`).evaluateAll((els) => els.map((el) => el.getAttribute("fill"))).then((fills) => new Set(fills));
const before = await fills();
await p.locator("[data-character-customize]").click(); await p.waitForSelector("[data-character-creator]");
const value = (name) => p.locator(`[data-stepper="${name}"] [data-stepper-value]`).innerText();
out("the creator opens on the bunny, in its tilted hat and white shirt", await value("body") === "Bunny" && await value("hat") === "Tilted hat" && await value("shirt") === "White shirt");
await p.locator('[data-stepper="hat"] button[aria-label^="Previous"]').click();
out("the hat can be taken off", await value("hat") === "None");
await p.locator('[data-stepper="body"] button[aria-label^="Next"]').click();
out("the next body is the human, with no hat row and colour rows of its own", await value("body") === "Human" && await p.locator('[data-stepper="hat"]').count() === 0 && await p.locator('[data-color-row="sweater"]').count() === 1);
await p.locator('[data-stepper="body"] button[aria-label^="Previous"]').click();
await p.locator('[data-color-row="fur"] button[aria-label="Ginger"]').click();
await p.locator('[data-color-row="coat"] button[aria-label="Teal"]').click();
const creatorFills = await p.locator("[data-character-creator] [data-character-sprite] rect").evaluateAll((els) => els.map((el) => el.getAttribute("fill")));
out("the bunny in the creator turns ginger and teal at once", creatorFills.includes("#C27A47") && creatorFills.includes("#6F9C8C"));
await p.screenshot({ path: "character-creator.png" });
await p.locator("[data-creator-save]").click(); await wait(800);
await openUser();
const after = await fills();
out("saved: the sheet's bunny is ginger with a teal coat after a reload", after.has("#C27A47") && after.has("#6F9C8C") && !before.has("#C27A47"));
await p.locator("[data-character-customize]").click(); await p.waitForSelector("[data-character-creator]");
out("and the creator opens on the bunny with no hat, as saved", await value("body") === "Bunny" && await value("hat") === "None");
await p.locator('[data-color-row="fur"] button:text-is("As drawn")').click();
await p.keyboard.press("Escape"); await wait(300);
out("Esc leaves it as it was", await p.locator("[data-character-creator]").count() === 0 && (await fills()).has("#C27A47"));

// A deleted list's skill drops out by itself.
await api(`/lists/${study.id}`, "DELETE");
await openUser();
out("deleting Study takes its skill off the sheet", await p.locator(`${sheet} [data-skill]`).count() === 0);

// On a phone the stats go under the character.
await p.setViewportSize({ width: 390, height: 844 }); await openUser();
const [sprite, stats] = await Promise.all([p.locator(`${sheet} .character-stage`).boundingBox(), p.locator(`${sheet} [data-character-stats]`).boundingBox()]);
out("on a phone the stats are under the character", stats.y > sprite.y + sprite.height, `${sprite.y + sprite.height} ${stats.y}`);
await p.screenshot({ path: "character-phone.png", fullPage: false });
await p.locator("[data-character-customize]").click(); await p.waitForSelector("[data-character-creator]"); await wait(300);
await p.screenshot({ path: "character-creator-phone.png" });
await b.close();
