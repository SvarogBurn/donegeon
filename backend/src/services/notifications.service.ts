import type { ScheduledNotification } from "@prisma/client";
import { CHEER_LINES } from "../../../shared/constants.js";
import { addDays } from "../../../shared/dates.js";
import { heartsText, restDays, restRanges } from "../../../shared/health.js";
import { prisma } from "../lib/prisma.js";
import { pushTo, type PushDevice, type PushMessage } from "../lib/push.js";
import type { ScheduledInput, TestReminderInput } from "../schemas/notification.js";
import { cheerPush } from "./peopleRules.js";

/**
 * Notifications are planned by the app, which knows the user's days and what Today and the Week will show, and sent
 * from here at their moment. The app sends its whole plan again whenever the tasks change.
 */

/** A notification the timer missed by more than this (the server was asleep) is dropped, not sent late. */
export const LATE_MS = 3 * 60 * 60_000;
/** Sent notifications are kept this long, so a plan sent again doesn't send them a second time; then removed. */
const KEEP_SENT_MS = 14 * 24 * 60 * 60_000;

/** A device turned on: a browser that turns on again (or another user logging in on it) takes the row over. */
export async function saveSubscription(userId: string, device: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const row = { userId, p256dh: device.keys.p256dh, auth: device.keys.auth };
  await prisma.pushSubscription.upsert({ where: { endpoint: device.endpoint }, create: { endpoint: device.endpoint, ...row }, update: row });
}

export async function removeSubscription(userId: string, endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

/**
 * Puts the app's new plan in place of the old one: what is no longer in it is not sent, the rest is written over,
 * and a notification already sent is left as it was, so it isn't sent again. Two statements, whatever the plan's size.
 */
export async function replaceSchedule(userId: string, items: ScheduledInput[]) {
  const keys = items.map((item) => item.key);
  // The moments go as text and are turned into the columns' UTC here, so nothing hangs on the database's time zone.
  await prisma.$transaction([
    prisma.scheduledNotification.deleteMany({ where: { userId, sentAt: null, key: { notIn: keys } } }),
    prisma.$executeRaw`
      INSERT INTO "ScheduledNotification" ("id", "userId", "key", "kind", "sendAt", "title", "body", "url", "params")
      SELECT gen_random_uuid()::text, ${userId}, v.key, v.kind, v."sendAt"::timestamptz AT TIME ZONE 'UTC', v.title, v.body, v.url, v.params::jsonb
      FROM unnest(
        ${keys}::text[], ${items.map((item) => item.kind)}::text[], ${items.map((item) => item.sendAt.toISOString())}::text[],
        ${items.map((item) => item.title)}::text[], ${items.map((item) => item.body)}::text[], ${items.map((item) => item.url)}::text[],
        ${items.map((item) => (item.params ? JSON.stringify(item.params) : null))}::text[]
      ) AS v(key, kind, "sendAt", title, body, url, params)
      ON CONFLICT ("userId", "key") DO UPDATE
        SET "kind" = EXCLUDED."kind", "sendAt" = EXCLUDED."sendAt", "title" = EXCLUDED."title", "body" = EXCLUDED."body",
            "url" = EXCLUDED."url", "params" = EXCLUDED."params"
        WHERE "ScheduledNotification"."sentAt" IS NULL`,
  ]);
}

interface RecapParams {
  from: string;
  to: string;
  since: string;
}

/** What a planned row's params may carry besides the recap's week (see schemas/notification.ts). */
interface RowParams extends Partial<RecapParams> {
  taskId?: string;
  press?: boolean;
  dueDay?: string;
  actions?: "done"[];
}

/**
 * The week's recap, written when it is sent (the app can't know the week's numbers in advance): the tasks ticked and
 * the presses from Monday to the reminder's day, and the points earned since Monday began and not taken back (none told
 * while the points system is off), and the deadlines and rounds whose miss came in this week, half a heart each (none
 * while health is off, nor for a rest day). Null when nothing was done.
 */
export async function recapText(userId: string, { from, to, since }: RecapParams): Promise<Pick<PushMessage, "title" | "body"> | null> {
  const [ticked, pressed, earned, user, hits] = await Promise.all([
    prisma.task.count({ where: { userId, deletedAt: null, isComplete: true, completedOn: { gte: from, lte: to } } }),
    prisma.taskCompletion.count({ where: { userId, day: { gte: from, lte: to } } }),
    prisma.pointTransaction.aggregate({
      where: { userId, type: "earned", createdAt: { gte: new Date(since) }, reversedBy: { is: null } },
      _sum: { amount: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { pointsOff: true, healthOff: true, restDays: true } }),
    prisma.hit.findMany({ where: { userId, kind: { not: "day" }, day: { gte: from, lte: to } }, select: { day: true } }),
  ]);
  const done = ticked + pressed;
  if (done === 0) return null;
  const points = user?.pointsOff ? 0 : (earned._sum.amount ?? 0);
  const rest = restDays(restRanges(user?.restDays), addDays(from, -1), to);
  const missed = user?.healthOff ? 0 : hits.filter(({ day }) => !rest.has(addDays(day, -1))).length;
  const earnedText = points > 0 ? `${points} point${points === 1 ? "" : "s"} earned since Monday. ` : "";
  const missedText = missed > 0 ? `${missed} missed (−${heartsText(missed)} ♥). ` : "";
  return {
    title: `${to === addDays(from, 6) ? "This week" : "This week so far"}: ${done} task${done === 1 ? "" : "s"} done`,
    body: `${earnedText}${missedText}Well done!`,
  };
}

/** Pushes one message to every device of a user's; devices whose browser dropped notifications are forgotten. */
async function pushToUser(devices: (PushDevice & { id: string })[], message: PushMessage) {
  const results = await Promise.all(devices.map((device) => pushTo(device, message)));
  const gone = devices.filter((_, at) => results[at] === "gone").map((device) => device.id);
  if (gone.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: gone } } });
  return results.includes("sent");
}

/**
 * Sends every planned notification whose moment has come. Each is claimed first, in one statement that marks it sent:
 * two servers (or the timer and the hourly call at once) never send one twice. One missed by more than LATE_MS is
 * claimed and dropped. Returns how many were pushed.
 */
export async function sendDue(now = new Date()): Promise<number> {
  const due = await prisma.$queryRaw<ScheduledNotification[]>`
    UPDATE "ScheduledNotification" SET "sentAt" = ${now.toISOString()}::timestamptz AT TIME ZONE 'UTC'
    WHERE "sentAt" IS NULL AND "sendAt" <= ${now.toISOString()}::timestamptz AT TIME ZONE 'UTC'
    RETURNING *`;
  const timely = due.filter((row) => row.sendAt.getTime() > now.getTime() - LATE_MS);
  if (timely.length === 0) return 0;
  const devices = await prisma.pushSubscription.findMany({ where: { userId: { in: [...new Set(timely.map((row) => row.userId))] } } });
  let pushed = 0;
  for (const row of timely) {
    const params = (row.params ?? {}) as RowParams;
    const text = row.kind === "recap" ? await recapText(row.userId, params as RecapParams) : row;
    if (!text) continue;
    const mine = devices.filter((device) => device.userId === row.userId);
    const message = { title: text.title, body: text.body, url: row.url, tag: row.key, key: row.key, actions: params.actions, taskId: params.taskId, press: params.press };
    if (await pushToUser(mine, message)) pushed++;
  }
  return pushed;
}

/**
 * A task done from its notification: the app isn't open to plan again, so what that answers is called off here.
 * Ticked (no `nextDue`): all its reminders. Pressed: those coming on days it is due, for the days before its
 * next round; one coming every day keeps coming, as the user asked it to.
 */
export async function clearAnswered(userId: string, taskId: string, nextDue?: string) {
  await prisma.$executeRaw`
    DELETE FROM "ScheduledNotification"
    WHERE "userId" = ${userId} AND "sentAt" IS NULL AND "params"->>'taskId' = ${taskId}
      AND (${nextDue ?? null}::text IS NULL OR ("params"->>'dueDay')::date < ${nextDue ?? null}::date)`;
}

/** What a test says, one picked at random each time; {username} is the user's name. */
const TEST_LINES = [
  "The dragon carrying your notifications woke up from his nap.",
  "Beatrice the dragon wants you to know she is well.",
  "Swallow the dragon, slay the frog.",
  "Today smells like gold.",
  "Dragons are frolicking around you.",
  "Dragons don't believe in you either",
  "Le Boop",
  "The bard ran out of spell socks",
  "Hello from the other side",
  "Gunthar the dragon ate your breakfast. He says it was delicious.",
  "Surprisingly hard to find funny dragon quotes online. yw, {username}",
];

/** The settings' "Send a test": to every device of the user's at once. False when none took it. */
export async function sendTest(userId: string) {
  const [devices, user] = await Promise.all([prisma.pushSubscription.findMany({ where: { userId } }), prisma.user.findUnique({ where: { id: userId }, select: { username: true } })]);
  const body = TEST_LINES[Math.floor(Math.random() * TEST_LINES.length)].replace("{username}", user?.username ?? "adventurer");
  return pushToUser(devices, { title: "Donegeon", body, url: "/user", tag: "test" });
}

/**
 * The settings' "Send a test cheer": a cheer from the user themselves, with their face, to every device of theirs. Nothing is saved, so
 * no friend is needed, there's no one-a-day limit and nothing pops in the app. False when no device took it.
 */
export async function sendTestCheer(user: { id: string; username: string }, face?: string) {
  const devices = await prisma.pushSubscription.findMany({ where: { userId: user.id } });
  return pushToUser(devices, cheerPush(user, CHEER_LINES[Math.floor(Math.random() * CHEER_LINES.length)], face));
}

/**
 * The settings' "Send a test reminder": the reminders the app made of today's tasks, pushed at once to every device of the
 * user's, as sendDue would push them (a Done on one works as on a planned one). Nothing is saved. False when no device took them.
 */
export async function sendTestReminders(userId: string, items: TestReminderInput["items"]) {
  const devices = await prisma.pushSubscription.findMany({ where: { userId } });
  let took = false;
  for (const [at, item] of items.entries()) {
    const key = `test-reminder:${at}`;
    const { actions, taskId, press } = item.params ?? {};
    if (await pushToUser(devices, { title: item.title, body: item.body, url: item.url, tag: key, key, actions, taskId, press })) took = true;
  }
  return took;
}

/**
 * A cheer or a friend request, pushed at once, unless the person switched those off (Settings › Notifications).
 * Not a planned notification: the app's next plan would remove it. Comes after the answer, so a failure is only logged.
 */
export async function pushToPerson(userId: string, message: PushMessage) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { notifications: true, pushSubscriptions: true } });
    if (!user || (user.notifications as { people?: { on?: boolean } } | null)?.people?.on === false) return;
    await pushToUser(user.pushSubscriptions, message);
  } catch (err) {
    console.error("Pushing to a person failed:", err);
  }
}

/** Removes notifications sent long enough ago that no plan can name them again, and cheers read as long ago. */
export async function purgeSent(now = Date.now()) {
  const before = new Date(now - KEEP_SENT_MS);
  await Promise.all([prisma.scheduledNotification.deleteMany({ where: { sentAt: { lt: before } } }), prisma.cheer.deleteMany({ where: { seenAt: { lt: before } } })]);
}
