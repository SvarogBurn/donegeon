import { z } from "zod";
import { NOTIFICATION_KINDS } from "../../../shared/enums.js";
import { localDate } from "./common.js";

/** What a browser gives when notifications are turned on in it (PushSubscription.toJSON()). */
export const subscriptionInput = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export const endpointInput = z.object({ endpoint: z.string().max(1000) });

/** The notification's Snooze: its key, from the push. */
export const snoozeInput = z.object({ key: z.string().min(1).max(200) });

/** How far ahead a notice may be planned: a deadline a year off, with weeks to spare. */
const MAX_AHEAD_MS = 400 * 24 * 60 * 60_000;

const scheduled = z.object({
  key: z.string().min(1).max(120).refine((key) => !key.startsWith("snooze:"), "Snoozed notifications are the server's"),
  kind: z.enum(NOTIFICATION_KINDS).exclude(["test", "snooze"]),
  sendAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)).refine((at) => at.getTime() < Date.now() + MAX_AHEAD_MS, "A notification can be planned at most a year ahead"),
  title: z.string().max(100),
  body: z.string().max(500),
  /** A page of the app: where a tap on it goes. */
  url: z.string().max(300).regex(/^\/(?!\/)/, "A notification opens a page of the app"),
  params: z
    .object({
      /** The recap's week, which the server counts when it sends it: its days, and the moment it began on the device. */
      from: localDate.optional(),
      to: localDate.optional(),
      since: z.iso.datetime({ offset: true }).optional(),
      /** The task a reminder is on: its Done button ticks it, or presses it (`press`, a persistent task). */
      taskId: z.string().min(1).max(64).optional(),
      press: z.boolean().optional(),
      /** The buttons under the notification, where the device shows them. */
      actions: z.array(z.enum(["done", "snooze"])).max(2).optional(),
    })
    .optional(),
});
export type ScheduledInput = z.infer<typeof scheduled>;

/** Everything the app planned, at once: what isn't in it any more is not sent. */
export const scheduleInput = z.object({
  items: z
    .array(scheduled)
    .max(300, "At most 300 notifications planned")
    .refine((items) => new Set(items.map((item) => item.key)).size === items.length, "Two notifications have the same key"),
});
