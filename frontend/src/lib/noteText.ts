/**
 * A task's note, line by line: headings (a line starting "# ", "## " or "### "), list items (a line starting "* ",
 * "- " or "1. ", indented by two spaces a level), blank lines, and the lines of text between them. Each line's own
 * words take the title markup (lib/markup). In front of all that, "<> " centres a line and ">> " puts it to the right.
 * Lines that start and end with "|" make a table together, as one entry (see NoteTable). A line of five dashes or more
 * is a break line across the note.
 */
export type NoteLine =
  | ({ kind: "text"; text: string } & Aligned)
  | { kind: "blank" }
  /** "####" to "######" are taken too, so pasted markdown reads right, and shown as the smallest ("###"). */
  | ({ kind: "heading"; level: 1 | 2 | 3; text: string } & Aligned)
  /** `number`: a numbered item's own number; none for a bullet. */
  | ({ kind: "item"; depth: number; number?: number; text: string } & Aligned)
  /** "-----" (or longer) on a line of its own. */
  | { kind: "rule" }
  | ({ kind: "table" } & NoteTable);

/**
 * A table, written as markdown's: a row a line, "| a | b |", "\|" a "|" inside a cell. A "| --- | --- |" line under
 * the first row makes that row the header; its colons put a column in the centre (":-:") or on the right ("--:").
 * `rows`: each cell's words (markup and all), every row as long as the longest; the header's is the first.
 */
export interface NoteTable {
  header: boolean;
  /** A column's place; none: on the left. */
  aligns: (Align | undefined)[];
  rows: string[][];
}

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
 * Every line from `start` to `end` that has something on it (a table's rows aside) put `to` the centre or the right (null: back to the left):
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
    // A table's row stays as it is: a mark in front of it would make it text. So does a break line, across the note anyway.
    const touched = lineStart <= end && lineEnd >= start && !(start < end && end === lineStart) && !isTableRow(line) && !isRule(line);
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

/** Whether a line is a break line: five dashes or more, nothing else on it but spaces. */
export const isRule = (line: string) => /^\s*-{5,}\s*$/.test(line);

export function parseNote(text: string): NoteLine[] {
  const lines = text.split("\n");
  const out: NoteLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isTableRow(lines[i])) {
      let end = i + 1;
      while (end < lines.length && isTableRow(lines[end])) end++;
      out.push({ kind: "table", ...readTable(lines.slice(i, end)) });
      i = end - 1;
      continue;
    }
    const mark = alignMark(lines[i]);
    const parsed = parseLine(lines[i].slice(mark.length));
    out.push(mark && parsed.kind !== "blank" && parsed.kind !== "rule" ? { ...parsed, align: alignOfMark(mark) } : parsed);
  }
  return out;
}

function parseLine(line: string): Exclude<NoteLine, { kind: "table" }> {
  if (!line.trim()) return { kind: "blank" };
  if (isRule(line)) return { kind: "rule" };
  const heading = line.match(HEADING);
  // Markdown's optional closing hashes ("## Plan ##") aren't shown.
  if (heading) return { kind: "heading", level: Math.min(3, heading[1].length) as 1 | 2 | 3, text: heading[2].replace(/\s+#+\s*$/, "") };
  const item = line.match(ITEM);
  // A backslash in front keeps a "#" (or "<>", ">>", "|") as text.
  if (!item) return { kind: "text", text: line.replace(/^(\s*)\\(#|<>|>>|\|)/, "$1$2") };
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
 * A list marker typed out of habit right after the one Enter carried on ("* " then "* ", "2. " then "2. "): the line
 * with its marker once. Only while nothing else is written on it; null when no marker is doubled.
 */
export function doubledMarker(line: string): string | null {
  const prefix = itemPrefix(line);
  if (prefix === null) return null;
  return /^(?:[*\-•]|\d{1,3}[.)]) $/.test(line.slice(prefix.length)) ? prefix : null;
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

/** Whether a line is a table's row: it starts with "|" (spaces before it at most) and ends with one that isn't "\|". */
export function isTableRow(line: string): boolean {
  const row = line.trim();
  return row.length >= 2 && row[0] === "|" && row.endsWith("|") && !/(^|[^\\])(\\\\)*\\$/.test(row.slice(0, -1));
}

// "| --- | :-: | --: |": the line under a table's header.
const DELIMITER = /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/;
const DELIMITER_OF: Record<Align, string> = { center: ":-:", right: "--:" };

/** A row's cells, trimmed, "\|" read as "|". */
function cellsOf(line: string): string[] {
  const inner = line.trim().slice(1, -1);
  const cells: string[] = [];
  let cell = "";
  for (let at = 0; at < inner.length; at++) {
    if (inner[at] === "\\" && inner[at + 1] === "|") cell += inner[++at];
    else if (inner[at] === "|") cells.push(cell.trim()), (cell = "");
    else cell += inner[at];
  }
  return [...cells, cell.trim()];
}

/** A table's rows as written (every line a table row), as it reads. */
export function readTable(lines: string[]): NoteTable {
  const header = lines.length > 1 && DELIMITER.test(lines[1]);
  const marks = header ? cellsOf(lines[1]) : [];
  const rows = lines.filter((_, i) => !(header && i === 1)).map(cellsOf);
  const width = Math.max(marks.length, ...rows.map((row) => row.length));
  return {
    header,
    aligns: Array.from({ length: width }, (_, i) => (marks[i]?.endsWith(":") ? (marks[i].startsWith(":") ? "center" : "right") : undefined)),
    rows: rows.map((row) => [...row, ...Array<string>(width - row.length).fill("")]),
  };
}

/** What a cell can hold: one line, without the spaces round it. */
export const cleanCell = (text: string) => text.replace(/\s*\n\s*/g, " ").trim();

/** A table written out: "| a | b |" a row, the header's line under the first row if it has one. */
export function writeTable({ header, aligns, rows }: NoteTable): string {
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  const lines = rows.map((row) => line(row.map((cell) => cleanCell(cell).replace(/\|/g, "\\|"))));
  if (header) lines.splice(1, 0, line(aligns.map((place) => (place ? DELIMITER_OF[place] : "---"))));
  return lines.join("\n");
}

/** A line that asks for a new table: "//table" (any case), written on a line of its own. */
export const isTableShortcut = (line: string) => /^\s*\/\/table\s*$/i.test(line);

/** The table the note's table button (or "//table") puts in: a header and a row, two columns, all empty. */
export const newTable = (): NoteTable => ({ header: true, aligns: [undefined, undefined], rows: [["", ""], ["", ""]] });

/** The table with `text` in the cell at `row`, `column`. */
export const withCell = (table: NoteTable, row: number, column: number, text: string): NoteTable => ({
  ...table,
  rows: table.rows.map((cells, r) => (r === row ? cells.map((cell, c) => (c === column ? text : cell)) : cells)),
});

/** `list` with `remove` items taken out at `at` and `add` put in there. */
const spliced = <T>(list: T[], at: number, remove: number, ...add: T[]) => [...list.slice(0, at), ...add, ...list.slice(at + remove)];

/** An empty row put in at `at` (rows.length: at the end). */
export const addRow = (table: NoteTable, at: number): NoteTable => ({ ...table, rows: spliced(table.rows, at, 0, table.aligns.map(() => "")) });

/** An empty column put in at `at`, on the left. */
export const addColumn = (table: NoteTable, at: number): NoteTable => ({
  ...table,
  aligns: spliced(table.aligns, at, 0, undefined),
  rows: table.rows.map((cells) => spliced(cells, at, 0, "")),
});

/** The table without `count` rows from `at` (the header's: the next row is the header); null: those were all its rows. */
export const removeRow = (table: NoteTable, at: number, count = 1): NoteTable | null => (table.rows.length > count ? { ...table, rows: spliced(table.rows, at, count) } : null);

/** The table without `count` columns from `at`; null: those were all its columns. */
export const removeColumn = (table: NoteTable, at: number, count = 1): NoteTable | null =>
  table.aligns.length > count ? { ...table, aligns: spliced(table.aligns, at, count), rows: table.rows.map((cells) => spliced(cells, at, count)) } : null;

/**
 * The tables in a note that have a line from `from` to `to` (the whole note by default): where each starts (its
 * first row's start) and ends (its last row's end), and how it reads. Only those lines are read, so a long note isn't
 * gone through at every change.
 */
export function findTables(text: string, from = 0, to = text.length): { from: number; to: number; table: NoteTable }[] {
  const lineEnd = (at: number) => (text.indexOf("\n", at) + 1 || text.length + 1) - 1;
  // From the start of `from`'s line, back to the start of a table that line is in.
  let at = text.lastIndexOf("\n", from - 1) + 1;
  while (at > 0 && isTableRow(text.slice(at, lineEnd(at)))) {
    const before = text.lastIndexOf("\n", at - 2) + 1;
    if (!isTableRow(text.slice(before, at - 1))) break;
    at = before;
  }
  const tables: { from: number; to: number; table: NoteTable }[] = [];
  while (at <= to) {
    let end = lineEnd(at);
    if (isTableRow(text.slice(at, end))) {
      const lines = [text.slice(at, end)];
      while (end < text.length && isTableRow(text.slice(end + 1, lineEnd(end + 1)))) {
        lines.push(text.slice(end + 1, lineEnd(end + 1)));
        end = lineEnd(end + 1);
      }
      tables.push({ from: at, to: end, table: readTable(lines) });
    }
    if (end >= text.length) break;
    at = end + 1;
  }
  return tables;
}

/** The table with the row at `from` moved to `to` (to the top of a table with a header: the header). */
export function moveRow(table: NoteTable, from: number, to: number): NoteTable {
  return { ...table, rows: spliced(spliced(table.rows, from, 1), to, 0, table.rows[from]) };
}

/** The table with the column at `from` moved to `to`, its place on the line with it. */
export function moveColumn(table: NoteTable, from: number, to: number): NoteTable {
  const move = <T>(list: T[]) => spliced(spliced(list, from, 1), to, 0, list[from]);
  return { ...table, aligns: move(table.aligns), rows: table.rows.map(move) };
}

/** A block of a table's cells: its first and last row, its first and last column. */
export interface TableCells {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** The table with the cells of `block` emptied, its shape kept. */
export const clearCells = (table: NoteTable, { top, left, bottom, right }: TableCells): NoteTable => ({
  ...table,
  rows: table.rows.map((cells, r) => (r < top || r > bottom ? cells : cells.map((cell, c) => (c < left || c > right ? cell : "")))),
});

/** Where line `index` of `lines` starts in their text. */
const startOf = (lines: string[], index: number) => lines.slice(0, index).reduce((at, line) => at + line.length + 1, 0);
/** The number of the line `at` is on. */
const lineOf = (text: string, at: number) => text.slice(0, at).split("\n").length - 1;

/**
 * The table from `from` to `to` (its first row's start, its last row's end) moved to stand before line `before` (the
 * note's line count: at the end). A table row just above or below its new place gets a blank line between, so two tables
 * never run together. The note, and where the table starts in it now.
 */
export function placeTable(text: string, from: number, to: number, before: number): { text: string; from: number } {
  const lines = text.split("\n");
  const first = lineOf(text, from);
  const last = lineOf(text, to);
  if (before >= first && before <= last + 1) return { text, from };
  const rest = [...lines.slice(0, first), ...lines.slice(last + 1)];
  const at = before > last ? before - (last + 1 - first) : before;
  const above = at > 0 && isTableRow(rest[at - 1]) ? [""] : [];
  const below = at < rest.length && isTableRow(rest[at]) ? [""] : [];
  const out = [...rest.slice(0, at), ...above, ...lines.slice(first, last + 1), ...below, ...rest.slice(at)];
  return { text: out.join("\n"), from: startOf(out, at + above.length) };
}
