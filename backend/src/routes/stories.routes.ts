import { Router, type Request } from "express";
import { z } from "zod";
import { countWords, eventState, STORY_TEXT_MAX, STORY_TITLE_MAX, storyWordCap } from "../../../shared/events.js";
import { isDev } from "../lib/devs.js";
import { eventById } from "../lib/events.js";
import { HttpError, notFound } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";
import { userId } from "../middleware/requireAuth.js";

const story = z.object({
  title: z.string().trim().min(1, "Give your story a title").max(STORY_TITLE_MAX, `A title is at most ${STORY_TITLE_MAX} characters`),
  text: z.string().trim().min(1, "Write your story first").max(STORY_TEXT_MAX, `A story is at most ${STORY_TEXT_MAX} characters`),
});

const SHOWN = { id: true, title: true, text: true, words: true, createdAt: true, updatedAt: true } as const;

export const storiesRouter = Router();

/** The event asked for, as it stands on the user's today; 404 for one there is no file for. */
async function eventOf(req: Request) {
  const event = await eventById(String(req.params.eventId));
  if (!event) throw notFound("Event");
  return { event, state: eventState(event, req.localDate) };
}

// An event's page: the user's own story, and everyone's once the event is closed (before that, nobody's but theirs).
storiesRouter.get("/:eventId", async (req, res) => {
  const { event, state } = await eventOf(req);
  const mine = await prisma.story.findUnique({ where: { userId_eventId: { userId: userId(req), eventId: event.id } }, select: SHOWN });
  const stories =
    state === "closed"
      ? await prisma.story.findMany({ where: { eventId: event.id }, orderBy: { createdAt: "asc" }, select: { ...SHOWN, user: { select: { username: true } } } })
      : [];
  res.json({ state, mine, stories: stories.map(({ user, ...rest }) => ({ ...rest, username: user.username })) });
});

// Writes the user's story, or changes it, while the event is open.
storiesRouter.put("/:eventId", async (req, res) => {
  const { event, state } = await eventOf(req);
  if (state !== "open") throw new HttpError(409, state === "upcoming" ? "This event isn't open for stories yet" : "This event is closed: its stories can only be read now");
  const input = story.parse(req.body);
  const words = countWords(input.text);
  const cap = storyWordCap(event.words);
  if (words > cap) throw new HttpError(400, `A story is at most ${cap} words; this one has ${words}`);
  const where = { userId_eventId: { userId: userId(req), eventId: event.id } };
  const saved = await prisma.story.upsert({ where, create: { ...input, words, userId: userId(req), eventId: event.id }, update: { ...input, words }, select: SHOWN });
  res.json(saved);
});

// Takes the user's story back, while the event is open.
storiesRouter.delete("/:eventId", async (req, res) => {
  const { event, state } = await eventOf(req);
  if (state !== "open") throw new HttpError(409, "Only a story of an open event can be taken back");
  await prisma.story.deleteMany({ where: { userId: userId(req), eventId: event.id } });
  res.status(204).end();
});

// A developer takes any story down.
storiesRouter.delete("/story/:id", async (req, res) => {
  const reader = await prisma.user.findUnique({ where: { id: userId(req) }, select: { username: true } });
  if (!reader || !isDev(reader.username)) throw new HttpError(403, "Only the developers can remove a story");
  const { count } = await prisma.story.deleteMany({ where: { id: String(req.params.id) } });
  if (count === 0) throw notFound("Story");
  res.status(204).end();
});
