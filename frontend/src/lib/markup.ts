export type MarkupStyle = "bold" | "italic" | "underline" | "mark" | "strike";

/** A piece of a title: plain text, or a stretch in one style that can hold more styles inside. */
export type MarkupNode = string | { style: MarkupStyle; children: MarkupNode[] };

/** What is typed around a stretch of text to style it. The two-character ones are tried first, so "**" isn't read as two "*". */
export const MARKERS: [marker: string, style: MarkupStyle][] = [
  ["**", "bold"],
  ["__", "underline"],
  ["==", "mark"],
  ["~~", "strike"],
  ["*", "italic"],
];

/** Where the stretch opened at `open` closes: the same marker further on in the line, right after a character that isn't a space. */
function closing(text: string, marker: string, open: number): number {
  for (let at = open + marker.length + 1; at < text.length && text[at] !== "\n"; at++) {
    if (text[at] === "\\") at++;
    else if (text.startsWith(marker, at) && !/\s/.test(text[at - 1])) {
      // "*a **b** c*": the italics don't end at the bold's asterisks.
      if (marker === "*" && (text[at + 1] === "*" || text[at - 1] === "*")) continue;
      // "***a***": the bold ends at the last two asterisks, leaving the first for the italics inside.
      return marker === "**" && text[at + 2] === "*" ? at + 1 : at;
    }
  }
  return -1;
}

/**
 * Reads the markup of a title: **bold**, *italic*, __underline__, ==highlight== and ~~crossed out~~, inside one
 * another too. A marker counts only when it hugs the text (no space inside it) and is closed on the same line;
 * anything else, and whatever has a backslash in front, is text as typed.
 */
export function parseMarkup(text: string): MarkupNode[] {
  const nodes: MarkupNode[] = [];
  let plain = "";
  for (let at = 0; at < text.length; at++) {
    if (text[at] === "\\" && MARKERS.some(([marker]) => marker[0] === text[at + 1])) {
      plain += text[++at];
      continue;
    }
    // An opening marker has text right after it. An asterisk beside another is part of a "**", never italics by itself.
    const found = MARKERS.find(([marker]) => text.startsWith(marker, at) && /\S/.test(text[at + marker.length] ?? " ") && !(marker === "*" && text[at + 1] === "*"));
    const end = found ? closing(text, found[0], at) : -1;
    if (!found || end < 0) {
      plain += text[at];
      continue;
    }
    if (plain) nodes.push(plain);
    plain = "";
    nodes.push({ style: found[1], children: parseMarkup(text.slice(at + found[0].length, end)) });
    at = end + found[0].length - 1;
  }
  if (plain) nodes.push(plain);
  return nodes;
}

/** Whether anything in the title is styled. */
export const hasMarkup = (text: string) => parseMarkup(text).some((node) => typeof node !== "string");

const textOf = (nodes: MarkupNode[]): string => nodes.map((node) => (typeof node === "string" ? node : textOf(node.children))).join("");

/** The title as words only, its markup left out: for labels, tooltips and paths, where nothing can be styled. */
export const plainTitle = (text: string) => textOf(parseMarkup(text));

/**
 * What Ctrl+B and the like do to a field: the selected text gets the marker around it, or loses it if it has it
 * already; with nothing selected the caret ends up between a new pair. Returns the new text and selection.
 */
export function toggleMarker(text: string, start: number, end: number, marker: string): { text: string; start: number; end: number } {
  const size = marker.length;
  /** How many of the marker's character stand in a row at the end of `before` and the start of `after`: "*" is there in a run of 1 or 3, "**" in one of 2 or 3. */
  const has = (before: string, after: string) => {
    const run = Math.min(before.match(new RegExp(`\\${marker[0]}*$`))![0].length, after.match(new RegExp(`^\\${marker[0]}*`))![0].length);
    return size === 1 ? run % 2 === 1 : run >= 2;
  };
  if (has(text.slice(0, start), text.slice(end))) {
    return { text: text.slice(0, start - size) + text.slice(start, end) + text.slice(end + size), start: start - size, end: end - size };
  }
  const picked = text.slice(start, end);
  if (picked.length > 2 * size && has(picked.split("").reverse().join(""), picked) && has(picked, picked.split("").reverse().join(""))) {
    return { text: text.slice(0, start) + picked.slice(size, -size) + text.slice(end), start, end: end - 2 * size };
  }
  return { text: text.slice(0, start) + marker + picked + marker + text.slice(end), start: start + size, end: end + size };
}
