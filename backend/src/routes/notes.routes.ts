import { Router, type Request } from "express";
import { z } from "zod";
import { OPENS_SEALED_HEADER, SEALED_PREFIX } from "../../../shared/constants.js";
import { alreadyMade } from "../lib/clientId.js";
import { needsRestore } from "../lib/deleted.js";
import { HttpError, notFound } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";
import { userId } from "../middleware/requireAuth.js";
import { color, id, name } from "../schemas/common.js";
import { nextPosition, writeOrder } from "../services/ordering.service.js";
import { ownNote, ownNoteFolder } from "../services/ownership.js";

/**
 * A title or text sealed on the user's devices (Settings › Theme and design › Encrypt notes): its prefix and base64, as
 * long as the longest plain one can come out (3 bytes a character at most, 28 more, a third more again as base64).
 */
const sealed = (plainMax: number) =>
  z.string().max(SEALED_PREFIX.length + Math.ceil((plainMax * 3 + 28) / 3) * 4).regex(new RegExp(`^${SEALED_PREFIX}[A-Za-z0-9+/]+=*$`));
const title = z.union([sealed(100), z.string().trim().max(100)]);
// No limit anyone will reach; only so one request can't be made huge.
const text = z.union([sealed(1_000_000), z.string().max(1_000_000)]);

const SYNC_OVERLAP_MS = 10_000;

const noteInput = z.object({
  // Made on the device for a note written offline; see lib/clientId.
  id: id.optional(),
  title: title.optional(),
  text: text.optional(),
  noteFolderId: id.nullable().optional(),
});
const notePatch = z.object({
  title: title.optional(),
  text: text.optional(),
  noteFolderId: id.nullable().optional(),
});
const noteFolderInput = z.object({ name: name(60).optional(), color: color.optional(), parentId: id.nullable().optional() });

/**
 * Words sealed with the notes key only while the account has one: sent after encryption was turned off on another
 * device, they could never be read again.
 */
async function checkSealed(owner: string, input: { title?: string; text?: string }) {
  if (![input.title, input.text].some((words) => words?.startsWith(SEALED_PREFIX))) return;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: owner }, select: { notesKey: true } });
  if (!user.notesKey) throw new HttpError(409, "Notes encryption was turned off on another device");
}

/**
 * An app from before notes could be encrypted (a device whose service worker is still on an old build) shows sealed words
 * as they are and saves them back as text, after which they could never be opened: while the notes are encrypted, it is
 * refused. Today's app says it opens them (OPENS_SEALED_HEADER), so it costs nothing.
 */
async function checkApp(req: Request) {
  if (req.get(OPENS_SEALED_HEADER)) return;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId(req) }, select: { notesKey: true } });
  if (user.notesKey) throw new HttpError(409, "This version of Donegeon can't read encrypted notes: close it and open it again");
}

/** A folder named for a note must be the user's own. */
async function checkFolder(owner: string, noteFolderId: string | null | undefined) {
  if (noteFolderId) await ownNoteFolder(owner, noteFolderId);
}

/** The folder a note folder is put in must be the user's own, and not the folder itself or one inside it. */
async function checkParent(owner: string, folderId: string | null, parentId: string | null | undefined) {
  if (!parentId) return;
  const folders = await prisma.noteFolder.findMany({ where: { userId: owner }, select: { id: true, parentId: true } });
  const parentOf = new Map(folders.map((f) => [f.id, f.parentId]));
  if (!parentOf.has(parentId)) throw notFound("Note folder");
  // Up from the new parent to the top: meeting the folder on the way would make a loop.
  for (let at: string | null | undefined = parentId, steps = 0; at && steps <= folders.length; at = parentOf.get(at), steps++) {
    if (at === folderId) throw new HttpError(400, "A folder can't go inside itself");
  }
}

/**
 * Notes of their own, not on any task: the Notes page. They can be put in the page's own folders (NoteFolder),
 * and shown in a task bar folder like a list (Folder.views "note:<id>").
 */
export const notesRouter = Router();

/**
 * The notes and the folders. With `since` (the `syncedAt` of the device's last answer), only the notes changed since then,
 * and `ids`: every note there is, in order, so the device drops the ones not in it (deleted, however long ago). The
 * folders always come in full: they are few and small. A note is sent again if it changed in the SYNC_OVERLAP_MS before
 * `since`, so one being saved while the last answer was read isn't missed.
 */
notesRouter.get("/", async (req, res) => {
  const since = z.iso.datetime().optional().parse(req.query.since);
  await checkApp(req);
  const owner = userId(req);
  const syncedAt = new Date();
  const live = { userId: owner, deletedAt: null };
  const order = [{ position: "asc" as const }, { createdAt: "asc" as const }];
  const changed = since ? { updatedAt: { gte: new Date(Date.parse(since) - SYNC_OVERLAP_MS) } } : {};
  const [notes, noteFolders, ids] = await Promise.all([
    prisma.note.findMany({ where: { ...live, ...changed }, orderBy: order }),
    prisma.noteFolder.findMany({ where: { userId: owner }, orderBy: order }),
    since ? prisma.note.findMany({ where: live, orderBy: order, select: { id: true } }) : undefined,
  ]);
  res.json({ notes, noteFolders, syncedAt, ...(ids && { ids: ids.map((note) => note.id) }) });
});

// A new note goes first: the newest is at the top until it is moved.
notesRouter.post("/", async (req, res) => {
  const { id: noteId, ...input } = noteInput.parse(req.body);
  await checkApp(req);
  const owner = userId(req);
  const made = noteId && alreadyMade(await prisma.note.findUnique({ where: { id: noteId } }), owner);
  if (made) return void res.json({ note: made });
  await checkFolder(owner, input.noteFolderId);
  await checkSealed(owner, input);
  const first = await prisma.note.aggregate({ where: { userId: owner, deletedAt: null }, _min: { position: true } });
  const note = await prisma.note.create({
    data: {
      id: noteId,
      userId: owner,
      title: input.title ?? "",
      text: input.text ?? "",
      noteFolderId: input.noteFolderId ?? null,
      position: (first._min.position ?? 1) - 1,
      createdAt: req.clientTime,
    },
  });
  res.status(201).json({ note });
});

notesRouter.patch("/:id", async (req, res) => {
  const data = notePatch.parse(req.body);
  await checkApp(req);
  const owner = userId(req);
  const { id: noteId } = await ownNote(owner, req.params.id);
  await checkFolder(owner, data.noteFolderId);
  await checkSealed(owner, data);
  const note = await prisma.note.update({ where: { id: noteId }, data });
  res.json({ note });
});

// Soft: it can be brought back for a minute. Deleting one already deleted (a change sent twice) is no error.
notesRouter.delete("/:id", async (req, res) => {
  const owner = userId(req);
  const note = await prisma.note.findFirst({ where: { id: req.params.id, userId: owner } });
  if (!note) throw notFound("Note");
  if (!note.deletedAt) await prisma.note.update({ where: { id: note.id }, data: { deletedAt: new Date() } });
  res.status(204).end();
});

notesRouter.post("/:id/restore", async (req, res) => {
  const note = await prisma.note.findFirst({ where: { id: req.params.id, userId: userId(req) } });
  if (!note) throw notFound("Deleted note");
  if (needsRestore(note.deletedAt)) await prisma.note.update({ where: { id: note.id }, data: { deletedAt: null } });
  res.status(204).end();
});

notesRouter.post("/folders", async (req, res) => {
  const input = noteFolderInput.parse(req.body);
  const owner = userId(req);
  await checkParent(owner, null, input.parentId);
  const noteFolder = await prisma.noteFolder.create({
    data: { userId: owner, name: input.name ?? "Folder", color: input.color ?? null, parentId: input.parentId ?? null, position: await nextPosition(prisma, "noteFolder", owner) },
  });
  res.status(201).json({ noteFolder });
});

// The folders dragged into another order: `ids` left to right (the app sends the top-level ones). A folder left out (made
// meanwhile, or a subfolder) keeps its place after them.
notesRouter.put("/folders/order", async (req, res) => {
  const { ids } = z.object({ ids: z.array(id).max(200) }).parse(req.body);
  const folders = await prisma.noteFolder.findMany({
    where: { userId: userId(req) },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, position: true },
  });
  const own = new Set(folders.map((f) => f.id));
  const listed = [...new Set(ids)].filter((folderId) => own.has(folderId));
  const order = [...listed, ...folders.map((f) => f.id).filter((folderId) => !listed.includes(folderId))];
  await writeOrder(prisma, "noteFolderPosition", order, new Map(folders.map((f) => [f.id, f.position])));
  res.status(204).end();
});

// Moved into another folder (`parentId`; null = to the top level), it goes last there.
notesRouter.patch("/folders/:id", async (req, res) => {
  const input = noteFolderInput.parse(req.body);
  const owner = userId(req);
  const folder = await ownNoteFolder(owner, req.params.id);
  const moved = input.parentId !== undefined && input.parentId !== folder.parentId;
  if (moved) await checkParent(owner, folder.id, input.parentId);
  const noteFolder = await prisma.noteFolder.update({
    where: { id: folder.id },
    data: { ...input, ...(moved && { position: await nextPosition(prisma, "noteFolder", owner) }) },
  });
  res.json({ noteFolder });
});

// Its notes and subfolders stay, in the folder it was in (or back under "All").
notesRouter.delete("/folders/:id", async (req, res) => {
  const folder = await ownNoteFolder(userId(req), req.params.id);
  await prisma.$transaction([
    prisma.noteFolder.updateMany({ where: { parentId: folder.id }, data: { parentId: folder.parentId } }),
    prisma.note.updateMany({ where: { noteFolderId: folder.id }, data: { noteFolderId: folder.parentId } }),
    prisma.noteFolder.delete({ where: { id: folder.id } }),
  ]);
  res.status(204).end();
});
