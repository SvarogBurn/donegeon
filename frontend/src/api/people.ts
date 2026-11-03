import type { CheerLine } from "../../../shared/constants";
import type { Card, Person } from "../lib/people";
import { api } from "./client";

export interface Named {
  id: string;
  username: string;
}

export interface Friends {
  /** Set to Off: nobody is seen, and the rest is empty. */
  isOff: boolean;
  /** Your own card: what your friends see. */
  me: Person | null;
  friends: Person[];
  /** Those whose answer you're waiting for. */
  sent: Named[];
}

export interface ReceivedCheer {
  id: string;
  username: string;
  line: CheerLine;
  /** The sender's look, off their card. */
  look?: unknown;
}

export interface Inbox {
  requests: Named[];
  cheers: ReceivedCheer[];
}

export const getFriends = () => api<Friends>("/people");
export const getInbox = () => api<Inbox>("/people/inbox");
export const getBlocks = () => api<{ blocks: Named[] }>("/people/blocks").then((r) => r.blocks);

export const putCard = (card: Card) => api("/people/card", { method: "PUT", body: card });

export const askFriend = (username: string) => api<{ status: "sent" | "friends" }>("/people/friends", { body: { username } });
export const acceptFriend = (id: string) => api(`/people/friends/${id}/accept`, { method: "POST" });
export const ignoreFriend = (id: string) => api(`/people/friends/${id}/ignore`, { method: "POST" });
/** Unfriends, or takes your request back. */
export const removeFriend = (id: string) => api(`/people/friends/${id}`, { method: "DELETE" });

export const sendCheer = ({ id, line, face }: { id: string; line: CheerLine; face?: string }) => api(`/people/cheers/${id}`, { body: { line, face } });
/** To every friend not cheered today. */
export const cheerEveryone = ({ line, face }: { line: CheerLine; face?: string }) => api("/people/cheers", { body: { line, face } });
export const markCheersSeen = (ids: string[]) => api("/people/cheers/seen", { body: { ids } });

export const block = (id: string) => api(`/people/blocks/${id}`, { method: "POST" });
export const unblock = (id: string) => api(`/people/blocks/${id}`, { method: "DELETE" });
