import { z } from "zod";
import { CHEER_LINES } from "../../../shared/constants.js";
import { hex, id, localDate } from "./common.js";
import { look } from "./account.js";

const count = z.number().int().min(0).max(1_000_000_000_000);

/**
 * A card, or a part of it, as the owner's app publishes it: the server can't work these out, so it only keeps them to a
 * sane size. There are no rankings, so a made-up number wins nothing.
 */
export const cardPatch = z
  .object({
    level: z.number().int().min(1).max(10_000),
    into: count,
    span: count,
    title: z.string().max(240),
    look,
    activity: z.object({ day: localDate, streak: count, week: count }),
    hearts: z.object({ hp: z.number().min(-1000).max(1000), max: z.number().min(0).max(1000) }),
    stats: z.object({
      day: localDate,
      rows: z.array(z.object({ key: z.string().max(24), value: z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000), text: z.string().max(8).optional(), of: count.optional() })).max(30),
    }),
    skills: z.array(z.object({ name: z.string().max(200), level: z.number().int().min(1).max(10_000), into: count, span: count, color: hex.optional() })).max(30),
  })
  .partial();

/** A friend asked for by the exact username: there is no other way to find anyone. */
export const askInput = z.object({ username: z.string().trim().toLowerCase().min(1).max(32) });

export const cheerInput = z.object({ line: z.enum(CHEER_LINES) });

export const seenInput = z.object({ ids: z.array(id).min(1).max(200) });
