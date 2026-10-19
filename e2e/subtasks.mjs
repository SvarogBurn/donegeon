import { chromium } from "playwright";
// Subtasks carry notes and can be persistent (with a schedule), as main tasks can; a task's note can be deleted.
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 1200 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 450) => p.waitForTimeout(ms);
const row = (t) => p.locator(`[data-task-row]:has(textarea[aria-label="Task title"]:text-is("${t}"))`).first();
const titleOf = (t) => row(t).locator('textarea[aria-label="Task title"]');
const icon = (t) => row(t).locator(".notes-button");
const panel = p.locator("aside[data-note-panel]");
const field = p.locator('textarea[aria-label="Task note"]');
const menu = p.locator('[role=dialog][aria-label="Task options"]');
const openMenu = async (t) => { await row(t).locator('[aria-label="Task options"]').click(); await wait(200); };
const blur = () => p.mouse.click(1150, 1190);
const leave = () => panel.locator("p").first().click();
const count = (t) => row(t).locator("text=/\\d+\\/\\d+ done/").innerText().catch(() => "");
const today = p.locator('section[aria-label="Today"]');

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', "uitest" + Date.now()); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("section[data-drop-list]");
await p.locator('[data-task-editor^="add:"]').first().click();
await p.keyboard.type("House"); await p.keyboard.press("Enter"); await wait(350); await p.keyboard.press("Escape");
await titleOf("House").focus(); await p.keyboard.press("Control+Enter");
await p.keyboard.type("Water plants"); await p.keyboard.press("Enter"); await wait(350);
await p.keyboard.type("Fix door // hinge is loose"); await p.keyboard.press("Enter"); await wait(350);
await p.keyboard.type("Dust @persistent"); await p.keyboard.press("Enter"); await wait(600); await p.keyboard.press("Escape");
await blur(); await wait();
if (!(await row("Water plants").isVisible())) await row("House").locator('[aria-label="Expand subtasks"]').click();
await wait(200);

// Notes on subtasks.
out("// typed with a subtask becomes its note", (await icon("Fix door").isVisible()) && (await icon("Fix door").getAttribute("data-empty")) === null);
await titleOf("Water plants").focus(); await icon("Water plants").click(); await wait(150);
out("a subtask's grey icon opens the note to write in", (await panel.isVisible()) && (await field.count()) === 1);
await p.keyboard.type("* fern"); await leave(); await wait();
out("…and it is saved", (await panel.locator("[data-note-item]").allInnerTexts()).join("|") === "fern" && (await icon("Water plants").getAttribute("data-empty")) === null);
await panel.locator('[aria-label="Close the note"]').click(); await wait(150);
await openMenu("Fix door");
out("Note is in a subtask's ⋯ menu", (await menu.locator('[data-menu-part="note"]').count()) === 1);
await menu.locator('[data-menu-part="note"]').click(); await wait(150);
out("…and opens its note", (await panel.locator("[data-note-text]").innerText()) === "hinge is loose");

// Deleting a note.
await panel.locator('button[data-note-delete]').click(); await wait(100);
out("Delete asks first", (await panel.locator("text=Delete this note?").isVisible()) && (await panel.locator('button:text-is("Edit")').count()) === 0);
await panel.locator('button:text-is("Keep")').click(); await wait(100);
out("Keep leaves it", (await panel.locator("[data-note-text]").innerText()) === "hinge is loose");
await panel.locator('button[data-note-delete]').click(); await panel.locator('[data-note-delete] button:text-is("Delete")').click(); await wait(600);
out("Delete takes the note away", (await panel.locator("text=No note yet.").isVisible()) && (await icon("Fix door").getAttribute("data-empty")) === "");
await p.reload(); await p.waitForSelector("section[data-drop-list]"); await wait();
if (!(await row("Water plants").isVisible())) await row("House").locator('[aria-label="Expand subtasks"]').click();
out("…for good", !(await icon("Fix door").isVisible()));

// A subtask with a note has a page that shows it.
await row("Water plants").click({ position: { x: 500, y: 8 } }); await wait();
out("a subtask with a note has its own page, with the note", p.url().includes("/tasks/") && (await p.locator('section[aria-label="Note"]').innerText()).includes("fern"), p.url());
await p.locator("text=← All tasks").click(); await p.waitForSelector("section[data-drop-list]"); await wait();
if (!(await row("Water plants").isVisible())) await row("House").locator('[aria-label="Expand subtasks"]').click();

// Persistent subtasks.
out("@persistent typed with a subtask makes it persistent", (await row("Dust").locator(".repeat-button").count()) === 1);
out("…and the main task doesn't count it", (await count("House")) === "0/2 done", await count("House"));
await openMenu("Fix door");
await menu.locator('label:has-text("Persistent") input').click(); await wait(600);
out("Persistent is in a subtask's ⋯ menu, with Repeat once ticked", (await row("Fix door").locator(".repeat-button").count()) === 1 && (await menu.locator('[aria-label^="Repeat every"]').count()) === 1);
await menu.locator('[aria-label^="Repeat every"]').fill("1"); await p.keyboard.press("Enter"); await wait(600);
out("a scheduled subtask is due today and comes into Today", (await row("Fix door").locator("[data-next-due]").innerText()) === "due today" && (await today.locator('[data-today-item]:has-text("Fix door")').count()) === 1);
await row("Fix door").locator(".repeat-button").click(); await wait(700);
out("pressing it moves it on and leaves a ticked copy", (await row("Fix door").locator("[data-next-due]").innerText()).startsWith("next ") && (await p.locator("[data-press-copy]").count()) === 1);
await row("Water plants").locator('[aria-label^="Mark"]').click(); await wait(600);
out("with only persistent subtasks left, the main task can be ticked", !(await row("House").locator('[aria-label^="Mark"]').isDisabled()));

// A tick under a persistent subtask is undone by its press, as under a persistent main task.
await titleOf("Dust").focus(); await p.keyboard.press("Control+Enter"); await p.keyboard.type("Shelves"); await p.keyboard.press("Enter"); await wait(500); await p.keyboard.press("Escape");
await blur(); await wait(200);
if (!(await row("Shelves").isVisible())) await row("Dust").locator('[aria-label="Expand subtasks"]').click();
await row("Shelves").locator('[aria-label^="Mark"]').click(); await wait(600);
out("ticking a subtask of a persistent subtask leaves the main task's count alone", (await count("House")) === "1/1 done", await count("House"));
await row("Dust").locator(".repeat-button").click(); await wait(700);
out("pressing the persistent subtask unticks it for the next round", !(await row("Shelves").locator('[aria-label^="Mark"]').isChecked()));
await p.reload(); await p.waitForSelector("section[data-drop-list]"); await wait();
if (!(await row("Water plants").isVisible())) await row("House").locator('[aria-label="Expand subtasks"]').click();
if (!(await row("Shelves").isVisible())) await row("Dust").locator('[aria-label="Expand subtasks"]').click();
out("the server agrees after a reload", (await count("House")) === "1/1 done" && !(await row("Shelves").locator('[aria-label^="Mark"]').isChecked()) && (await row("Dust").locator(".repeat-button").count()) === 1, await count("House"));
await row("House").locator('[aria-label^="Mark"]').click(); await wait(700);
out("the main task ticks with persistent subtasks under it", await row("House").locator('[aria-label^="Mark"]').isChecked());
await b.close();
