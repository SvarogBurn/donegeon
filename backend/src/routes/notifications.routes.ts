import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { HttpError } from "../lib/httpError.js";
import { vapidPublicKey } from "../lib/push.js";
import { requireAuth, userId } from "../middleware/requireAuth.js";
import { endpointInput, scheduleInput, snoozeInput, subscriptionInput } from "../schemas/notification.js";
import { removeSubscription, replaceSchedule, saveSubscription, sendDue, sendTest, snooze } from "../services/notifications.service.js";

export const notificationsRouter = Router();

/**
 * A call from outside (cron-job.org) that wakes the server, asleep on the free plan, to send what is due. Not needed
 * while a health check keeps the server awake (the minute timer in index.ts sends then). No session: it carries the
 * secret in X-Tick-Secret instead. Without PUSH_TICK_SECRET there is no such call.
 */
notificationsRouter.post("/tick", async (req, res) => {
  if (!tickAllowed(process.env.PUSH_TICK_SECRET, req.get("X-Tick-Secret"))) throw new HttpError(403, "Wrong secret");
  res.json({ sent: await sendDue() });
});

/** Whether the hourly call carries the secret; compared in constant time. No secret set: nothing is allowed. */
export function tickAllowed(secret: string | undefined, sent: string | undefined) {
  if (!secret || !sent) return false;
  const [a, b] = [Buffer.from(secret), Buffer.from(sent)];
  return a.length === b.length && timingSafeEqual(a, b);
}

notificationsRouter.use(requireAuth);

// The key a browser subscribes with; null when push isn't set up on this server.
notificationsRouter.get("/key", (_req, res) => {
  res.json({ key: vapidPublicKey() });
});

// This device was turned on in the settings.
notificationsRouter.post("/subscriptions", async (req, res) => {
  await saveSubscription(userId(req), subscriptionInput.parse(req.body));
  res.status(204).end();
});

// This device was turned off, or is logging out.
notificationsRouter.delete("/subscriptions", async (req, res) => {
  await removeSubscription(userId(req), endpointInput.parse(req.body).endpoint);
  res.status(204).end();
});

// What the app planned, all of it, in place of what it planned before.
notificationsRouter.put("/schedule", async (req, res) => {
  await replaceSchedule(userId(req), scheduleInput.parse(req.body).items);
  res.status(204).end();
});

// A notification's Snooze button (from the service worker): the same notification again in a little while.
notificationsRouter.post("/snooze", async (req, res) => {
  await snooze(userId(req), snoozeInput.parse(req.body).key);
  res.status(204).end();
});

// The settings' "Send a test".
notificationsRouter.post("/test", async (req, res) => {
  if (!vapidPublicKey()) throw new HttpError(503, "Notifications aren't set up on this server");
  if (!(await sendTest(userId(req)))) throw new HttpError(409, "No device took it: turn notifications on for this device first");
  res.status(204).end();
});
