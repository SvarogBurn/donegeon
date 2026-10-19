import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1100, height: 1000 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 450) => p.waitForTimeout(ms);
const row = (t) => p.locator(`[data-task-row]:has(textarea[aria-label="Task title"]:text-is("${t}"))`).first();
const titleOf = (t) => row(t).locator('textarea[aria-label="Task title"]');
const icon = (t) => row(t).locator(".notes-button");
const panel = p.locator("aside[data-note-panel]");
const field = p.locator('textarea[aria-label="Task note"]');
const blur = () => p.mouse.click(1050, 990);
// Leaves the note's field without leaving the pane (a click outside would close it).
const leave = () => panel.locator("p").first().click();
const isFocused = (loc) => loc.evaluate(el => el === document.activeElement);
await p.goto("http://localhost:5173/"); await p.waitForSelector("text=Create an account");
await p.click("text=Create an account"); await p.waitForSelector('button:text-is("Sign up")');
await p.fill('input[autocomplete="username"]', "uitest" + Date.now()); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("section[data-drop-list]");
// The list gets a colour of its own: a task's note is framed in it.
const listId = await p.locator("section[data-drop-list]").first().getAttribute("data-drop-list");
await p.evaluate(async (id) => { await fetch(`/api/lists/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ color: "#c8423b" }) }); }, listId);
await p.reload(); await p.waitForSelector("section[data-drop-list]");
await p.locator('[data-task-editor^="add:"]').first().click();
for (const t of ["Shop", "Run"]) { await p.keyboard.type(t); await p.keyboard.press("Enter"); await wait(350); }
await titleOf("Shop").focus(); await p.keyboard.press("Control+Enter"); await p.keyboard.type("Bread"); await p.keyboard.press("Enter"); await wait(350); await p.keyboard.press("Escape");
await blur(); await wait(200);

// The icon on the row.
out("a main task without a note shows no icon", !(await icon("Run").isVisible()));
await titleOf("Run").focus();
out("editing its title shows a grey icon", (await icon("Run").isVisible()) && (await icon("Run").getAttribute("data-empty")) === "");
if (!(await row("Bread").isVisible())) await row("Shop").locator('[aria-label="Expand subtasks"]').click();
await titleOf("Bread").focus();
out("a subtask gets the grey icon too while its title is edited", (await icon("Bread").isVisible()) && (await icon("Bread").getAttribute("data-empty")) === "");
await blur(); await wait(150);

// Writing in the side panel.
await titleOf("Run").focus(); await icon("Run").click(); await wait(150);
out("the grey icon opens the note at the side, ready to write", (await panel.isVisible()) && await isFocused(field));
await p.keyboard.type("Route:"); await p.keyboard.press("Enter");
await p.keyboard.type("* park"); await p.keyboard.press("Enter"); await p.keyboard.press("Tab"); await p.keyboard.type("**twice**");
await p.keyboard.press("Enter"); await p.keyboard.press("Enter"); await p.keyboard.type("then stretch");
out("Enter carries a list on, Tab nests it, Enter on an empty item ends it", (await field.inputValue()) === "Route:\n* park\n  * **twice**\nthen stretch", JSON.stringify(await field.inputValue()));
await p.keyboard.press("Escape"); await wait();
out("Escape saves it and shows it read, not written", (await field.count()) === 0 && (await panel.locator("[data-note-text]").isVisible()));
out("…with bullets, a nested item and bold", (await panel.locator("[data-note-item]").count()) === 2 && (await panel.locator('[data-note-item="1"] b').innerText()) === "twice");
out("clicking the note's text doesn't start writing", await (async () => { await panel.locator("[data-note-text]").click(); return (await field.count()) === 0; })());
await panel.locator('button:text-is("Edit")').click(); await wait(150);
out("Edit opens the field with the note", (await isFocused(field)) && (await field.inputValue()).startsWith("Route:"));
await panel.locator('button:text-is("Done")').click(); await wait();
out("Done goes back to reading", (await field.count()) === 0);
out("the panel has no green edge", await panel.evaluate(el => ![...el.querySelectorAll("*")].some(c => /rgb\(5, 150, 105|emerald/.test(getComputedStyle(c).boxShadow + getComputedStyle(c).borderColor))));
await p.keyboard.press("Escape"); await wait(150);
out("Escape closes the panel", (await panel.count()) === 0);
out("written, the row's icon stays in colour", (await icon("Run").isVisible()) && (await icon("Run").getAttribute("data-empty")) === null);
await p.reload(); await p.waitForSelector("section[data-drop-list]"); await wait();
out("after a reload too", (await icon("Run").isVisible()) && (await panel.count()) === 0);
await icon("Run").click(); await wait(150);
out("clicking it shows the note to read", (await panel.locator("[data-note-text]").isVisible()) && (await field.count()) === 0);
await icon("Run").click(); await wait(150);
out("clicking it again closes it", (await panel.count()) === 0);
await icon("Run").click(); await wait(150); await panel.locator('button:text-is("Edit")').click(); await p.keyboard.type(" !");
await p.mouse.click(400, 990); await wait();
out("a click anywhere outside closes it, saving what was written", (await panel.count()) === 0 && (await icon("Run").click(), await wait(150), (await panel.locator("[data-note-text]").innerText()).endsWith("stretch !")));
await icon("Run").click(); await wait(150);

// The ⋯ menu.
await row("Shop").locator('[aria-label="Task options"]').click();
const menu = p.locator('[role=dialog][aria-label="Task options"]');
await menu.locator('[data-menu-part="note"]').click(); await wait(150);
out("Note in the ⋯ menu opens the panel to write in", (await menu.count()) === 0 && (await panel.getAttribute("data-note-panel")) !== null && await isFocused(field));
await p.keyboard.type("milk, eggs"); await leave(); await wait();
out("leaving the field saves it", (await panel.locator("[data-note-text]").innerText()) === "milk, eggs" && (await icon("Shop").getAttribute("data-empty")) === null);
await panel.locator('button:text-is("Edit")').click(); await field.fill(""); await leave(); await wait();
out("emptied, the note is gone", (await panel.locator("text=No note yet.").isVisible()) && (await icon("Shop").getAttribute("data-empty")) === "");
await panel.locator('[aria-label="Close the note"]').click(); await wait(150);
out("…and closed, so is its icon", (await panel.count()) === 0 && !(await icon("Shop").isVisible()));

// The task page.
await row("Run").click({ position: { x: 600, y: 8 } }); await wait();
out("a task with a note has its own page", p.url().includes("/tasks/"), p.url());
const pageNote = p.locator('section[aria-label="Note"]');
out("the page shows the note", (await pageNote.locator("[data-note-item]").count()) === 2 && (await pageNote.innerText()).includes("then stretch"));
const at = async (sel) => p.locator(sel).first().boundingBox();
const [cd, tk, nt] = [await at('[aria-label="Countdown"]'), await at('section[aria-label="Tasks"]'), await at('section[aria-label="Note"]')];
out("on a wide screen the note is at the bottom left: under the countdown, beside the tasks", nt.y > cd.y + cd.height && Math.abs(nt.x - cd.x) < 2 && tk.x > nt.x + nt.width - 2, JSON.stringify({ cd, nt, tk }));
out("its frame is the list's colour", (await pageNote.getAttribute("style") ?? "").includes("--frame") && (await pageNote.getAttribute("data-tone")) === "blue", await pageNote.getAttribute("style"));
await pageNote.locator('button:text-is("Edit")').click(); await p.keyboard.type(" a lot"); await p.keyboard.press("Escape"); await wait();
out("…and it can be written there", (await pageNote.innerText()).includes("stretch ! a lot"));
await p.locator("text=← All tasks").click(); await p.waitForSelector("section[data-drop-list]"); await wait();
await row("Shop").click({ position: { x: 600, y: 8 } }); await wait();
out("a task without a note still has no page", !p.url().includes("/tasks/"), p.url());

// Typed with the task.
await p.locator('[data-task-editor^="add:"]').first().click();
await p.keyboard.type("Trip #travel // * passport"); await p.keyboard.press("Shift+Enter"); await p.keyboard.type("* #charger");
out("// shows a note chip while typing", (await p.locator('[data-syntax-chip="note"]').innerText()).startsWith("note: * passport"));
out("…and offers no tags inside the note", (await p.locator("[data-syntax-options]").count()) === 0);
await p.keyboard.press("Enter"); await wait(600); await p.keyboard.press("Escape"); await blur(); await wait();
await icon("Trip").click(); await wait(150);
out("// typed with a task becomes its note", (await panel.locator("[data-note-item]").allInnerTexts()).join("|") === "passport|#charger" && (await row("Trip").locator('[title="Tag: travel"]').count()) === 1);

out("the side pane is framed in the list's colour", ((await p.locator('[aria-label="Note box"]').getAttribute("style")) ?? "").includes("--frame"));
// Headings.
await panel.locator('button:text-is("Edit")').click();
await field.fill("# Big plan\nSome words\n## **Mid** part\n### Small\n#tag line\n\\# literal\n* item"); await leave(); await wait();
const heads = await panel.locator("[data-note-heading]").evaluateAll((els) => els.map((el) => `${el.tagName}:${el.dataset.noteHeading}:${el.textContent}:${parseFloat(getComputedStyle(el).fontSize)}`));
out("# ## ### are headings, biggest first", heads.length === 3 && heads[0].startsWith("H3:1:Big plan") && heads[1].startsWith("H4:2:Mid part") && heads[2].startsWith("H5:3:Small") && parseFloat(heads[0].split(":")[3]) > parseFloat(heads[1].split(":")[3]), JSON.stringify(heads));
out("…with their markup", (await panel.locator('[data-note-heading="2"] b').innerText()) === "Mid");
const texts = await panel.locator("[data-note-text] > p").allInnerTexts();
out("a tag and an escaped hash stay text", texts.includes("#tag line") && texts.includes("# literal"), JSON.stringify(texts));
await panel.screenshot({ path: "notes-headings.png" });
await p.emulateMedia({ colorScheme: "dark" }); await wait(150);
await panel.screenshot({ path: "notes-headings-dark.png" });
await p.emulateMedia({ colorScheme: "light" });
await p.evaluate(() => document.documentElement.dataset.font = "plain"); await wait(150);
await panel.screenshot({ path: "notes-headings-plain.png" });
await p.evaluate(() => delete document.documentElement.dataset.font);

await panel.locator('button:text-is("Edit")').click();
await field.fill(Array.from({ length: 60 }, (_, i) => `* line ${i} with words enough to wrap around`).join("\n")); await leave(); await wait();
const fit = await p.locator('[aria-label="Note box"]').evaluate((frame) => {
  const body = frame.querySelector(".tile-body"); const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bar-h")) || 0;
  return { bottom: frame.getBoundingClientRect().bottom, room: innerHeight - bar, scrolls: body.scrollHeight > body.clientHeight };
});
out("a long note scrolls inside its frame, which stays whole above the task bar", fit.scrolls && fit.bottom <= fit.room, JSON.stringify(fit));
await p.locator("section[data-drop-list]").first().screenshot({ path: "notes.png" });
await p.screenshot({ path: "notes-panel.png" });
await p.setViewportSize({ width: 390, height: 844 }); await wait();
await p.screenshot({ path: "notes-phone.png" });
await b.close();
