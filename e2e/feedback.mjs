import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
p.on("pageerror", e => console.log("PAGEERROR", String(e)));
p.on("response", async r => r.status() >= 500 && console.log("HTTP", r.status(), r.url(), await r.text()));
const user = "uitest" + Date.now();
const out = (n, ok, d = "") => console.log(ok ? "PASS" : "FAIL", n, d === "" ? "" : "-> " + d);
const wait = (ms = 450) => p.waitForTimeout(ms);

await p.goto("http://localhost:5173/signup"); await p.fill('input[autocomplete="username"]', user); await p.fill('input[type="password"]', "hunter2hunter2");
await p.keyboard.press("Enter"); await p.waitForSelector("[data-task-editor]"); await wait();
await p.goto("http://localhost:5173/user"); await p.waitForSelector("[data-feedback]"); await wait();

const form = p.locator("[data-feedback]");
const send = form.locator('button[type="submit"]');
out("the box reads as an email: from the user, to Donegeon, a subject", (await form.innerText()).replace(/\s+/g, " ").includes(`From ${user} To Donegeon Subject`));
out("bug or feature, bug first", await form.locator("[data-feedback-kind]").inputValue() === "bug" && (await form.locator("[data-feedback-kind] option").allInnerTexts()).join() === "Bug,Feature");
out("nothing to send while the letter is empty", await send.isDisabled());

await p.selectOption("[data-feedback-kind]", "feature"); await form.locator("#feedback-subject").fill("Dark dungeons"); await form.locator("textarea").fill("More torches please.");
await p.screenshot({ path: "feedback.png" });
const [req] = await Promise.all([p.waitForRequest((r) => r.url().endsWith("/api/feedback")), send.click()]); await wait();
out("Send posts the kind, subject and letter", JSON.stringify(req.postDataJSON()) === JSON.stringify({ kind: "feature", subject: "Dark dungeons", message: "More torches please." }));
out("it says so and the letter is cleared, the kind kept", await form.locator("[data-feedback-sent]").count() === 1 && await form.locator("textarea").inputValue() === "" && await form.locator("#feedback-subject").inputValue() === "" && await form.locator("[data-feedback-kind]").inputValue() === "feature");
await form.locator("textarea").fill("x"); await wait(100);
out("the thanks go when the next letter is started", await form.locator("[data-feedback-sent]").count() === 0);

await p.setViewportSize({ width: 390, height: 800 }); await wait();
out("fits a phone", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
await b.close();
