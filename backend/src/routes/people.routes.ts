import { Prisma } from "@prisma/client";
import { Router, type Request } from "express";
import { HttpError, notFound } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";
import { userId } from "../middleware/requireAuth.js";
import { id as idSchema } from "../schemas/common.js";
import { askInput, cardPatch, cheerInput, seenInput } from "../schemas/people.js";
import { pushToPerson } from "../services/notifications.service.js";
import { canCheer, cardFor, cardLook, cheerPush, keptOfCard } from "../services/peopleRules.js";

/** All that is ever read of another account: never publicUser, which has every setting. */
const PERSON = { id: true, username: true, peopleOff: true, shares: true, cheersOff: true, card: true } as const;
type PersonRow = Prisma.UserGetPayload<{ select: typeof PERSON }>;

/** How many requests can wait for an answer at a time. */
const MAX_WAITING = 30;

/** One answer for a name that doesn't exist, someone Off and someone who blocked you: none of it is anyone's to find out. */
const couldntAdd = () => new HttpError(404, "Couldn't add that name");

const youreOff = () => new HttpError(409, "You're set to Off in the settings");

export const peopleRouter = Router();

async function reader(req: Request): Promise<PersonRow> {
  const me = await prisma.user.findUnique({ where: { id: userId(req) }, select: PERSON });
  if (!me) throw new HttpError(401, "Not logged in");
  return me;
}

/** The reader, for what can't be done while Off. */
async function onReader(req: Request) {
  const me = await reader(req);
  if (me.peopleOff) throw youreOff();
  return me;
}

const paramId = (req: Request) => idSchema.parse(req.params.id);

/** The key of two people's one row: the lower id first. */
const pairOf = (one: string, other: string) => (one < other ? { userA: one, userB: other } : { userA: other, userB: one });
const pairKey = (one: string, other: string) => ({ userA_userB: pairOf(one, other) });
const otherOf = (row: { userA: string; userB: string }, me: string) => (row.userA === me ? row.userB : row.userA);

const hasBlock = async (one: string, other: string) =>
  (await prisma.block.count({ where: { OR: [{ blockerId: one, blockedId: other }, { blockerId: other, blockedId: one }] } })) > 0;

/** How one person stands to another. */
async function relationOf(one: string, other: string) {
  const [row, isBlocked] = await Promise.all([prisma.friendship.findUnique({ where: pairKey(one, other) }), hasBlock(one, other)]);
  return { isFriend: Boolean(row?.acceptedAt), isBlocked };
}

/** Who a reader knows: asked for once and used for every card on a page, instead of once per card. */
async function linksOf(me: string, day: string) {
  const [friendships, cheers] = await Promise.all([
    prisma.friendship.findMany({ where: { OR: [{ userA: me }, { userB: me }] } }),
    prisma.cheer.findMany({ where: { fromId: me, day }, select: { toId: true } }),
  ]);
  const friends = friendships.filter((row) => row.acceptedAt).map((row) => otherOf(row, me));
  const waiting = friendships.filter((row) => !row.acceptedAt && !row.withdrawnAt && row.askedById === me).map((row) => otherOf(row, me));
  return { friends: new Set(friends), waiting: new Set(waiting), cheered: new Set(cheers.map((row) => row.toId)) };
}

/** A person as the reader may see them; only what is here leaves the server. */
function shown(person: PersonRow, me: PersonRow, links: Awaited<ReturnType<typeof linksOf>>) {
  return {
    id: person.id,
    username: person.username,
    card: cardFor(person, me),
    canCheer: canCheer(me, person, { isFriend: links.friends.has(person.id), isBlocked: false }),
    hasCheered: links.cheered.has(person.id),
  };
}

// The carousel: your friends, and your own card (what they see), which the box shows once there are any.
peopleRouter.get("/", async (req, res) => {
  const me = await reader(req);
  if (me.peopleOff) return void res.json({ isOff: true, me: null, friends: [], sent: [] });
  const links = await linksOf(me.id, req.localDate);
  const friends = await prisma.user.findMany({ where: { id: { in: [...links.friends] }, peopleOff: false }, select: PERSON, orderBy: { username: "asc" } });
  const sent = await prisma.user.findMany({ where: { id: { in: [...links.waiting] } }, select: { id: true, username: true }, orderBy: { username: "asc" } });
  res.json({ isOff: false, me: shown(me, me, links), friends: friends.map((friend) => shown(friend, me, links)), sent });
});

// The owner's app publishes its card, or a part of it: added to what is there in one statement, so its two publishers
// never undo each other. What isn't shared isn't kept, and nothing is while Off.
peopleRouter.put("/card", async (req, res) => {
  const patch = cardPatch.parse(req.body);
  const me = await reader(req);
  if (!me.peopleOff) {
    await prisma.$executeRaw`UPDATE "User" SET "card" = COALESCE("card", '{}'::jsonb) || ${JSON.stringify(keptOfCard(patch, me.shares))}::jsonb WHERE "id" = ${me.id}`;
  }
  res.status(204).end();
});

// Asks someone to be friends, by the exact username. They have already asked: that's a yes.
peopleRouter.post("/friends", async (req, res) => {
  const { username } = askInput.parse(req.body);
  const me = await onReader(req);
  const target = await prisma.user.findUnique({ where: { username }, select: PERSON });
  if (!target || target.id === me.id || target.peopleOff || (await hasBlock(me.id, target.id))) throw couldntAdd();

  const key = pairKey(me.id, target.id);
  const row = await prisma.friendship.findUnique({ where: key });
  if (row?.acceptedAt) return void res.json({ status: "friends" });
  if (row?.askedById === target.id && !row.withdrawnAt) {
    await prisma.friendship.update({ where: key, data: { acceptedAt: new Date(), ignoredAt: null } });
    return void res.json({ status: "friends" });
  }
  // Theirs, taken back: now it is this person asking.
  if (row?.askedById === target.id) await prisma.friendship.update({ where: key, data: { askedById: me.id, withdrawnAt: null, ignoredAt: null } });
  // Their own, taken back and sent again: waiting as before, and no second push (it could be repeated for ever).
  else if (row) {
    await prisma.friendship.update({ where: key, data: { withdrawnAt: null } });
    return void res.json({ status: "sent" });
  } else {
    const waiting = await prisma.friendship.count({ where: { askedById: me.id, acceptedAt: null, ignoredAt: null, withdrawnAt: null } });
    if (waiting >= MAX_WAITING) throw new HttpError(409, `At most ${MAX_WAITING} requests can wait at a time`);
    // Two people asking each other at the same moment: the second insert finds the first, and is the yes.
    const made = await prisma.friendship.createMany({ data: [{ ...pairOf(me.id, target.id), askedById: me.id }], skipDuplicates: true });
    if (made.count === 0) {
      await prisma.friendship.updateMany({ where: { ...pairOf(me.id, target.id), askedById: target.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
      return void res.json({ status: "friends" });
    }
  }
  res.json({ status: "sent" });
  void pushToPerson(target.id, { title: "Donegeon", body: `${me.username} wants to be friends`, url: "/?bell=1", tag: `friend:${me.id}` });
});

/** A request to the reader that is still open. */
const openRequestTo = (me: string, other: string) => ({ ...pairOf(me, other), askedById: other, acceptedAt: null, withdrawnAt: null });

peopleRouter.post("/friends/:id/accept", async (req, res) => {
  const me = await onReader(req);
  const other = paramId(req);
  const { count } = await prisma.friendship.updateMany({ where: openRequestTo(me.id, other), data: { acceptedAt: new Date(), ignoredAt: null } });
  if (count === 0) throw notFound("Request");
  res.status(204).end();
});

// Stays as a row: it can't be sent again, and the one asking sees it waiting.
peopleRouter.post("/friends/:id/ignore", async (req, res) => {
  const me = await onReader(req);
  const other = paramId(req);
  const { count } = await prisma.friendship.updateMany({ where: openRequestTo(me.id, other), data: { ignoredAt: new Date() } });
  if (count === 0) throw notFound("Request");
  res.status(204).end();
});

// Unfriends, or takes your own request back. Taken back it stays as a row: asking again doesn't push again.
peopleRouter.delete("/friends/:id", async (req, res) => {
  const me = userId(req);
  const other = paramId(req);
  await prisma.$transaction([
    prisma.friendship.deleteMany({ where: { ...pairOf(me, other), acceptedAt: { not: null } } }),
    prisma.friendship.updateMany({ where: { ...pairOf(me, other), askedById: me, acceptedAt: null }, data: { withdrawnAt: new Date() } }),
  ]);
  res.status(204).end();
});

// What the bell shows: requests to answer and cheers not yet read. Nothing while Off.
peopleRouter.get("/inbox", async (req, res) => {
  const me = await reader(req);
  if (me.peopleOff) return void res.json({ requests: [], cheers: [] });
  const [rows, cheers] = await Promise.all([
    prisma.friendship.findMany({
      where: { OR: [{ userA: me.id }, { userB: me.id }], askedById: { not: me.id }, acceptedAt: null, ignoredAt: null, withdrawnAt: null },
      orderBy: { createdAt: "desc" },
    }),
    me.cheersOff
      ? []
      : prisma.cheer.findMany({
          where: { toId: me.id, seenAt: null, from: { peopleOff: false } },
          select: { id: true, line: true, from: { select: { username: true, card: true } } },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
  ]);
  const askers = await prisma.user.findMany({ where: { id: { in: rows.map((row) => row.askedById) }, peopleOff: false }, select: { id: true, username: true } });
  res.json({ requests: askers, cheers: cheers.map(({ from, ...cheer }) => ({ ...cheer, username: from.username, look: cardLook(from.card) })) });
});

// Before /cheers/:id, which it would match.
peopleRouter.post("/cheers/seen", async (req, res) => {
  const { ids } = seenInput.parse(req.body);
  await prisma.cheer.updateMany({ where: { id: { in: ids }, toId: userId(req), seenAt: null }, data: { seenAt: new Date() } });
  res.status(204).end();
});

// To every friend at once, in one tap: leaves out whoever was cheered today, so nobody gets two in a day from one person.
peopleRouter.post("/cheers", async (req, res) => {
  const { line, face } = cheerInput.parse(req.body);
  const me = await onReader(req);
  const links = await linksOf(me.id, req.localDate);
  const friends = await prisma.user.findMany({ where: { id: { in: [...links.friends] }, peopleOff: false }, select: PERSON });
  const left = friends.filter((friend) => canCheer(me, friend, { isFriend: true, isBlocked: false }) && !links.cheered.has(friend.id));
  if (left.length === 0) throw new HttpError(409, "You've already cheered everyone today");
  await prisma.cheer.createMany({ data: left.map((friend) => ({ fromId: me.id, toId: friend.id, day: req.localDate, line })), skipDuplicates: true });
  res.status(201).end();
  for (const friend of left) void pushToPerson(friend.id, cheerPush(me, line, face));
});

// One a day from one person to another (the sender's day).
peopleRouter.post("/cheers/:id", async (req, res) => {
  const { line, face } = cheerInput.parse(req.body);
  const me = await onReader(req);
  const target = await prisma.user.findUnique({ where: { id: paramId(req) }, select: PERSON });
  if (!target || !canCheer(me, target, await relationOf(me.id, target.id))) throw notFound("Person");
  const { count } = await prisma.cheer.createMany({ data: [{ fromId: me.id, toId: target.id, day: req.localDate, line }], skipDuplicates: true });
  if (count === 0) throw new HttpError(409, "You've already cheered them on today");
  res.status(201).end();
  void pushToPerson(target.id, cheerPush(me, line, face));
});

peopleRouter.get("/blocks", async (req, res) => {
  const rows = await prisma.block.findMany({ where: { blockerId: userId(req) }, select: { blocked: { select: { id: true, username: true } } }, orderBy: { createdAt: "desc" } });
  res.json({ blocks: rows.map((row) => row.blocked) });
});

// Everything between the two goes with it.
peopleRouter.post("/blocks/:id", async (req, res) => {
  const me = userId(req);
  const other = paramId(req);
  if (other === me || !(await prisma.user.findUnique({ where: { id: other }, select: { id: true } }))) throw notFound("Person");
  await prisma.$transaction([
    prisma.block.createMany({ data: [{ blockerId: me, blockedId: other }], skipDuplicates: true }),
    prisma.friendship.deleteMany({ where: pairOf(me, other) }),
    prisma.cheer.deleteMany({ where: { OR: [{ fromId: me, toId: other }, { fromId: other, toId: me }] } }),
  ]);
  res.status(204).end();
});

peopleRouter.delete("/blocks/:id", async (req, res) => {
  await prisma.block.deleteMany({ where: { blockerId: userId(req), blockedId: paramId(req) } });
  res.status(204).end();
});
