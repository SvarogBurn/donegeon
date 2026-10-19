// The Notes page (free-standing notes, on no task), on a phone in the installed app: notes as small cards, two to a
// row; a new note opens on a screen of its own to be written in, title over it, saved on Back (and on the phone's own
// back); a tap on a card opens that screen with just the note; folders along the top of the page (made there, a card
// dragged onto one goes in, a click shows only that folder's, dragged onto All comes out); a card dropped on a folder
// of the top strip shows on that folder's page too; delete from the note's screen; found by the search; a note written
// offline is saved once the connection is back.
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
const screen = '[role="dialog"][aria-label="Note"]';
const cards = () => p.locator("[data-note]").evaluateAll((els) => els.map((el) => el.dataset.note));

await p.goto("http://localhost:5173/signup");
await p.fill('input[autocomplete="username"]', user);
await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter");
await p.waitForSelector("section[data-drop-list]");
await api("/auth/me", "PATCH", { tutorialSeen: true, notesTab: true });
await api("/folders", "POST", { name: "Work" });
await p.reload();
await p.locator('a[aria-label="Notes"]').click();
await p.waitForURL("**/notes");
out("Notes page is empty at first", await p.getByText("No notes yet.").waitFor({ timeout: 5000 }).then(() => true, () => false));

// A new note: on its own screen, written in at once; saved on Back.
await p.getByRole("button", { name: "+ New note" }).click();
await p.waitForSelector(screen);
out("a new note opens on its own screen, to be written in", /\/notes\/[0-9a-f-]{36}$/.test(p.url()) && (await p.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Note")), p.url());
await p.keyboard.type("Buy a lamp\n* blue one");
await p.locator(`${screen} [aria-label="Note title"]`).fill("Shopping");
await p.locator(screen).getByRole("button", { name: "‹ Back" }).click();
await p.waitForURL("**/notes");
await p.waitForTimeout(800);
let notes = await saved();
out("note saved with title and text", notes.length === 1 && notes[0].title === "Shopping" && notes[0].text.includes("blue one"), JSON.stringify(notes));
const noteId = notes[0].id;
out("no folder choice on the card", (await p.locator('select[aria-label="Note folder"]').count()) === 0);

// A second one, left with the phone's own back while still writing.
await p.getByRole("button", { name: "+ New note" }).click();
await p.waitForSelector(screen);
await p.keyboard.type("Call the bank");
await p.goBack();
await p.waitForURL("**/notes");
await p.waitForTimeout(800);
out("phone's back saves what was being written", (await saved()).some((n) => n.text === "Call the bank"));
const order = await cards();
out("the newest note is first", order.length === 2 && order[1] === noteId, JSON.stringify(order));
const boxes = await p.locator("[data-note]").evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => [Math.round(r.top), Math.round(r.width), Math.round(r.height)]));
out("two small cards side by side", boxes[0][0] === boxes[1][0] && boxes[0][1] < 190 && boxes[0][2] < 130, JSON.stringify(boxes));
await p.screenshot({ path: "notespage.png" });

// A tap opens the note on a blank screen with just it.
await p.locator(`[data-note="${noteId}"]`).click();
await p.waitForSelector(screen);
const shown = await p.locator(screen).innerText();
out("a tap opens just the note", shown.includes("Buy a lamp") && shown.includes("blue one") && (await p.locator(`${screen} [aria-label="Note title"]`).inputValue()) === "Shopping", JSON.stringify(shown));
await p.screenshot({ path: "notespage-screen.png" });
await p.locator(screen).getByRole("button", { name: "‹ Back" }).click();
await p.waitForURL("**/notes");

// A folder along the top of the page; a card dragged onto it goes in.
await p.getByRole("button", { name: "+ Folder" }).click();
await p.waitForSelector('[role="dialog"][aria-label^="Note folder"]');
await p.keyboard.type("Home");
await p.keyboard.press("Enter");
await p.waitForTimeout(800);
const folder = (await api("/notes")).noteFolders[0];
out("note folder made and named", folder?.name === "Home", JSON.stringify(folder));
out("the new folder is the one shown, empty", (await p.locator("[data-note]").count()) === 0);
await p.locator('nav[aria-label="Note folders"] button', { hasText: "All" }).click();

async function dragTo(id, target) {
  const handle = p.locator(`li[data-box="${id}"] .tile-button-tab`);
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
await dragTo(noteId, '[data-note-folder="Home"]');
out("dragged onto a note folder: in it", (await saved()).find((n) => n.id === noteId)?.noteFolderId === folder.id);
await p.locator('[data-note-folder="Home"]').click();
await p.waitForTimeout(300);
out("the folder shows only its notes", (await cards()).join() === noteId);
await dragTo(noteId, '[data-tab-drop="notes:"]');
out("dragged onto All: out of its folder", (await saved()).find((n) => n.id === noteId)?.noteFolderId === null);

// Onto a folder of the top strip: shown on that folder's page too.
await p.locator('nav[aria-label="Note folders"] button', { hasText: "All" }).click();
await p.waitForTimeout(300);
await dragTo(noteId, '[data-folder-tab="Work"]');
const work = (await api("/folders")).folders.find((f) => f.name === "Work");
out("dropped on a strip folder: the folder shows it", work.views.includes(`note:${noteId}`), JSON.stringify(work.views));
await p.locator('[data-folder-tab="Work"]').click();
await p.waitForSelector(`[data-note="${noteId}"]`, { timeout: 5000 }).catch(() => {});
out("the note's card is on the folder's page", (await p.locator(`[data-note="${noteId}"]`).count()) === 1);

// Search finds it and opens it.
await p.locator('[aria-label="Search"]').click();
await p.locator('header [role="searchbox"]').fill("lamp");
await p.locator(`[data-search-result="note:${noteId}"]`).click();
await p.waitForSelector(screen);
out("search opens the note", p.url().endsWith(`/notes/${noteId}`));

// Deleted from its screen.
await p.locator(screen).getByRole("button", { name: "Delete" }).click();
await p.locator(screen).getByRole("button", { name: "Delete" }).click();
await p.waitForTimeout(800);
out("deleted note gone", (await saved()).every((n) => n.id !== noteId) && !p.url().includes(noteId), p.url());

// Written offline, saved when back.
await p.goto("http://localhost:5173/notes");
await p.waitForSelector("[data-note]");
await ctx.setOffline(true);
await p.evaluate(() => window.dispatchEvent(new Event("offline")));
await p.waitForTimeout(500);
await p.getByRole("button", { name: "+ New note" }).click();
await p.waitForSelector(screen);
await p.keyboard.type("Offline thought");
await p.locator(screen).getByRole("button", { name: "‹ Back" }).click();
await p.waitForTimeout(500);
out("offline note shows at once", (await p.locator("[data-note]").count()) === 2);
await ctx.setOffline(false);
await p.evaluate(() => window.dispatchEvent(new Event("online")));
await p.waitForTimeout(4000);
out("offline note saved once back", (await saved()).some((n) => n.text === "Offline thought"));

await b.close();
