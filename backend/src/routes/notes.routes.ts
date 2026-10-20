import { Router } from "express";
import { z } from "zod";
import { alreadyMade } from "../lib/clientId.js";
import { needsRestore } from "../lib/deleted.js";
import { notFound } from "../lib/httpError.js";
import { prisma } from "../lib/prisma.js";
import { userId } from "../middleware/requireAuth.js";
import { color, id, name } from "../schemas/common.js";
import { nextPosition } from "../services/ordering.service.js";
import { ownNote, ownNoteFolder } from "../services/ownership.js";

const title = z.string().trim().max(100);
const text = z.string().max(5000);

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
const noteFolderInput = z.object({ name: name(60).optional(), color: color.optional() });

/** A folder named for a note must be the user's own. */
async function checkFolder(owner: string, noteFolderId: string | null | undefined) {
  if (noteFolderId) await ownNoteFolder(owner, noteFolderId);
}

/**
 * Notes of their own, not on any task: the Notes page. They can be put in the page's own folders (NoteFolder),
 * and shown in a task bar folder like a list (Folder.views "note:<id>").
 */
export const notesRouter = Router();

notesRouter.get("/", async (req, res) => {
  const owner = userId(req);
  const [notes, noteFolders] = await Promise.all([
    prisma.note.findMany({ where: { userId: owner, deletedAt: null }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
    prisma.noteFolder.findMany({ where: { userId: owner }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
  ]);
  res.json({ notes, noteFolders });
});

// A new note goes first: the newest is at the top until it is moved.
notesRouter.post("/", async (req, res) => {
  const { id: noteId, ...input } = noteInput.parse(req.body);
  const owner = userId(req);
  const made = noteId && alreadyMade(await prisma.note.findUnique({ where: { id: noteId } }), owner);
  if (made) return void res.json({ note: made });
  await checkFolder(owner, input.noteFolderId);
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
  const owner = userId(req);
  const { id: noteId } = await ownNote(owner, req.params.id);
  await checkFolder(owner, data.noteFolderId);
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
  const noteFolder = await prisma.noteFolder.create({
    data: { userId: owner, name: input.name ?? "Folder", color: input.color ?? null, position: await nextPosition(prisma, "noteFolder", owner) },
  });
  res.status(201).json({ noteFolder });
});

notesRouter.patch("/folders/:id", async (req, res) => {
  const input = noteFolderInput.parse(req.body);
  const folder = await ownNoteFolder(userId(req), req.params.id);
  const noteFolder = await prisma.noteFolder.update({ where: { id: folder.id }, data: input });
  res.json({ noteFolder });
});

// Its notes stay, back under "All" (the relation sets their folder to null).
notesRouter.delete("/folders/:id", async (req, res) => {
  const folder = await ownNoteFolder(userId(req), req.params.id);
  await prisma.noteFolder.delete({ where: { id: folder.id } });
  res.status(204).end();
});
