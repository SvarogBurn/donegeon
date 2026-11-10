import { defaultKeymap, history, historyKeymap, insertNewline, isolateHistory, redo, undo } from "@codemirror/commands";
import { EditorSelection, EditorState, StateField, Transaction, type Line, type Range, type Text } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, placeholder, runScopeHandlers, type Command, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { markupRanges, parseMarkup, toggleMarker, type MarkupNode, type MarkupStyle } from "../../lib/markup";
import {
  addColumn,
  addRow,
  alignLines,
  alignMark,
  cleanCell,
  clearCells,
  doubledMarker,
  enterOnLine,
  findTables,
  isTableRow,
  isTableShortcut,
  itemPrefix,
  lineMarks,
  moveColumn,
  moveRow,
  newTable,
  placeTable,
  readTable,
  removeColumn,
  removeRow,
  withCell,
  writeTable,
  type NoteTable,
  type TableCells,
} from "../../lib/noteText";
import type { NoteEditorProps } from "./NoteEditor";

const MAX_LENGTH = 5000;

/** How much of the window a phone's keyboard covers (0 without one). */
const keyboardCover = () => (window.visualViewport ? Math.max(0, Math.round(window.innerHeight - window.visualViewport.offsetTop - window.visualViewport.height)) : 0);

/** The change that turns `old`, standing at `at` in the note, into `text`: only what differs. */
function changeTo(old: string, text: string, at = 0) {
  let from = 0;
  while (from < old.length && from < text.length && old[from] === text[from]) from++;
  let oldTo = old.length;
  let newTo = text.length;
  while (oldTo > from && newTo > from && old[oldTo - 1] === text[newTo - 1]) {
    oldTo--;
    newTo--;
  }
  return { from: at + from, to: at + oldTo, insert: text.slice(from, newTo) };
}

/** The text replaced by `text`, as one change (only what differs), with the selection from `start` to `end`: an undo step of its own. */
function replaceWith(view: EditorView, text: string, start: number, end = start) {
  view.dispatch({ changes: changeTo(view.state.doc.toString(), text), selection: EditorSelection.range(start, end), scrollIntoView: true, userEvent: "input", annotations: isolateHistory.of("full") });
}

/** Enter on a list item: the next item, or (on an empty one) the end of the list. Elsewhere, an ordinary new line. */
const enterInList: Command = (view) => {
  const { main } = view.state.selection;
  if (!main.empty) return false;
  const line = view.state.doc.lineAt(main.head);
  const enter = enterOnLine(line.text);
  if (!enter) return false;
  if ("endList" in enter) view.dispatch({ changes: { from: line.from, to: line.to }, selection: { anchor: line.from }, scrollIntoView: true, userEvent: "input" });
  else view.dispatch({ ...view.state.replaceSelection("\n" + enter.next), scrollIntoView: true, userEvent: "input" });
  return true;
};

/** Enter (or a space) at the end of a line that reads "//table": the line becomes a new table, its first cell written in. */
const typedTable: Command = (view) => {
  const { main } = view.state.selection;
  const line = view.state.doc.lineAt(main.head);
  if (!main.empty || main.head !== line.to || !isTableShortcut(line.text)) return false;
  putTable(view, line);
  return true;
};
const tableBySpace = EditorView.inputHandler.of((view, from, to, text) => text === " " && from === to && typedTable(view));

/** A space typed after a marker that doubles the one Enter carried on ("* * "): the line keeps one. */
const oneMarker = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== " ") return false;
  const line = view.state.doc.lineAt(from);
  const typed = line.text.slice(0, from - line.from) + text + line.text.slice(to - line.from);
  const fixed = doubledMarker(typed);
  if (fixed === null) return false;
  view.dispatch({ changes: { from: line.from, to: line.to, insert: fixed }, selection: { anchor: line.from + fixed.length }, userEvent: "input" });
  return true;
});

/** Tab / Shift+Tab on a list item: a level in or out (the indent after its alignment mark, if it has one). */
const indentItem =
  (out: boolean): Command =>
  (view) => {
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    if (itemPrefix(line.text) === null) return false;
    const at = line.from + alignMark(line.text).length;
    if (!out) view.dispatch({ changes: { from: at, insert: "  " }, userEvent: "input" });
    else {
      const size = view.state.doc.sliceString(at, line.to).match(/^ {1,2}|^\t/)?.[0].length ?? 0;
      if (size) view.dispatch({ changes: { from: at, to: at + size }, userEvent: "delete" });
    }
    return true;
  };

/** Ctrl+B / I / U: markup around the selection, as in a title. */
const markWith =
  (marker: string): Command =>
  (view) => {
    const { from, to } = view.state.selection.main;
    const marked = toggleMarker(view.state.doc.toString(), from, to, marker);
    replaceWith(view, marked.text, marked.start, marked.end);
    return true;
  };

/** A list item's bullet or number, standing in for its marker while the line isn't being written in. */
class ItemMarker extends WidgetType {
  constructor(
    readonly number: number | undefined,
    readonly width: string,
  ) {
    super();
  }
  eq(other: ItemMarker) {
    return other.number === this.number && other.width === this.width;
  }
  toDOM() {
    const marker = document.createElement("span");
    marker.className = "cm-note-item";
    marker.style.width = this.width;
    if (this.number !== undefined) marker.textContent = `${this.number}.`;
    else marker.append(Object.assign(document.createElement("span"), { className: "note-bullet" }));
    return marker;
  }
  ignoreEvent() {
    return false;
  }
}

const STYLE_CLASS: Record<MarkupStyle, string> = { bold: "markup-bold", italic: "markup-italic", underline: "underline", strike: "line-through", mark: "cm-note-highlight" };
const hidden = Decoration.replace({});
/** A mark shown while it is being written at: faint. */
const faint = Decoration.mark({ class: "cm-note-mark" });

/**
 * The note as it reads, line by line: headings, list items, alignment and markup styled, and the marks that make them
 * hidden, except on the lines the caret or the selection is on (their own marks) and around the stretch it is in
 * (markup's). Out of the field, all of it reads as written.
 */
function readAsWritten(view: EditorView): DecorationSet {
  const { state } = view;
  const focused = view.hasFocus;
  const touches = (from: number, to: number) => focused && state.selection.ranges.some((range) => range.from <= to && range.to >= from);
  const marks: Range<Decoration>[] = [];
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    // A table's rows are its grid's (see TableWidget).
    if (!line.text.trim() || isTableRow(line.text)) continue;
    const { alignEnd, markEnd, tail, line: read } = lineMarks(line.text);
    if (read.kind === "blank" || read.kind === "table") continue;
    const writing = touches(line.from, line.to);
    const classes: string[] = [];
    if (read.align) classes.push(read.align === "center" ? "text-center" : "text-right");
    if (read.kind === "heading") classes.push("cm-note-heading", `note-heading-${read.level}`);
    // A list item hangs from its marker: wrapped lines start under its text, not under the bullet.
    const markerWidth = read.kind === "item" ? (read.number === undefined ? "1.25rem" : `${String(read.number).length + 1.5}ch`) : "";
    const hanging = read.kind === "item" && !writing ? `padding-left: calc(${read.depth * 1.25}rem + ${markerWidth}); text-indent: calc(-1 * ${markerWidth})` : "";
    if (classes.length || hanging) marks.push(Decoration.line({ class: classes.join(" "), attributes: hanging ? { style: hanging } : undefined }).range(line.from));

    if (markEnd > 0) {
      if (writing) marks.push(faint.range(line.from, line.from + markEnd));
      else if (read.kind === "item") {
        if (alignEnd) marks.push(hidden.range(line.from, line.from + alignEnd));
        marks.push(Decoration.replace({ widget: new ItemMarker(read.number, markerWidth) }).range(line.from + alignEnd, line.from + markEnd));
      } else marks.push(hidden.range(line.from, line.from + markEnd));
    }
    if (tail < line.text.length) marks.push((writing ? faint : hidden).range(line.from + tail, line.to));

    for (const range of markupRanges(line.text.slice(markEnd, tail), line.from + markEnd)) {
      marks.push(Decoration.mark({ class: STYLE_CLASS[range.style] }).range(range.from + range.size, range.to - range.size));
      const marker = touches(range.from, range.to) ? faint : hidden;
      marks.push(marker.range(range.from, range.from + range.size), marker.range(range.to - range.size, range.to));
    }
  }
  return Decoration.set(marks, true);
}

const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = readAsWritten(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.focusChanged || update.viewportChanged) this.decorations = readAsWritten(update.view);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/** A table in the note: where its first row starts and its last ends, and how it reads. */
interface TableSpot {
  from: number;
  to: number;
  table: NoteTable;
}

/** The table whose first row starts at `from`; null if there is none. */
function tableFrom(doc: Text, from: number): TableSpot | null {
  let line = doc.lineAt(from);
  if (line.from !== from || !isTableRow(line.text)) return null;
  const lines = [line.text];
  while (line.number < doc.lines && isTableRow(doc.line(line.number + 1).text)) {
    line = doc.line(line.number + 1);
    lines.push(line.text);
  }
  return { from, to: line.to, table: readTable(lines) };
}

/** A table's grid being drawn anew: the field taken away with it isn't the cell, or the note, being left. */
let redrawing = false;

/** `run` (a change the table makes itself) with its grid, or a cell's field, taken away and drawn again: not leaving. */
function quietly(run: () => void) {
  const was = redrawing;
  redrawing = true;
  try {
    run();
  } finally {
    redrawing = was;
  }
}

/** The cell being written in, in each editor: its table's start, its row and column, and its field. */
const openCells = new WeakMap<EditorView, { from: number; row: number; column: number; area: HTMLTextAreaElement }>();

/** A table's grid on the page, found by where the table starts (only drawn while near the screen). */
const tableDom = (view: EditorView, from: number) => Array.from(view.contentDOM.querySelectorAll<HTMLElement>(".cm-note-table")).find((dom) => view.posAtDOM(dom) === from);

/**
 * The table changed to `table` (null: taken out, with its line). A cell being typed in (`step` false) joins the typing
 * around it in one undo step; anything else is a step of its own.
 */
function rewrite(view: EditorView, spot: TableSpot, table: NoteTable | null, step = true) {
  const { doc } = view.state;
  if (table) {
    quietly(() => view.dispatch({ changes: changeTo(doc.sliceString(spot.from, spot.to), writeTable(table), spot.from), userEvent: step ? "input" : "input.type.cell", annotations: step ? isolateHistory.of("full") : [] }));
    return;
  }
  const [from, to] = spot.to < doc.length ? [spot.from, spot.to + 1] : [Math.max(0, spot.from - 1), spot.to];
  quietly(() => view.dispatch({ changes: { from, to }, selection: { anchor: from }, userEvent: "delete", annotations: isolateHistory.of("full") }));
  view.focus();
}

/** The caret to the line before the table (`down` false) or after it, made if the note has none there. */
function leaveTable(view: EditorView, spot: TableSpot, down: boolean) {
  const { doc } = view.state;
  if (down) view.dispatch(spot.to < doc.length ? { selection: { anchor: spot.to + 1 } } : { changes: { from: spot.to, insert: "\n" }, selection: { anchor: spot.to + 1 }, userEvent: "input" });
  else view.dispatch(spot.from > 0 ? { selection: { anchor: spot.from - 1 } } : { changes: { from: 0, insert: "\n" }, selection: { anchor: 0 }, userEvent: "input" });
  view.focus();
}

const MARKUP_TAG: Record<MarkupStyle, [tag: string, className: string]> = { bold: ["b", "markup-bold"], italic: ["i", "markup-italic"], underline: ["u", ""], strike: ["s", ""], mark: ["mark", "cm-note-highlight"] };
/** Markup as the page's elements, as RichText draws it. */
const markupDom = (nodes: MarkupNode[]): Node[] =>
  nodes.map((node) => {
    if (typeof node === "string") return document.createTextNode(node);
    const [tag, className] = MARKUP_TAG[node.style];
    const element = document.createElement(tag);
    element.className = className;
    element.append(...markupDom(node.children));
    return element;
  });

/** Where a cell's words go: beside its handles (see fillTable). */
const wordsOf = (cell: HTMLElement) => cell.querySelector<HTMLElement>(":scope > .cm-note-words") ?? cell;

/** A cell as it reads (an empty one keeps its row's height). */
function fillCell(cell: HTMLElement, text: string) {
  cell.dataset.text = text;
  wordsOf(cell).replaceChildren(...(text ? markupDom(parseMarkup(text)) : [document.createTextNode("​")]));
}

/** The handles on a table's edges: a row's at its left, a column's above it, the whole table's at its corner. */
const HANDLES = {
  row: { label: (n: number) => `Row ${n}`, title: "Select this row (Shift: and the rows to it). Drag to move it" },
  column: { label: (n: number) => `Column ${n}`, title: "Select this column (Shift: and the columns to it). Drag to move it" },
  table: { label: () => "Table", title: "Select the table. Drag to move it in the note" },
} as const;

/** The table's handle's picture: an arrow four ways, in pixels drawn two to one (a row's or column's is a circle, by its CSS). */
const MOVE_ARROWS = [[4, 0, 1, 1], [3, 1, 3, 1], [4, 2, 1, 5], [3, 7, 3, 1], [4, 8, 1, 1], [0, 4, 1, 1], [1, 3, 1, 3], [2, 4, 5, 1], [7, 3, 1, 3], [8, 4, 1, 1]];
function moveIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [name, value] of Object.entries({ viewBox: "0 0 9 9", width: 18, height: 18, "shape-rendering": "crispEdges", fill: "currentColor", "aria-hidden": "true" })) svg.setAttribute(name, String(value));
  for (const [x, y, width, height] of MOVE_ARROWS) {
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    for (const [name, value] of Object.entries({ x, y, width, height })) rect.setAttribute(name, String(value));
    svg.append(rect);
  }
  return svg;
}

function handle(kind: keyof typeof HANDLES, index: number) {
  const button = Object.assign(document.createElement("button"), { type: "button", tabIndex: -1, className: `cm-note-handle cm-note-handle-${kind}`, title: HANDLES[kind].title });
  if (kind === "table") button.append(moveIcon());
  button.dataset.handle = kind;
  button.dataset.index = String(index);
  button.setAttribute("aria-label", `Select: ${HANDLES[kind].label(index + 1)}`);
  return button;
}

const COLUMN_ALIGN = { center: "text-center", right: "text-right" } as const;

/** A table's rows drawn in its grid, every cell knowing its row and column. */
function fillTable(grid: HTMLTableElement, { header, aligns, rows }: NoteTable) {
  const row = (cells: string[], r: number) => {
    const tr = document.createElement("tr");
    tr.append(
      ...cells.map((text, c) => {
        const cell = document.createElement(header && r === 0 ? "th" : "td");
        if (header && r === 0) cell.setAttribute("scope", "col");
        cell.dataset.row = String(r);
        cell.dataset.column = String(c);
        cell.className = aligns[c] ? COLUMN_ALIGN[aligns[c]] : "";
        const words = document.createElement("div");
        words.className = "cm-note-words";
        cell.append(words);
        if (c === 0) cell.append(handle("row", r));
        if (r === 0) cell.append(handle("column", c));
        if (r === 0 && c === 0) cell.append(handle("table", 0));
        fillCell(cell, text);
        return cell;
      }),
    );
    return tr;
  };
  const body = document.createElement("tbody");
  body.append(...rows.slice(header ? 1 : 0).map((cells, i) => row(cells, i + (header ? 1 : 0))));
  if (!header) return grid.replaceChildren(body);
  const head = document.createElement("thead");
  head.append(row(rows[0], 0));
  grid.replaceChildren(head, body);
}

/** A cell's field as tall as its words. */
function fitArea(area: HTMLTextAreaElement) {
  area.style.height = "auto";
  area.style.height = `${area.scrollHeight}px`;
}

/** Whether the field holds one line, so ↑ / ↓ go straight to the row above or below. */
function isOneLine(area: HTMLTextAreaElement) {
  const style = getComputedStyle(area);
  return area.scrollHeight < 1.8 * (parseFloat(style.lineHeight) || 1.2 * parseFloat(style.fontSize));
}

/**
 * Writing in a table's cell: a field takes the cell's place, with the caret at `caret` (its end by default). Taken out
 * of the table's size, the nearest cell. Another cell's field goes as this one comes.
 */
function openCell(view: EditorView, from: number, row: number, column: number, caret?: number) {
  const spot = tableFrom(view.state.doc, from);
  const dom = spot && tableDom(view, from);
  if (!spot || !dom) return;
  row = Math.max(0, Math.min(row, spot.table.rows.length - 1));
  column = Math.max(0, Math.min(column, spot.table.aligns.length - 1));
  const cell = dom.querySelector<HTMLElement>(`[data-row="${row}"][data-column="${column}"]`);
  if (!cell) return;
  const area = document.createElement("textarea");
  area.className = "cm-note-cell";
  area.rows = 1;
  area.cols = 1;
  area.enterKeyHint = "next";
  area.value = spot.table.rows[row][column];
  area.setAttribute("aria-label", `Table, row ${row + 1}, column ${column + 1}`);
  // As wide as the cell was, so the column doesn't shrink under it.
  const style = getComputedStyle(cell);
  area.style.minWidth = `${cell.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)}px`;
  openCells.set(view, { from, row, column, area });
  wordsOf(cell).replaceChildren(area);
  fitArea(area);
  cellEvents(view, area, row, column);
  area.focus();
  area.setSelectionRange(caret ?? area.value.length, caret ?? area.value.length);
}

/** The table the field is in, as it is now. */
const spotOf = (view: EditorView, area: HTMLElement) => {
  const dom = area.closest<HTMLElement>(".cm-note-table");
  return dom && tableFrom(view.state.doc, view.posAtDOM(dom));
};

/** What is typed in the field put in its cell. Not taken (the note would be too long), the field goes back to the cell. */
function writeCell(view: EditorView, area: HTMLTextAreaElement, row: number, column: number, step = false) {
  const spot = spotOf(view, area);
  if (!spot) return;
  rewrite(view, spot, withCell(spot.table, row, column, area.value), step);
  const now = tableFrom(view.state.doc, spot.from)?.table.rows[row]?.[column];
  if (now !== undefined && now !== cleanCell(area.value)) area.value = now;
}

const CELL_MARKS: Record<string, string> = { b: "**", i: "*", u: "__" };

/**
 * A cell's field: what is typed goes into the note at once. Tab / Shift+Tab: the next cell or the one before (Tab in the
 * last makes a row); Enter: the cell below (on the last row, a new row); ↑ / ↓ the row above or below, and off the
 * table to the line before or after it; ← / → at the field's start or end, the cell before or after. Ctrl+B / I / U
 * mark as in the text, Ctrl+Z / Y undo and redo the note, Escape stops writing. Left, it reads as written again.
 */
function cellEvents(view: EditorView, area: HTMLTextAreaElement, row: number, column: number) {
  const go = (spot: TableSpot, r: number, c: number, caret?: number) => {
    const { rows } = spot.table;
    if (r < 0) return leaveTable(view, spot, false);
    if (r >= rows.length) return leaveTable(view, spot, true);
    openCell(view, spot.from, r, c, caret);
  };
  const grow = (spot: TableSpot, r: number, c: number) => {
    rewrite(view, spot, addRow(spot.table, spot.table.rows.length));
    openCell(view, spot.from, r, c);
  };
  area.addEventListener("input", () => {
    // Pasted lines: one line in a cell.
    if (area.value.includes("\n")) {
      const at = area.selectionStart;
      area.value = area.value.replace(/\n/g, " ");
      area.setSelectionRange(at, at);
    }
    fitArea(area);
    writeCell(view, area, row, column);
  });
  area.addEventListener("beforeinput", (e) => {
    if (e.inputType !== "insertLineBreak" && e.inputType !== "insertParagraph") return;
    // A phone's Enter key: as Enter.
    e.preventDefault();
    area.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
  area.addEventListener("keydown", (e) => {
    const spot = spotOf(view, area);
    if (!spot || e.isComposing) return;
    const { rows, aligns } = spot.table;
    const last = { row: rows.length - 1, column: aligns.length - 1 };
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    const atStart = area.selectionStart === 0 && area.selectionEnd === 0;
    const atEnd = area.selectionStart === area.value.length && area.selectionEnd === area.value.length;
    const plain = !mod && !e.altKey;
    if (e.key === "Escape") runScopeHandlers(view, e, "editor");
    else if (mod && !e.altKey && key === "z") quietly(() => (e.shiftKey ? redo : undo)(view));
    else if (mod && !e.altKey && key === "y") quietly(() => redo(view));
    else if (mod && !e.altKey && !e.shiftKey && CELL_MARKS[key]) {
      const marked = toggleMarker(area.value, area.selectionStart, area.selectionEnd, CELL_MARKS[key]);
      area.value = marked.text;
      area.setSelectionRange(marked.start, marked.end);
      writeCell(view, area, row, column, true);
    } else if (e.key === "Tab" && plain && e.shiftKey) {
      if (column > 0) go(spot, row, column - 1);
      else if (row > 0) go(spot, row - 1, last.column);
    } else if (e.key === "Tab" && plain) {
      if (column < last.column) go(spot, row, column + 1);
      else if (row < last.row) go(spot, row + 1, 0);
      else grow(spot, row + 1, 0);
    } else if (e.key === "Enter" && plain) {
      if (row < last.row) go(spot, row + 1, column);
      else grow(spot, row + 1, column);
    } else if (e.key === "ArrowUp" && plain && !e.shiftKey && (atStart || isOneLine(area))) go(spot, row - 1, column);
    else if (e.key === "ArrowDown" && plain && !e.shiftKey && (atEnd || isOneLine(area))) go(spot, row + 1, column);
    else if (e.key === "ArrowLeft" && plain && !e.shiftKey && atStart) {
      if (column > 0) go(spot, row, column - 1);
      else go(spot, row - 1, last.column);
    } else if (e.key === "ArrowRight" && plain && !e.shiftKey && atEnd) {
      if (column < last.column) go(spot, row, column + 1, 0);
      else go(spot, row + 1, 0, 0);
    } else return;
    e.preventDefault();
  });
  area.addEventListener("blur", () => {
    // Taken away as its table was drawn again: it is opened again (see `cellsKept`).
    if (redrawing || !area.isConnected) return;
    if (openCells.get(view)?.area === area) openCells.delete(view);
    // Once the focus is where it went: taken out now, the field would leave from nowhere, and the editor couldn't
    // tell going to another cell from leaving.
    setTimeout(() => {
      const cell = area.closest<HTMLElement>("td, th");
      if (!cell || document.activeElement === area) return;
      fillCell(cell, spotOf(view, area)?.table.rows[row]?.[column] ?? cleanCell(area.value));
    });
  });
}

type PickKind = "row" | "column" | "table";
type Corner = { row: number; column: number };
/**
 * What is selected in each editor's table (its grid has the focus, not a cell): a block of cells, `asked` as it was
 * picked (a row taken out and brought back by Ctrl+Z is selected again, not the one before it), and the corner it was
 * picked from, which Shift+click stretches it from.
 */
const picks = new WeakMap<EditorView, { dom: HTMLElement; from: number; cells: TableCells; asked: TableCells; anchor: Corner }>();

/** The cells from one corner to the other, whichever way round. */
const between = (a: Corner, b: Corner): TableCells => ({ top: Math.min(a.row, b.row), left: Math.min(a.column, b.column), bottom: Math.max(a.row, b.row), right: Math.max(a.column, b.column) });

/** A row's cells (`kind` row, rows `from` to `to`), a column's, or the whole table's. */
function blockOf(table: NoteTable, kind: PickKind, from: number, to = from): TableCells {
  const last = { row: table.rows.length - 1, column: table.aligns.length - 1 };
  if (kind === "row") return { top: Math.min(from, to), bottom: Math.max(from, to), left: 0, right: last.column };
  if (kind === "column") return { top: 0, bottom: last.row, left: Math.min(from, to), right: Math.max(from, to) };
  return { top: 0, left: 0, bottom: last.row, right: last.column };
}

/** The whole note's text replaced by `text` (a table moved): one change of what differs, an undo step of its own. */
function replaceNote(view: EditorView, text: string) {
  quietly(() => view.dispatch({ changes: changeTo(view.state.doc.toString(), text), userEvent: "move", annotations: isolateHistory.of("full") }));
}

/**
 * A block of cells selected (highlighted, and its grid given the focus, so the keys below act on it): the cell being
 * written in closes. Called again after every change, as rows and columns may have moved.
 */
function pick(view: EditorView, from: number, cells: TableCells, anchor: Corner = { row: cells.top, column: cells.left }) {
  const spot = tableFrom(view.state.doc, from);
  const dom = spot && tableDom(view, from);
  if (!spot || !dom) return;
  const fit = (at: number, last: number) => Math.max(0, Math.min(at, last));
  const rows = spot.table.rows.length - 1;
  const columns = spot.table.aligns.length - 1;
  const shown = { top: fit(cells.top, rows), bottom: fit(cells.bottom, rows), left: fit(cells.left, columns), right: fit(cells.right, columns) };
  picks.set(view, { dom, from, cells: shown, asked: cells, anchor: { row: fit(anchor.row, rows), column: fit(anchor.column, columns) } });
  paint(dom, shown, spot.table);
  if (document.activeElement !== dom) dom.focus({ preventScroll: true });
}

/** The selection's highlight (none: `cells` null); a row's, a column's or the table's handle shows pressed when all of it is in. */
function paint(dom: HTMLElement, cells: TableCells | null, table?: NoteTable) {
  const has = (r: number, c: number) => Boolean(cells && r >= cells.top && r <= cells.bottom && c >= cells.left && c <= cells.right);
  for (const cell of dom.querySelectorAll<HTMLElement>("[data-row]")) cell.classList.toggle("cm-note-picked", has(Number(cell.dataset.row), Number(cell.dataset.column)));
  const wide = Boolean(cells && table && cells.left === 0 && cells.right === table.aligns.length - 1);
  const tall = Boolean(cells && table && cells.top === 0 && cells.bottom === table.rows.length - 1);
  for (const button of dom.querySelectorAll<HTMLElement>("[data-handle]")) {
    const at = Number(button.dataset.index);
    const pressed = button.dataset.handle === "table" ? wide && tall : button.dataset.handle === "row" ? wide && has(at, cells!.left) : tall && has(cells!.top, at);
    button.setAttribute("aria-pressed", String(pressed));
  }
}

/**
 * The keys on a selection: Delete takes out the rows (or columns) it covers whole, or else empties its cells; Backspace
 * only empties them. Escape, Tab or Enter go back to writing in its first cell. Ctrl+Z / Y undo and redo the note.
 */
function pickKeys(view: EditorView, e: KeyboardEvent) {
  const picked = picks.get(view);
  const spot = picked && tableFrom(view.state.doc, picked.from);
  if (!picked || !spot || e.target !== picked.dom) return;
  const { cells, anchor } = picked;
  const { table } = spot;
  const mod = e.ctrlKey || e.metaKey;
  const again = (block: TableCells) => pick(view, spot.from, block, anchor);
  if (e.key === "Escape" || e.key === "Tab" || e.key === "Enter") openCell(view, spot.from, cells.top, cells.left);
  else if (mod && !e.altKey && (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")) {
    quietly(() => (e.key.toLowerCase() === "z" && !e.shiftKey ? undo : redo)(view));
    if (tableFrom(view.state.doc, spot.from)) again(picked.asked);
    else view.focus();
  } else if (e.key === "Delete" || e.key === "Backspace") {
    const wide = cells.left === 0 && cells.right === table.aligns.length - 1;
    const tall = cells.top === 0 && cells.bottom === table.rows.length - 1;
    const next =
      e.key === "Backspace" || (!wide && !tall)
        ? clearCells(table, cells)
        : wide
          ? removeRow(table, cells.top, cells.bottom - cells.top + 1)
          : removeColumn(table, cells.left, cells.right - cells.left + 1);
    rewrite(view, spot, next);
    if (next) again(cells);
  } else return;
  e.preventDefault();
}

/**
 * Cells swept with the mouse (pressed in one, let go in another): the block between them selected, as it is swept. A
 * press let go in the same cell is a click.
 */
function sweepCells(view: EditorView, dom: HTMLElement, first: HTMLElement) {
  const corner = { row: Number(first.dataset.row), column: Number(first.dataset.column) };
  let swept = false;
  const onMove = (e: PointerEvent) => {
    const cell = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>("td, th");
    if (!cell || !dom.contains(cell)) return;
    const end = { row: Number(cell.dataset.row), column: Number(cell.dataset.column) };
    if (!swept && end.row === corner.row && end.column === corner.column) return;
    swept = true;
    e.preventDefault();
    pick(view, view.posAtDOM(dom), between(corner, end), corner);
  };
  const onUp = () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    // The click that ends a sweep isn't one on a cell.
    if (swept) dom.dataset.swept = "";
  };
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
}

/** What scrolls the editor: the nearest box around it that scrolls, else the page. */
function scrollerOf(element: HTMLElement): Element {
  for (let at = element.parentElement; at; at = at.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(at).overflowY) && at.scrollHeight > at.clientHeight) return at;
  }
  return document.scrollingElement ?? document.documentElement;
}

/** The line where a dragged row (above / below a row) or column (left / right of a column) will go. */
const DROP_MARKS = ["cm-note-drop-before", "cm-note-drop-after", "cm-note-drop-left", "cm-note-drop-right"];

/**
 * A handle pressed: let go where it was, it selects its row, column or table; dragged, it moves it, to where a blue line
 * shows (rows and columns among their own, by the middle of each; the table before or after a line of the note).
 */
function dragHandle(view: EditorView, dom: HTMLElement, button: HTMLElement, down: PointerEvent) {
  const kind = button.dataset.handle as PickKind;
  const index = Number(button.dataset.index);
  const start = { x: down.clientX, y: down.clientY };
  let dragging = false;
  // Rows and columns: where it would go (before which one); the table: before which line of the note.
  let target: number | null = null;
  const line = Object.assign(document.createElement("div"), { className: "cm-note-drop-line" });
  const clear = () => {
    line.remove();
    for (const marked of dom.querySelectorAll(DROP_MARKS.map((mark) => `.${mark}`).join())) marked.classList.remove(...DROP_MARKS);
  };
  const cellsAlong = () =>
    kind === "row" ? Array.from(dom.querySelectorAll<HTMLElement>('[data-column="0"]')) : Array.from(dom.querySelectorAll<HTMLElement>('[data-row="0"]'));
  // The table held near the top or bottom of what scrolls: it scrolls on, so the table goes anywhere in a long note.
  const scroller = scrollerOf(view.dom);
  let pointer = start;
  let frame = 0;
  const scroll = () => {
    const box = scroller === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
    const speed = pointer.y < box.top + 56 ? -12 : pointer.y > box.bottom - 56 ? 12 : 0;
    if (speed) {
      scroller.scrollBy(0, speed);
      onMove({ clientX: pointer.x, clientY: pointer.y });
    }
    frame = requestAnimationFrame(scroll);
  };
  const onMove = (e: { clientX: number; clientY: number }) => {
    pointer = { x: e.clientX, y: e.clientY };
    if (!dragging && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 4) return;
    if (!dragging && kind === "table") frame = requestAnimationFrame(scroll);
    dragging = true;
    clear();
    if (kind === "table") {
      const { doc } = view.state;
      const block = view.lineBlockAtHeight(e.clientY - view.documentTop);
      const isBefore = e.clientY < view.documentTop + block.top + block.height / 2;
      target = isBefore ? doc.lineAt(block.from).number - 1 : doc.lineAt(block.to).number;
      const top = view.documentTop + block.top + (isBefore ? 0 : block.height) - view.dom.getBoundingClientRect().top;
      line.style.top = `${top - 1}px`;
      view.dom.append(line);
      return;
    }
    const cells = cellsAlong();
    const middle = (cell: HTMLElement) => {
      const box = cell.getBoundingClientRect();
      return kind === "row" ? box.top + box.height / 2 : box.left + box.width / 2;
    };
    const at = kind === "row" ? e.clientY : e.clientX;
    target = cells.findIndex((cell) => at < middle(cell));
    if (target < 0) target = cells.length;
    const marked = target < cells.length ? cells[target] : cells[cells.length - 1];
    const which = DROP_MARKS[(kind === "row" ? 0 : 2) + (target < cells.length ? 0 : 1)];
    for (const cell of dom.querySelectorAll<HTMLElement>(`[data-${kind}="${marked.dataset[kind]}"]`)) cell.classList.add(which);
  };
  const onUp = () => {
    button.removeEventListener("pointermove", onMove);
    button.removeEventListener("pointerup", onUp);
    button.removeEventListener("pointercancel", onUp);
    cancelAnimationFrame(frame);
    clear();
    const spot = tableFrom(view.state.doc, view.posAtDOM(dom));
    if (!spot) return;
    if (!dragging || target === null) {
      // Shift: the rows (or columns) from the one selected before to this one.
      const picked = picks.get(view);
      if (down.shiftKey && picked?.dom === dom && kind !== "table") {
        return pick(view, spot.from, blockOf(spot.table, kind, kind === "row" ? picked.anchor.row : picked.anchor.column, index), picked.anchor);
      }
      const block = blockOf(spot.table, kind, index);
      return pick(view, spot.from, block, { row: block.top, column: block.left });
    }
    if (kind === "table") {
      const moved = placeTable(view.state.doc.toString(), spot.from, spot.to, target);
      if (moved.from !== spot.from || moved.text !== view.state.doc.toString()) replaceNote(view, moved.text);
      return pick(view, moved.from, blockOf(spot.table, "table", 0));
    }
    // Taken out first, the places after it are one less.
    const to = target > index ? target - 1 : target;
    if (to !== index) rewrite(view, spot, kind === "row" ? moveRow(spot.table, index, to) : moveColumn(spot.table, index, to));
    pick(view, spot.from, blockOf(spot.table, kind, to));
  };
  button.setPointerCapture(down.pointerId);
  button.addEventListener("pointermove", onMove);
  button.addEventListener("pointerup", onUp);
  button.addEventListener("pointercancel", onUp);
}

/** The buttons under a table being written in: what each does to the table (by the cells selected), and which cell is written in after. */
const TABLE_BUTTONS: { name: string; title: string; run: (table: NoteTable, cells: TableCells) => [NoteTable | null, number, number] }[] = [
  { name: "+ Row", title: "A new row under this one", run: (table, { bottom, left }) => [addRow(table, bottom + 1), bottom + 1, left] },
  { name: "+ Column", title: "A new column right of this one", run: (table, { top, right }) => [addColumn(table, right + 1), top, right + 1] },
  { name: "− Row", title: "Takes this row out (or the rows selected)", run: (table, { top, bottom, left }) => [removeRow(table, top, bottom - top + 1), top, left] },
  { name: "− Column", title: "Takes this column out (or the columns selected)", run: (table, { top, left, right }) => [removeColumn(table, left, right - left + 1), top, left] },
  { name: "Header", title: "The first row as the table's header", run: (table, { top, left }) => [{ ...table, header: !table.header }, top, left] },
  { name: "Delete table", title: "Takes the whole table out", run: () => [null, 0, 0] },
];

const shapeOf = ({ header, rows, aligns }: NoteTable) => `${header}:${rows.length}x${aligns.length}`;

/**
 * A table, always a grid to write in: a tap on a cell writes there (see openCell), and while one is written in, the
 * table's buttons show under it. CodeMirror leaves what happens in it alone; each change goes into the note's text.
 */
class TableWidget extends WidgetType {
  constructor(readonly table: NoteTable) {
    super();
  }
  eq(other: TableWidget) {
    return writeTable(other.table) === writeTable(this.table);
  }
  toDOM(view: EditorView) {
    const dom = document.createElement("div");
    dom.className = "cm-note-table";
    const wrap = document.createElement("div");
    wrap.className = "note-table-wrap";
    const grid = document.createElement("table");
    grid.className = "note-table";
    wrap.append(grid);
    const bar = document.createElement("div");
    bar.className = "cm-note-table-bar";
    bar.append(
      ...TABLE_BUTTONS.map(({ name, title, run }) => {
        const button = Object.assign(document.createElement("button"), { type: "button", className: "btn-quiet font-pixel text-[8px]", textContent: name, title });
        if (name === "Header") button.dataset.header = "";
        button.addEventListener("click", () => {
          const spot = tableFrom(view.state.doc, view.posAtDOM(dom));
          if (!spot) return;
          const open = openCells.get(view);
          const picked = picks.get(view);
          // The cells selected, else the cell being written in, else the last row.
          const last = spot.table.rows.length - 1;
          const cells = picked?.dom === dom ? picked.cells : open && dom.contains(open.area) ? between(open, open) : { top: last, bottom: last, left: 0, right: 0 };
          const [table, row, column] = run(spot.table, cells);
          rewrite(view, spot, table);
          if (table) openCell(view, spot.from, row, column);
        });
        return button;
      }),
    );
    dom.append(wrap, bar);
    // Focused while a row, a column or the table is selected (see pick).
    dom.tabIndex = -1;
    dom.addEventListener("keydown", (e) => pickKeys(view, e));
    dom.addEventListener("focusout", (e) => {
      if (e.target !== dom || picks.get(view)?.dom !== dom) return;
      picks.delete(view);
      paint(dom, null);
    });
    dom.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const button = (e.target as HTMLElement).closest<HTMLElement>("[data-handle]");
      if (button) {
        e.preventDefault();
        return dragHandle(view, dom, button, e);
      }
      // With a mouse, cells are swept to select them (a finger scrolls instead; it has the handles).
      const cell = (e.target as HTMLElement).closest<HTMLElement>("td, th");
      if (cell && e.pointerType === "mouse" && !e.shiftKey) sweepCells(view, dom, cell);
    });
    // Kept where it is (in the cell being written in): a tap on a cell opens it once it's a click, a button acts.
    dom.addEventListener("mousedown", (e) => {
      const target = e.target as HTMLElement;
      if ((!target.closest("textarea") || e.shiftKey) && target.closest("td, th, button")) e.preventDefault();
    });
    dom.addEventListener("click", (e) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>("td, th");
      const swept = dom.dataset.swept !== undefined;
      delete dom.dataset.swept;
      if (!cell || swept || (e.target as HTMLElement).closest("[data-handle]")) return;
      const at = { row: Number(cell.dataset.row), column: Number(cell.dataset.column) };
      // Shift+click: the cells from the one being written in (or the selection's corner) to this one.
      const open = openCells.get(view);
      const picked = picks.get(view);
      const anchor = picked?.dom === dom ? picked.anchor : open && dom.contains(open.area) ? { row: open.row, column: open.column } : null;
      if (e.shiftKey && anchor) return pick(view, view.posAtDOM(dom), between(anchor, at), anchor);
      if (!cell.querySelector("textarea")) openCell(view, view.posAtDOM(dom), at.row, at.column);
    });
    this.updateDOM(dom);
    return dom;
  }
  /** Drawn again in place: the cell being written in keeps its field (and the caret), unless the table's shape changed. */
  updateDOM(dom: HTMLElement) {
    const grid = dom.querySelector("table")!;
    dom.querySelector<HTMLElement>("[data-header]")?.setAttribute("aria-pressed", String(this.table.header));
    if (dom.dataset.shape !== shapeOf(this.table)) {
      dom.dataset.shape = shapeOf(this.table);
      quietly(() => fillTable(grid, this.table));
      return true;
    }
    for (const cell of grid.querySelectorAll<HTMLElement>("[data-row]")) {
      const align = this.table.aligns[Number(cell.dataset.column)];
      const text = this.table.rows[Number(cell.dataset.row)][Number(cell.dataset.column)];
      // Only its place: a selection's highlight stays.
      cell.classList.remove(...Object.values(COLUMN_ALIGN));
      if (align) cell.classList.add(COLUMN_ALIGN[align]);
      const area = cell.querySelector("textarea");
      if (area && cleanCell(area.value) !== text) {
        area.value = text;
        fitArea(area);
      } else if (!area && cell.dataset.text !== text) fillCell(cell, text);
    }
    return true;
  }
  ignoreEvent() {
    return true;
  }
}

/** The tables among the lines from `from` to `to` and any table they're in or next to: their grids, and the stretch read. */
function tablesIn(doc: Text, from: number, to: number) {
  let first = doc.lineAt(from);
  let last = doc.lineAt(to);
  while (first.number > 1 && isTableRow(doc.line(first.number - 1).text)) first = doc.line(first.number - 1);
  while (last.number < doc.lines && isTableRow(doc.line(last.number + 1).text)) last = doc.line(last.number + 1);
  const grids = findTables(doc.sliceString(first.from, last.to)).map(({ from, to, table }) => Decoration.replace({ block: true, widget: new TableWidget(table) }).range(first.from + from, first.from + to));
  return { from: first.from, to: last.to, grids };
}

/**
 * The note's tables, each drawn as its grid in place of its lines (a field: grids that take whole lines can't come from
 * a plugin). A change reads again only the lines it touched, and the tables around them; the caret steps over a grid.
 * A row being typed ("| a | b |", `typing`: its line's start) stays text, its table with it, while the caret is on its
 * line: its first closing "|" would make it a grid before the rest of it is written.
 */
const tables = StateField.define<{ grids: DecorationSet; typing: number | null }>({
  create: (state) => ({ grids: Decoration.set(tablesIn(state.doc, 0, state.doc.length).grids), typing: null }),
  update({ grids, typing }, tr) {
    let from = tr.newDoc.length;
    let to = 0;
    if (tr.docChanged) {
      grids = grids.map(tr.changes);
      if (typing !== null) typing = tr.changes.mapPos(typing);
      tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
        from = Math.min(from, fromB);
        to = Math.max(to, toB);
      });
    }
    const line = tr.newDoc.lineAt(tr.newSelection.main.head);
    // (Typing in a grid's cell is typing too, for undo, but not on a row.)
    const isTyped = tr.docChanged && tr.isUserEvent("input.type") && !tr.isUserEvent("input.type.cell") && isTableRow(line.text);
    const next = isTyped || (typing === line.from && isTableRow(line.text)) ? line.from : null;
    // The caret gone off the row typed: its table is read again, now as a grid.
    if (typing !== null && next === null) {
      from = Math.min(from, typing);
      to = Math.max(to, typing);
    }
    if (from > to) return { grids, typing: next };
    const read = tablesIn(tr.newDoc, from, to);
    const add = next === null ? read.grids : read.grids.filter((grid) => grid.from > next || grid.to < next);
    return { grids: grids.update({ filterFrom: read.from, filterTo: read.to, filter: () => false, add }), typing: next };
  },
  provide: (field) => [EditorView.decorations.from(field, (value) => value.grids), EditorView.atomicRanges.of((view) => view.state.field(field).grids)],
});

/** The grid a position is at (from its first row's start to its last row's end); null where there is none. */
function gridAt(state: EditorState, at: number) {
  let found: { from: number; to: number } | null = null;
  state.field(tables).grids.between(at, at, (from, to) => void (found = { from, to }));
  return found as { from: number; to: number } | null;
}

/**
 * The cell being written in, kept: drawn again (its table changed shape, undone or redone), it is opened again where
 * it was. And the caret, come to rest on a table (← / → from beside it, a click at its edge, a row's closing "|"
 * typed): the nearest cell is written in instead, or under a table that ends the note, a new line.
 */
const cellsKept = EditorView.updateListener.of((update) => {
  const { view, state } = update;
  const open = openCells.get(view);
  // (Something put at the table's very start is its own: an alignment mark.)
  if (open && update.docChanged) open.from = update.changes.mapPos(open.from, -1);
  if (open && !open.area.isConnected) {
    const caret = open.area.selectionStart;
    queueMicrotask(() => {
      if (openCells.get(view) !== open || open.area.isConnected) return;
      openCells.delete(view);
      if (tableFrom(view.state.doc, open.from)) openCell(view, open.from, open.row, open.column, caret);
      else view.focus();
    });
    return;
  }
  const { main } = state.selection;
  if (!view.hasFocus || !main.empty || !(update.selectionSet || update.docChanged || update.focusChanged)) return;
  const grid = gridAt(state, main.head);
  if (!grid) return;
  queueMicrotask(() => {
    if (!view.hasFocus || view.state.selection.main.head !== main.head || view.state.doc !== state.doc) return;
    const from = grid.from;
    const spot = tableFrom(state.doc, from);
    if (!spot) return;
    if (main.head === state.doc.length) view.dispatch({ changes: { from: spot.to, insert: "\n" }, selection: { anchor: spot.to + 1 }, annotations: Transaction.addToHistory.of(false) });
    else if (main.head === spot.from) openCell(view, from, 0, 0, 0);
    else openCell(view, from, spot.table.rows.length - 1, spot.table.aligns.length - 1);
  });
});

/** ↓ / ↑ from the line just above or below a table: into its first or last row (not while a long line still wraps on). */
const intoTable =
  (down: boolean): Command =>
  (view) => {
    const { state } = view;
    const { main } = state.selection;
    if (!main.empty) return false;
    const line = state.doc.lineAt(main.head);
    const next = line.number + (down ? 1 : -1);
    if (next < 1 || next > state.doc.lines || !isTableRow(state.doc.line(next).text)) return false;
    const moved = view.moveVertically(main, down).head;
    if (moved !== main.head && moved >= line.from && moved <= line.to) return false;
    const grid = gridAt(state, state.doc.line(next).from);
    const spot = grid && tableFrom(state.doc, grid.from);
    if (!spot) return false;
    openCell(view, spot.from, down ? 0 : spot.table.rows.length - 1, 0);
    return true;
  };

/**
 * Backspace at the start of the line after a table (`back`), or Delete at the end of the line before one: an empty
 * line goes, any other line stays and the table's nearest cell is written in. A table is never taken out a key at a time.
 */
const besideTable =
  (back: boolean): Command =>
  (view) => {
    const { state } = view;
    const { main } = state.selection;
    const line = state.doc.lineAt(main.head);
    const next = line.number + (back ? -1 : 1);
    if (!main.empty || main.head !== (back ? line.from : line.to) || next < 1 || next > state.doc.lines || !isTableRow(state.doc.line(next).text)) return false;
    if (!line.text && (back ? line.number < state.doc.lines : line.number > 1)) {
      const changes = back ? { from: line.from, to: line.to + 1 } : { from: line.from - 1, to: line.to };
      view.dispatch({ changes, selection: { anchor: changes.from }, userEvent: "delete" });
      return true;
    }
    const grid = gridAt(state, state.doc.line(next).from);
    const spot = grid && tableFrom(state.doc, grid.from);
    if (!spot) return false;
    if (back) openCell(view, spot.from, spot.table.rows.length - 1, spot.table.aligns.length - 1);
    else openCell(view, spot.from, 0, 0, 0);
    return true;
  };

/**
 * A new table put in after the caret's line (in its place, if it is empty or is `over`; after the table whose cell is
 * written in), kept apart from a table just before or after it, with a line under it; its first cell is written in.
 */
function putTable(view: EditorView, over?: Line) {
  const { doc } = view.state;
  const open = over ? undefined : openCells.get(view);
  const spot = open ? tableFrom(doc, open.from) : null;
  const line = over ?? doc.lineAt(spot ? spot.to : view.state.selection.main.head);
  const inPlace = Boolean(over) || (!spot && !line.text.trim());
  const above = inPlace ? (line.number > 1 ? doc.line(line.number - 1) : null) : line;
  const below = line.number < doc.lines ? doc.line(line.number + 1) : null;
  // Two tables one under the other would read as one: a blank line between them.
  const head = (inPlace ? "" : "\n") + (above && isTableRow(above.text) ? "\n" : "");
  const tail = !below || isTableRow(below.text) ? "\n" : "";
  const from = inPlace ? line.from : line.to;
  view.dispatch({ changes: { from, to: line.to, insert: head + writeTable(newTable()) + tail }, selection: { anchor: from }, userEvent: "input", annotations: isolateHistory.of("full") });
  openCell(view, from + head.length, 0, 0);
}
// The page's own font, size and line height; no frame, no padding of its own.
const looks = EditorView.theme({
  "&": { fontFamily: "inherit" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "inherit", overflow: "visible", minHeight: "inherit" },
  ".cm-content": { padding: "0", minHeight: "inherit", caretColor: "currentColor" },
  ".cm-line": { padding: "0" },
});

/**
 * NoteEditor's field (see there): a CodeMirror editor, loaded only when a note is first written in. The note reads as it
 * will look while it is written; only the line being written on (and the markup the caret is in) shows its marks.
 */
export default function LiveNoteEditor({ value, onChange, onDone, onFocus, ref, className = "", label = "Task note", bare = false, onSelect, aligner, tableMaker, hint = "Note. * or - starts a list", autoFocus = false, maxLength = MAX_LENGTH }: NoteEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const stop = useRef(false);
  const latest = useRef({ onChange, onDone, onFocus, onSelect });
  latest.current = { onChange, onDone, onFocus, onSelect };

  useLayoutEffect(() => {
    // Taken away while written in, it loses the focus: that isn't leaving it (nothing to save, no one to tell).
    let isGone = false;
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        selection: EditorSelection.cursor(value.length),
        extensions: [
          history(),
          oneMarker,
          tableBySpace,
          keymap.of([
            { key: "Enter", run: (view) => typedTable(view) || enterInList(view) || insertNewline(view) },
            { key: "Tab", run: indentItem(false) },
            { key: "Shift-Tab", run: indentItem(true) },
            { key: "Mod-b", run: markWith("**") },
            { key: "Mod-i", run: markWith("*") },
            { key: "Mod-u", run: markWith("__") },
            { key: "ArrowDown", run: intoTable(true) },
            { key: "ArrowUp", run: intoTable(false) },
            { key: "Backspace", run: besideTable(true) },
            { key: "Delete", run: besideTable(false) },
            {
              key: "Escape",
              run: (view) => {
                // Saved once, by leaving the field (the text, or a table's cell).
                stop.current = true;
                const active = view.root.activeElement;
                if (active instanceof HTMLElement && view.dom.contains(active)) active.blur();
                return true;
              },
            },
            // Redo as on every system (CodeMirror has it only for Linux; elsewhere it would undo).
            { key: "Mod-Shift-z", run: redo, preventDefault: true },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.lineWrapping,
          EditorState.transactionFilter.of((tr) => (tr.docChanged && tr.newDoc.length > maxLength ? [] : tr)),
          EditorView.contentAttributes.of({ "aria-label": label }),
          placeholder(hint),
          // Typing keeps the line being written above a phone's keyboard, with a line to spare.
          EditorView.scrollMargins.of(() => ({ bottom: keyboardCover() + 24 })),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) latest.current.onChange(update.state.doc.toString());
            if (update.docChanged || update.selectionSet) latest.current.onSelect?.(update.state.selection.main.from, update.state.selection.main.to);
          }),
          livePreview,
          tables,
          cellsKept,
          looks,
        ],
      }),
    });
    view.current = editor;
    // Gone into or out of the field: from the text to a table's cell (or back) is neither. A cell's field taken away
    // as its table is drawn again comes back (see cellsKept), so that isn't leaving either.
    const isInside = (e: FocusEvent) => editor.dom.contains(e.relatedTarget as Node | null);
    const onFocusIn = (e: FocusEvent) => !isInside(e) && latest.current.onFocus?.();
    const onFocusOut = (e: FocusEvent) => {
      if (isGone || redrawing || isInside(e) || !(e.target as Node).isConnected) return;
      if (host.current) host.current.style.marginBottom = "";
      latest.current.onDone(stop.current);
      stop.current = false;
    };
    editor.dom.addEventListener("focusin", onFocusIn);
    editor.dom.addEventListener("focusout", onFocusOut);
    if (autoFocus) editor.focus();
    return () => {
      isGone = true;
      editor.dom.removeEventListener("focusin", onFocusIn);
      editor.dom.removeEventListener("focusout", onFocusOut);
      editor.destroy();
      view.current = null;
    };
    // Made once; what is written comes back through onChange, and a new value from outside is put in below.
  }, []);

  useImperativeHandle(ref, () => view.current!.contentDOM, []);
  useImperativeHandle(aligner, () => (to) => {
    const editor = view.current;
    if (!editor) return 0;
    // In a table (a cell written in, or cells selected): a table isn't aligned, and no line is being written on.
    const { from, to: end } = editor.state.selection.main;
    if (picks.get(editor)?.dom === document.activeElement || openCells.get(editor)?.area === document.activeElement) return from;
    const aligned = alignLines(editor.state.doc.toString(), from, end, to);
    replaceWith(editor, aligned.text, aligned.start, aligned.end);
    return aligned.start;
  });
  useImperativeHandle(tableMaker, () => () => view.current && putTable(view.current));

  // A note changed from outside (not by writing in it here).
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value) editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);

  // A phone's keyboard comes up over the field (or goes): the line being written is brought above it. On a screen of
  // its own (`bare`), the page gets as much room under the text as the keyboard covers, so its last lines can still be
  // scrolled up above it.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const fit = () => {
      const editor = view.current;
      if (!editor || !host.current) return;
      // In the text, or in a table's cell.
      const active = document.activeElement;
      const writing = editor.dom.contains(active);
      if (bare) host.current.style.marginBottom = writing && keyboardCover() ? `${keyboardCover()}px` : "";
      if (editor.hasFocus) editor.dispatch({ effects: EditorView.scrollIntoView(editor.state.selection.main.head, { y: "nearest", yMargin: 24 }) });
      else if (writing && active instanceof HTMLElement) active.scrollIntoView({ block: "nearest" });
    };
    viewport.addEventListener("resize", fit);
    const editor = view.current;
    editor?.dom.addEventListener("focusin", fit);
    return () => {
      viewport.removeEventListener("resize", fit);
      editor?.dom.removeEventListener("focusin", fit);
    };
  }, [bare]);

  return <div ref={host} className={`note-editor ${bare ? "" : "note-paper"} ${className}`} />;
}
