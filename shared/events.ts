import { isLocalDate } from "./dates.js";
import { fileSlug, parseFrontMatter } from "./frontMatter.js";

/**
 * A story event of the newspaper (news/events/<id>.md): a prompt, the days to write a story on it, and then everyone's
 * stories to read. Shared by the server (which takes stories only while it is open, and shows them only once it is
 * closed) and the News page.
 */
export interface StoryEvent {
  id: string;
  title: string;
  /** The first day to write, "YYYY-MM-DD" in the user's own time. */
  opens: string;
  /** The last day to write; the stories can be read from the day after. */
  closes: string;
  /** About how long a story is meant to be. */
  words: number;
  /** The prompt and any rules, in the markup of a note. */
  prompt: string;
}

export type EventState = "upcoming" | "open" | "closed";

export const STORY_TITLE_MAX = 100;
export const STORY_TEXT_MAX = 20000;
/** About this many words: a story may run half as long again. */
export const storyWordCap = (words: number) => Math.round(words * 1.5);

/** An event from its file; null when its dates are missing or wrong, or its name starts with "_" (a template). */
export function eventFromFile(path: string, raw: string): StoryEvent | null {
  const id = fileSlug(path);
  if (id.startsWith("_")) return null;
  const { data, body } = parseFrontMatter(raw);
  if (!isLocalDate(data.opens) || !isLocalDate(data.closes) || data.closes < data.opens) return null;
  const words = Number(data.words);
  return { id, title: data.title || id, opens: data.opens, closes: data.closes, words: Number.isInteger(words) && words > 0 ? words : 1000, prompt: body };
}

export function eventState(event: Pick<StoryEvent, "opens" | "closes">, today: string): EventState {
  if (today < event.opens) return "upcoming";
  return today <= event.closes ? "open" : "closed";
}

export const countWords = (text: string) => text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
