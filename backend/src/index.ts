import "dotenv/config";
import { createApp } from "./app.js";
import { RESTORABLE_MS } from "../../shared/constants.js";
import { purgeDeleted } from "./lib/deleted.js";
import { prisma } from "./lib/prisma.js";

const port = Number(process.env.PORT) || 3001;

const server = createApp().listen(port, () => {
  console.log(`Donegeon API listening on http://localhost:${port}`);
});

// Deleted tasks and lists stay restorable for a minute, then go for good. Checked every minute while the
// server is up, and once on start, for what was deleted just before the server last went to sleep.
const purge = () => purgeDeleted().catch((err) => console.error("Purging deleted rows failed:", err));
purge();
const purging = setInterval(purge, RESTORABLE_MS);
purging.unref();

// The host stops the server on every deploy and when it puts it to sleep: requests under way are answered first,
// then the database connections are closed, instead of being cut off.
function shutDown(signal: string) {
  console.log(`${signal}: stopping`);
  clearInterval(purging);
  server.close(() => {
    prisma.$disconnect().finally(() => process.exit(0));
  });
  // Connections kept open by browsers would hold it up: they are given a few seconds.
  setTimeout(() => process.exit(0), 8000).unref();
  server.closeIdleConnections();
}
process.once("SIGTERM", () => shutDown("SIGTERM"));
process.once("SIGINT", () => shutDown("SIGINT"));
