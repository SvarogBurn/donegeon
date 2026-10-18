import { HttpError } from "./httpError.js";

/**
 * Rows made offline get their id on the device, and a change waiting there may be sent twice (the connection
 * dropped before the answer came). The row already made under that id is the answer the second time; an id
 * someone else's row has is refused.
 */
export function alreadyMade<T extends { userId: string }>(row: T | null, owner: string): T | null {
  if (row && row.userId !== owner) throw new HttpError(409, "That id is already taken");
  return row;
}
