/**
 * A task's note, line by line: headings (a line starting "# ", "## " or "### "), list items (a line starting "* ",
 * "- " or "1. ", indented by two spaces a level), blank lines, and the lines of text between them. Each line's own
 * words take the title markup (lib/markup). In front of all that, "<> " centres a line and ">> " puts it to the right.
 */
export type NoteLine =
  | ({ kind: "text"; text: string } & Aligned)
  | { kind: "blank" }
  /** "####" to "######" are taken too, so pasted markdown reads right, and shown as the smallest ("###"). */
  | ({ kind: "heading"; level: 1 | 2 | 3; text: string } & Aligned)
  /** `number`: a numbered item's own number; none for a bullet. */
  | ({ kind: "item"; depth: number; number?: number; text: string } & Aligned);

/** Where a line stands; none: on the left. */
export type Align = "center" | "right";
interface Aligned {
  align?: Align;
}
const ALIGN_MARKS: Record<Align, string> = { center: "<> ", right: ">> " };
const ALIGN = /^(<>|>>) /;

/** The mark at the start of a line that centres it ("<> ") or puts it right (">> "); "" for a line on the left. */
export const alignMark = (line: string) => line.match(ALIGN)?.[0] ?? "";
const alignOfMark = (mark: string): Align | undefined => (mark ? (mark.startsWith("<>") ? "center" : "right") : undefined);

/** Where the line holding `at` stands (null: on the left). */
export function lineAlign(text: string, at: number): Align | null {
  return alignOfMark(alignMark(text.slice(text.lastIndexOf("\n", at - 1) + 1))) ?? null;
}

/**
 * Every line from `start` to `end` that has something on it put `to` the centre or the right (null: back to the left):
 * the text, and where the selection goes in it (it stays on what it was on).
 */
export function alignLines(text: string, start: number, end: number, to: Align | null): { text: string; start: number; end: number } {
  const mark = to ? ALIGN_MARKS[to] : "";
  let at = 0;
  // How much longer the lines before this one have got.
  let moved = 0;
  let newStart = start;
  let newEnd = end;
  const out = text.split("\n").map((line) => {
    const lineStart = at;
    const lineEnd = at + line.length;
    at = lineEnd + 1;
    const old = alignMark(line);
    // A selection that ends at the very start of a line leaves that line out.
    const touched = lineStart <= end && lineEnd >= start && !(start < end && end === lineStart);
    const next = touched && line.slice(old.length).trim() ? mark + line.slice(old.length) : line;
    const place = (pos: number) =>
      next === line ? pos + moved : lineStart + moved + mark.length + Math.max(0, pos - lineStart - old.length);
    if (start >= lineStart && start <= lineEnd) newStart = place(start);
    if (end >= lineStart && end <= lineEnd) newEnd = place(end);
    moved += next.length - line.length;
    return next;
  });
  return { text: out.join("\n"), start: newStart, end: newEnd };
}

/** Deeper than this is shown as this deep. */
export const MAX_NOTE_DEPTH = 4;

const ITEM = /^(\s*)(?:([*\-•])|(\d{1,3})[.)])\s+(.*)$/;
// "#tag" and a "#" alone are text; so is a line whose "#" has a backslash in front.
const HEADING = /^ {0,3}(#{1,6})\s+(\S.*)$/;

export function parseNote(text: string): NoteLine[] {
  return text.split("\n").map((line): NoteLine => {
    const mark = alignMark(line);
    const parsed = parseLine(line.slice(mark.length));
    return mark && parsed.kind !== "blank" ? { ...parsed, align: alignOfMark(mark) } : parsed;
  });
}

function parseLine(line: string): NoteLine {
  if (!line.trim()) return { kind: "blank" };
  const heading = line.match(HEADING);
  // Markdown's optional closing hashes ("## Plan ##") aren't shown.
  if (heading) return { kind: "heading", level: Math.min(3, heading[1].length) as 1 | 2 | 3, text: heading[2].replace(/\s+#+\s*$/, "") };
  const item = line.match(ITEM);
  // A backslash in front keeps a "#" (or "<>", ">>") as text.
  if (!item) return { kind: "text", text: line.replace(/^(\s*)\\(#|<>|>>)/, "$1$2") };
  // A tab counts as a level, like two spaces.
  const indent = item[1].replace(/\t/g, "  ").length;
  const depth = Math.min(MAX_NOTE_DEPTH, Math.floor(indent / 2));
  return { kind: "item", depth, number: item[3] === undefined ? undefined : Number(item[3]), text: item[4] };
}

/**
 * Where a line's own marks are, to be hidden while it isn't being written in: `alignEnd`, the end of its alignment
 * mark (0 without one); `markEnd`, the end of its heading's hashes or its list item's indent and marker, with the space
 * after (or `alignEnd`); `tail`, where a heading's closing hashes start (the line's length without them). `line`: how
 * it reads (see parseNote).
 */
export function lineMarks(text: string): { alignEnd: number; markEnd: number; tail: number; line: NoteLine } {
  const alignEnd = alignMark(text).length;
  const rest = text.slice(alignEnd);
  const line = parseNote(text)[0];
  const heading = rest.match(HEADING);
  if (heading) {
    const closing = heading[2].match(/\s+#+\s*$/);
    return { alignEnd, markEnd: text.length - heading[2].length, tail: text.length - (closing?.[0].length ?? 0), line };
  }
  const item = rest.match(ITEM);
  return { alignEnd, markEnd: item ? text.length - item[4].length : alignEnd, tail: text.length, line };
}

/**
 * The start of a list line: its indent and marker with the space after it ("  * ", "3. "), after its alignment mark
 * if it has one ("<> - "); null for any other line.
 */
export function itemPrefix(line: string): string | null {
  return line.match(/^(?:(?:<>|>>) )?\s*(?:[*\-•]|\d{1,3}[.)])\s+/)?.[0] ?? null;
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
