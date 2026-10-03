import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const path = () => new URL(p.url()).pathname;
const onLogin = () => p.waitForURL("**/login", { timeout: 3000 }).then(() => true, () => false);

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("h2:text-is('Goals')");

await p.click("button:text-is('Log out')");
out("log out goes to the login page", await onLogin(), path());
out("nav bar is gone", (await p.locator("button:text-is('Log out')").count()) === 0);
await p.goto("http://localhost:5173/");
out("still logged out after a reload", await onLogin(), path());

await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter");
out("can log back in", await p.waitForSelector("h2:text-is('Goals')", { timeout: 3000 }).then(() => true, () => false), path());
await p.click("button:text-is('Log out')");
out("log out works a second time", await onLogin(), path());

await b.close();
