import { SHARE_KEYS, type ShareKey } from "../../../shared/enums.js";

/**
 * Who sees whom, and what of them: pure, so each rule is tested on its own. People are read through here and nowhere
 * else (routes/people.routes.ts), so a setting narrowed takes effect at once.
 */

/** What the rules need to know of a person. */
export interface Person {
  id: string;
  peopleOff: boolean;
  shares: string[];
  cheersOff: boolean;
}

/** How two people stand. */
export interface Relation {
  isFriend: boolean;
  /** Either has blocked the other. */
  isBlocked: boolean;
}

/** Only friends see each other. Off, you see nobody and nobody sees you (friendships wait for when you're back). */
export function canSee(viewer: Person, target: Person, { isFriend, isBlocked }: Relation) {
  if (viewer.id === target.id) return true;
  return isFriend && !isBlocked && !viewer.peopleOff && !target.peopleOff;
}

/** A cheer goes only between two who see each other and have cheers on: off, none are sent or received. */
export const canCheer = (viewer: Person, target: Person, relation: Relation) =>
  viewer.id !== target.id && canSee(viewer, target, relation) && !viewer.cheersOff && !target.cheersOff;

/** A cheer as a push: its own words are what it says, over the name of who sent it, with their face. A title would cut a long one off. */
export const cheerPush = (sender: { id: string; username: string }, line: string, face?: string) => ({ title: "Donegeon", body: `${line}\n${sender.username}`, url: "/?bell=1", tag: `cheer:${sender.id}`, ...(face && { icon: face }) });

/** What is on every card. */
const BASE = ["level", "into", "span", "title", "look"] as const;

type Card = Record<string, unknown>;

const asCard = (card: unknown): Card => (card && typeof card === "object" ? (card as Card) : {});

/** The look on a card: part of the base, so anyone who may see the card may see it. */
export const cardLook = (card: unknown) => asCard(card).look;

/** The card with only the base and these sections. */
function withSections(card: unknown, sections: readonly string[]): Card {
  const all = asCard(card);
  const keys = [...BASE, ...sections].filter((key) => all[key] !== undefined);
  return Object.fromEntries(keys.map((key) => [key, all[key]]));
}

/** What you show is what you see: a section is on the card only if both share it. */
export const cardFor = (target: { card: unknown; shares: string[] }, viewer: { shares: string[] }) =>
  withSections(target.card, SHARE_KEYS.filter((key) => target.shares.includes(key) && viewer.shares.includes(key)));

/** What may be stored of what the app published: what isn't shared isn't kept. */
export const keptOfCard = (patch: Card, shares: string[]) => withSections(patch, shares);

/** The settings that change what a card may hold. */
export interface CardSettings {
  peopleOff?: boolean;
  shares?: ShareKey[];
  healthOff?: boolean;
}

/**
 * What a change of settings does to the stored card, so what stops being shown is gone rather than only hidden: Off
 * clears it (the app publishes it again when back), a share taken away takes its section, and with health off there
 * are no hearts to share. Skills taken away take the title too: it may be a skill's ("Adept of <skill>"), and the
 * sheet may not be open to publish another. Others then see the rank of the level.
 */
export function afterSettings(before: { shares: string[]; card: unknown; healthOff: boolean }, change: CardSettings) {
  const healthOff = change.healthOff ?? before.healthOff;
  const chosen = change.shares ?? before.shares;
  const shares = SHARE_KEYS.filter((key) => chosen.includes(key) && !(healthOff && key === "hearts"));
  if (change.peopleOff === true || before.card === null) return { shares, card: null };
  const { title, ...kept } = keptOfCard(asCard(before.card), shares);
  return { shares, card: before.shares.includes("skills") && !shares.includes("skills") ? kept : { ...kept, ...(title !== undefined && { title }) } };
}
