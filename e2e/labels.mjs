import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1100, height: 1000 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 450) => p.waitForTimeout(ms);
const names = () => p.locator('input[aria-label="List name"]').evaluateAll(els => els.map(e => e.value).join(","));
const outline = () => p.evaluate(() => [...document.querySelectorAll("[data-task-row]")].map(row => { let d = 0; for (let el = row.parentElement; el; el = el.parentElement) if (el.tagName === "UL") d++; return "-".repeat(d - 1) + row.querySelector("textarea").value; }).join(","));
// Tasks start with their subtasks hidden; this opens them all (without moving the focus).
const expandAll = async () => { while (await p.evaluate(() => { const closed = [...document.querySelectorAll('[aria-label="Expand subtasks"]:enabled')]; closed.forEach((b) => b.click()); return closed.length; })) await p.waitForTimeout(50); };
const row = (t) => p.locator(`[data-task-row]:has(textarea:text-is("${t}"))`).first();
const label = async (task, name) => { await row(task).locator('[aria-label="Task options"]').click(); await row(task).locator(`[role=dialog] label:has-text("${name}") input`).click(); await wait(); await p.keyboard.press("Escape"); };
const pill = (box, name) => p.locator(`[aria-label="${box}"] li:has-text("${name}") button[aria-pressed]`);
await p.goto("http://localhost:5173/"); await p.waitForSelector("text=Create an account");
await p.click("text=Create an account"); await p.waitForSelector('button:text-is("Sign up")');
await p.fill('input[autocomplete="username"]', "uitest" + Date.now()); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("section[data-drop-list]");
out("Goals and Tags boxes both start empty", await p.locator('[aria-label="Goals"] >> text=No goals yet').isVisible() && await p.locator('[aria-label="Tags"] >> text=No tags yet').isVisible());
for (const g of ["Fitness", "Degree"]) { await p.fill('[aria-label="New goal name"]', g); await p.keyboard.press("Enter"); await wait(); }
for (const t of ["urgent", "errand"]) { await p.fill('[aria-label="New tag name"]', t); await p.keyboard.press("Enter"); await wait(); }
await p.fill('[aria-label="New list name"]', "Other"); await p.keyboard.press("Enter"); await wait();
const add = (i) => p.locator('[data-task-editor^="add:"]').nth(i);
await add(0).click(); for (const t of ["Run", "Thesis", "Shop"]) { await p.keyboard.type(t); await p.keyboard.press("Enter"); await wait(350); }
await row("Thesis").locator("textarea").focus(); await p.keyboard.press("Control+Enter"); await p.keyboard.type("Chapter 1"); await p.keyboard.press("Enter"); await wait(350); await p.keyboard.type("Chapter 2"); await p.keyboard.press("Enter"); await wait(350); await p.keyboard.press("Escape");
await add(1).click(); await p.keyboard.type("Gym bag"); await p.keyboard.press("Enter"); await wait();
out("tasks start with no goals or tags", (await p.locator('[title^="Goal:"], [title^="Tag:"]').count()) === 0);
await label("Run", "Fitness"); await label("Run", "Degree"); await label("Run", "urgent");
await label("Chapter 2", "Degree"); await label("Chapter 2", "urgent");
await label("Shop", "errand"); await label("Gym bag", "Fitness");
out("one task carries two goals and a tag", (await row("Run").locator('[title^="Goal:"]').count()) === 2 && (await row("Run").locator('[title="Tag: urgent"]').count()) === 1);
out("boxes count tasks per goal/tag", (await pill("Goals", "Fitness").innerText()).replace(/\s+/g, " ") === "Fitness 2" && (await pill("Tags", "urgent").innerText()).replace(/\s+/g, " ") === "urgent 2", (await pill("Goals", "Fitness").innerText()).replace(/\s+/g, " "));
const all = await outline();
// filter by goal
await pill("Goals", "Fitness").click(); await wait(200);
out("filter by a goal: matching tasks across lists", (await outline()) === "Run,Gym bag" && (await names()) === "List,Other", `${await outline()} | ${await names()}`);
await pill("Goals", "Fitness").click(); await pill("Goals", "Degree").click(); await wait(200);
out("matching subtask is shown with its parent for context", (await outline()) === "Run,Thesis,-Chapter 2" && (await names()) === "List", `${await outline()} | ${await names()}`);
await pill("Tags", "urgent").click(); await wait(200);
out("goal + tag narrows further", (await outline()) === "Run,Thesis,-Chapter 2", await outline());
await pill("Goals", "Degree").click(); await pill("Tags", "urgent").click(); await pill("Tags", "errand").click(); await wait(200);
out("filter by a tag alone", (await outline()) === "Shop", await outline());
// adding while filtered keeps the task visible and tagged
await add(0).click(); await p.keyboard.type("Post office"); await p.keyboard.press("Enter"); await wait();
out("task added while filtering gets the filter's tag", (await outline()) === "Shop,Post office" && (await row("Post office").locator('[title="Tag: errand"]').count()) === 1, await outline());
await row("Shop").locator("textarea").focus(); await p.keyboard.press("Enter"); await p.keyboard.type("Bank"); await p.keyboard.press("Enter"); await wait(); await p.keyboard.press("Escape");
await p.click("text=Clear filter"); await wait(200); await expandAll();
out("clear filter shows everything; Enter-added task landed right below", (await outline()) === "Run,Thesis,-Chapter 1,-Chapter 2,Shop,Bank,Post office,Gym bag", await outline());
// delete a tag in use
await pill("Tags", "errand").click(); await wait(200);
await p.locator('[aria-label=\'Delete tag "errand"\']').click(); await wait();
out("deleting a filtered tag clears the filter and keeps the tasks", (await p.locator("text=Clear filter").count()) === 0 && (await row("Shop").count()) === 1 && (await p.locator('[title="Tag: errand"]').count()) === 0);
await p.reload(); await p.waitForSelector("[data-task-row]"); await expandAll();
out("labels persist after reload", (await row("Run").locator('[title^="Goal:"]').count()) === 2 && (await row("Chapter 2").locator('[title="Tag: urgent"]').count()) === 1);
await row("Run").locator('[aria-label="Task options"]').click(); await wait(200);
await p.screenshot({ path: "labels.png", fullPage: true });
await b.close();
