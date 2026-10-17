import "dotenv/config";
import { createApp } from "./app.js";
import { purgeDeleted, RESTORABLE_MS } from "./lib/deleted.js";

const port = Number(process.env.PORT) || 3001;

createApp().listen(port, () => {
  console.log(`Donegeon API listening on http://localhost:${port}`);
});

// Deleted tasks and lists stay restorable for a minute, then go for good. Checked every minute while the
// server is up, and once on start, for what was deleted just before the server last went to sleep.
const purge = () => purgeDeleted().catch((err) => console.error("Purging deleted rows failed:", err));
purge();
setInterval(purge, RESTORABLE_MS).unref();
