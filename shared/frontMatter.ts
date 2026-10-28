/**
 * The files of the newspaper (news/ at the repo root) start with their settings between two "---" lines, one
 * "key: value" a line, and the text after them:
 *
 *   ---
 *   title: Notifications
 *   commits: 99484ee fcba909
 *   ---
 *   The text, in the markup of a note.
 *
 * Read by the app (the News page) and the server (the story events' dates). A file without the "---" lines is all text.
 */
export interface FrontMatter {
  data: Record<string, string>;
  body: string;
}

export function parseFrontMatter(raw: string): FrontMatter {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  if (lines[0].trim() !== "---") return { data: {}, body: raw.trim() };
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (end === -1) return { data: {}, body: raw.trim() };
  const data: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const colon = line.indexOf(":");
    if (colon <= 0 || line.trimStart().startsWith("#")) continue;
    // A value may be put in quotes, to keep a colon or spaces at its ends.
    data[line.slice(0, colon).trim()] = line.slice(colon + 1).trim().replace(/^"(.*)"$/, "$1");
  }
  return { data, body: lines.slice(end + 1).join("\n").trim() };
}

/** A file's name without its folders and extension: "news/events/2026-11.md" → "2026-11". */
export const fileSlug = (path: string) => path.replace(/^.*\//, "").replace(/\.[^.]*$/, "");
