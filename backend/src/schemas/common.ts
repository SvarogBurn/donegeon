import { z } from "zod";
import { MAX_POINTS } from "../../../shared/constants.js";
import { isLocalDate } from "../../../shared/dates.js";

/** The pieces the requests are checked with, shared by every router: one rule, one message each. */

export const id = z.string().uuid();

/** A calendar day of the user's, "YYYY-MM-DD". */
export const localDate = z.string().refine(isLocalDate, "Dates must look like 2026-10-02");

/** "#rrggbb", kept as written (the character's colours). */
export const hex = z.string().regex(/^#[0-9a-f]{6}$/i, "A colour looks like #5b6ee1");

/** "#rrggbb" in lower case, or null for the thing's own colour (a list's, a folder's). */
export const color = hex.transform((value) => value.toLowerCase()).nullable();

/** An amount of points: a task's, a list's, Today's. */
export const points = z.number().int().min(0, "Points can't be negative").max(MAX_POINTS);

/** A name that must not be empty. */
export const name = (max: number) => z.string().trim().min(1, "Name is required").max(max);

/** Goals or tags put on a task. */
export const labelIds = z.array(id).max(50);

/** A place among siblings, counted from 0. */
export const index = z.number().int().min(0);
