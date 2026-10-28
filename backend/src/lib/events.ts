import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { eventFromFile, type StoryEvent } from "../../../shared/events.js";

/**
 * The newspaper's story events, from news/events/*.md at the repo root (the same files the News page is built with).
 * The server is started from backend/ (npm run dev, and Render's start command), so the folder is one up. Read again at
 * each ask: there are a few small files, and a changed one counts at once in dev.
 */
const EVENTS_DIR = path.resolve(process.cwd(), "..", "news", "events");

export async function readEvents(dir = EVENTS_DIR): Promise<StoryEvent[]> {
  const names = await readdir(dir).catch(() => [] as string[]);
  const events = await Promise.all(names.filter((name) => name.endsWith(".md")).map(async (name) => eventFromFile(name, await readFile(path.join(dir, name), "utf8"))));
  return events.filter((event): event is StoryEvent => event !== null);
}

export async function eventById(id: string, dir = EVENTS_DIR): Promise<StoryEvent | null> {
  return (await readEvents(dir)).find((event) => event.id === id) ?? null;
}
