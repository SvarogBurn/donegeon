import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 300) => p.waitForTimeout(ms);
const path = () => new URL(p.url()).pathname;
const onLogin = () => p.waitForURL("**/login", { timeout: 3000 }).then(() => true, () => false);
const logIn = async (page) => { await page.fill('input[autocomplete="username"]', user); await page.fill('input[type="password"]', "hunter2hunter2"); await page.keyboard.press("Enter"); };

await p.goto("http://localhost:5173/signup"); await logIn(p); await p.waitForSelector("h2:text-is('Goals')");
// The same account on a second device.
const other = await (await b.newContext()).newPage();
await other.goto("http://localhost:5173/login"); await logIn(other); await other.waitForSelector("h2:text-is('Goals')");

await p.goto("http://localhost:5173/user"); await p.click("[data-delete-account-open]");
const box = p.locator("[data-delete-account]");
const field = box.locator("[data-delete-account-confirm]");
const del = box.locator('button[type="submit"]');
out("the dialog names the phrase to type", (await box.innerText()).includes(`donegeon/${user}`));
out("Delete is off with nothing typed", await del.isDisabled());
await field.fill(user);
out("the username alone is not enough", await del.isDisabled());
await field.fill(`donegeon/${user}x`);
out("nor a wrong phrase", await del.isDisabled());
await field.press("Enter"); await wait();
out("Enter does nothing while it is wrong", await box.count() === 1 && path() === "/user");
const refused = await p.evaluate(async (confirm) => (await fetch("/api/auth/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm }) })).status, user);
out("the server refuses a wrong phrase too", refused === 400, refused);
await p.keyboard.press("Escape"); await wait();
out("Esc closes it, the account is still there", await box.count() === 0 && await p.locator("[data-username]").innerText() === user);

await p.click("[data-delete-account-open]");
out("what was typed is gone when it is opened again", await field.inputValue() === "");
await field.fill(`donegeon/${user}`);
out("Delete is on once the phrase is typed", await del.isEnabled());
await p.screenshot({ path: "account.png" });
await del.click();
out("deleting goes to the login page", await onLogin(), path());
await p.goto("http://localhost:5173/");
out("still logged out after a reload", await onLogin(), path());
await logIn(p);
out("the account can't be logged in to", await p.waitForSelector("text=Wrong username or password", { timeout: 3000 }).then(() => true, () => false));
const status = await other.evaluate(async () => (await fetch("/api/lists")).status);
out("the other device is logged out too", status === 401, status);

await b.close();
