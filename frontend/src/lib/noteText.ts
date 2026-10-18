/**
 * A task's note, line by line: headings (a line starting "# ", "## " or "### "), list items (a line starting "* ",
 * "- " or "1. ", indented by two spaces a level), blank lines, and the lines of text between them. Each line's own
 * words take the title markup (lib/markup).
 */
export type NoteLine =
  | { kind: "text"; text: string }
  | { kind: "blank" }
  /** "####" to "######" are taken too, so pasted markdown reads right, and shown as the smallest ("###"). */
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  /** `number`: a numbered item's own number; none for a bullet. */
  | { kind: "item"; depth: number; number?: number; text: string };

/** Deeper than this is shown as this deep. */
export const MAX_NOTE_DEPTH = 4;

const ITEM = /^(\s*)(?:([*\-•])|(\d{1,3})[.)])\s+(.*)$/;
// "#tag" and a "#" alone are text; so is a line whose "#" has a backslash in front.
const HEADING = /^ {0,3}(#{1,6})\s+(\S.*)$/;

export function parseNote(text: string): NoteLine[] {
  return text.split("\n").map((line): NoteLine => {
    if (!line.trim()) return { kind: "blank" };
    const heading = line.match(HEADING);
    // Markdown's optional closing hashes ("## Plan ##") aren't shown.
    if (heading) return { kind: "heading", level: Math.min(3, heading[1].length) as 1 | 2 | 3, text: heading[2].replace(/\s+#+\s*$/, "") };
    const item = line.match(ITEM);
    if (!item) return { kind: "text", text: line.replace(/^(\s*)\\#/, "$1#") };
    // A tab counts as a level, like two spaces.
    const indent = item[1].replace(/\t/g, "  ").length;
    const depth = Math.min(MAX_NOTE_DEPTH, Math.floor(indent / 2));
    return { kind: "item", depth, number: item[3] === undefined ? undefined : Number(item[3]), text: item[4] };
  });
}

/** The start of a list line: its indent and marker with the space after it ("  * ", "3. "); null for any other line. */
export function itemPrefix(line: string): string | null {
  return line.match(/^\s*(?:[*\-•]|\d{1,3}[.)])\s+/)?.[0] ?? null;
}

/**
 * What Enter does on `line` in the note field: on a list item, the next line starts as the next item (a number
 * counts on); on an item with nothing written after its marker, the marker is taken off and the list ends.
 * Null = an ordinary new line.
 */
export function enterOnLine(line: string): { next: string } | { endList: true } | null {
  const prefix = itemPrefix(line);
  if (prefix === null) return null;
  if (!line.slice(prefix.length).trim()) return { endList: true };
  const number = prefix.match(/\d+/);
  return { next: number ? prefix.replace(/\d+/, String(Number(number[0]) + 1)) : prefix };
}
