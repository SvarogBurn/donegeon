import "dotenv/config";
import { createApp } from "./app.js";
import { RESTORABLE_MS } from "../../shared/constants.js";
import { purgeDeleted } from "./lib/deleted.js";
import { prisma } from "./lib/prisma.js";
import { closeSessions } from "./lib/sessions.js";
import { purgeSent, sendDue } from "./services/notifications.service.js";

const port = Number(process.env.PORT) || 3001;

const server = createApp().listen(port, () => {
  console.log(`Donegeon API listening on http://localhost:${port}`);
});

// Deleted tasks and lists stay restorable for a minute, then go for good. Checked every minute while the
// server is up, and once on start, for what was deleted just before the server last went to sleep.
const purge = () => Promise.all([purgeDeleted(), purgeSent()]).catch((err) => console.error("Purging deleted rows and sent notifications failed:", err));
purge();
const purging = setInterval(purge, RESTORABLE_MS);
purging.unref();

// Planned notifications go out when their moment comes, checked every minute while the server is up. Asleep, it is
// woken every hour by POST /api/notifications/tick; on start (that wake-up too) what came due meanwhile goes.
const send = () => sendDue().catch((err) => console.error("Sending notifications failed:", err));
send();
const sending = setInterval(send, 60_000);
sending.unref();

// The host stops the server on every deploy and when it puts it to sleep: requests under way are answered first,
// then the database connections (Prisma's and the sessions') are closed, instead of being cut off.
function shutDown(signal: string) {
  console.log(`${signal}: stopping`);
  clearInterval(purging);
  clearInterval(sending);
  server.close(() => {
    void Promise.allSettled([prisma.$disconnect(), closeSessions()]).then(() => process.exit(0));
  });
  // Connections kept open by browsers would hold it up: they are given a few seconds.
  setTimeout(() => process.exit(0), 8000).unref();
  server.closeIdleConnections();
}
process.once("SIGTERM", () => shutDown("SIGTERM"));
process.once("SIGINT", () => shutDown("SIGINT"));
