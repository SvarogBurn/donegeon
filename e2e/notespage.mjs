// The Notes page (free-standing notes, on no task), on a phone in the installed app: a new note opens to be written in
// and is saved on leaving it, its title on the band; folders along the top of the page (made there, a note put in one
// with its "In" choice or by dropping its box on the folder, a click shows only that folder's); a note's box dropped
// on a folder of the top strip shows on that folder's page too; delete with undo; a note written offline is saved once
// the connection is back.
import { chromium } from "playwright";
const b = await chromium.launch();
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const user = "uitest" + Date.now();

const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addInitScript(() => {
  const real = window.matchMedia.bind(window);
  window.matchMedia = (q) => (q.includes("display-mode: standalone") ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : real(q));
});
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR", String(e)));
const api = (path, method = "GET", body) =>
  p.evaluate(async ([path, method, body]) => {
    const r = await fetch("/api" + path, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
    return r.status === 204 ? null : r.json();
  }, [path, method, body]);
const saved = async () => (await api("/notes")).notes;

await p.goto("http://localhost:5173/signup");
await p.fill('input[autocomplete="username"]', user);
await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter");
await p.waitForSelector("section[data-drop-list]");
await api("/auth/me", "PATCH", { tutorialSeen: true });
await api("/folders", "POST", { name: "Work" });
await p.reload();
await p.locator('nav[aria-label="Pages"] [aria-label="Notes"]').click();
await p.waitForURL("**/notes");
out("Notes page is empty at first", await p.getByText("No notes yet.").waitFor({ timeout: 5000 }).then(() => true, () => false));

// A new note, written in at once.
await p.getByRole("button", { name: "+ New note" }).click();
await p.waitForTimeout(300);
out("a new note opens to be written in", await p.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Note"));
await p.keyboard.type("Buy a lamp\n* blue one");
await p.locator('[aria-label="Note title"]').first().fill("Shopping");
await p.locator('[aria-label="Note title"]').first().press("Enter");
await p.waitForTimeout(800);
let notes = await saved();
out("note saved with title and text", notes.length === 1 && notes[0].title === "Shopping" && notes[0].text.includes("blue one"), JSON.stringify(notes));
out("its text reads as a list", (await p.locator("[data-note] [data-note-item]").count()) === 1);
const noteId = notes[0].id;

// A second one, then a folder along the top of the page.
await p.getByRole("button", { name: "+ New note" }).click();
await p.keyboard.type("Call the bank");
await p.mouse.click(5, 400);
await p.waitForTimeout(800);
const boxes = await p.locator("[data-note]").evaluateAll((els) => els.map((el) => el.dataset.note));
out("the newest note is first", boxes.length === 2 && boxes[1] === noteId, JSON.stringify(boxes));
await p.getByRole("button", { name: "+ Folder" }).click();
await p.waitForSelector('[role="dialog"][aria-label^="Note folder"]');
await p.keyboard.type("Home");
await p.keyboard.press("Enter");
await p.waitForTimeout(800);
const folder = (await api("/notes")).noteFolders[0];
out("note folder made and named", folder?.name === "Home", JSON.stringify(folder));
out("the new folder is the one shown, empty", (await p.locator("[data-note]").count()) === 0);

// Back to All, and the first note put in Home with its "In" choice.
await p.locator('nav[aria-label="Note folders"] button', { hasText: "All" }).click();
await p.locator(`[data-note="${noteId}"] select[aria-label="Note folder"]`).selectOption(folder.id);
await p.waitForTimeout(800);
out("note put in the folder", (await saved()).find((n) => n.id === noteId)?.noteFolderId === folder.id);
await p.locator('[data-note-folder="Home"]').click();
await p.waitForTimeout(300);
out("the folder shows only its notes", (await p.locator("[data-note]").evaluateAll((els) => els.map((el) => el.dataset.note))).join() === noteId);
await p.screenshot({ path: "notespage-folder.png" });

// Dragged by its tab button onto "All": out of the folder.
async function dragTo(id, target) {
  const handle = p.locator(`[data-note="${id}"] .tile-button-tab`);
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const to = await p.locator(target).first().boundingBox();
  await p.mouse.move(from.x + 4, from.y + 4);
  await p.mouse.down();
  await p.mouse.move(from.x + 20, from.y + 20, { steps: 4 });
  await p.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await p.waitForTimeout(200);
  await p.mouse.up();
  await p.waitForTimeout(800);
}
await dragTo(noteId, '[data-tab-drop="notes:"]');
out("dropped on All: out of its folder", (await saved()).find((n) => n.id === noteId)?.noteFolderId === null);

// Dropped on a folder of the top strip: shown on that folder's page too.
await p.locator('nav[aria-label="Note folders"] button', { hasText: "All" }).click();
await p.waitForTimeout(300);
await p.evaluate(() => window.scrollTo(0, 0));
await dragTo(noteId, '[data-folder-tab="Work"]');
const work = (await api("/folders")).folders.find((f) => f.name === "Work");
out("dropped on a strip folder: the folder shows it", work.views.includes(`note:${noteId}`), JSON.stringify(work.views));
await p.locator('[data-folder-tab="Work"]').click();
await p.waitForSelector(`[data-note="${noteId}"]`, { timeout: 5000 }).catch(() => {});
out("the note is on the folder's page", (await p.locator(`[data-note="${noteId}"]`).count()) === 1);
await p.screenshot({ path: "notespage-in-folder.png" });

// Delete, then undo.
await p.locator('nav[aria-label="Pages"] [aria-label="Notes"]').click();
await p.locator(`[data-note="${noteId}"] .tile-button-x`).click();
await p.waitForTimeout(800);
out("deleted note gone", (await saved()).every((n) => n.id !== noteId) && (await p.locator(`[data-note="${noteId}"]`).count()) === 0);
await p.getByRole("button", { name: /undo/i }).click();
await p.waitForTimeout(1000);
out("undo brings it back", (await saved()).some((n) => n.id === noteId) && (await p.locator(`[data-note="${noteId}"]`).count()) === 1);

// Search finds it.
await p.locator('[aria-label="Search"]').click();
await p.locator('header [role="searchbox"]').fill("lamp");
await p.waitForTimeout(300);
out("search finds the note", (await p.locator(`[data-search-result="note:${noteId}"]`).count()) === 1);
await p.keyboard.press("Escape");

// Written offline, saved when back.
await ctx.setOffline(true);
await p.evaluate(() => window.dispatchEvent(new Event("offline")));
await p.waitForTimeout(500);
await p.getByRole("button", { name: "+ New note" }).click();
await p.keyboard.type("Offline thought");
await p.mouse.click(5, 400);
await p.waitForTimeout(500);
out("offline note shows at once", (await p.locator("[data-note]").count()) === 3);
await ctx.setOffline(false);
await p.evaluate(() => window.dispatchEvent(new Event("online")));
await p.waitForTimeout(4000);
out("offline note saved once back", (await saved()).some((n) => n.text === "Offline thought"));
await p.screenshot({ path: "notespage.png" });

await b.close();
