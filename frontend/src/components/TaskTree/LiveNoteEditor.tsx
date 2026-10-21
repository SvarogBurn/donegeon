import { defaultKeymap, history, historyKeymap, insertNewline, isolateHistory, redo } from "@codemirror/commands";
import { EditorSelection, EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, placeholder, type Command, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { markupRanges, toggleMarker, type MarkupStyle } from "../../lib/markup";
import { alignLines, alignMark, enterOnLine, itemPrefix, lineMarks } from "../../lib/noteText";
import type { NoteEditorProps } from "./NoteEditor";

const MAX_LENGTH = 5000;

/** How much of the window a phone's keyboard covers (0 without one). */
const keyboardCover = () => (window.visualViewport ? Math.max(0, Math.round(window.innerHeight - window.visualViewport.offsetTop - window.visualViewport.height)) : 0);

/** The text replaced by `text`, as one change (only what differs), with the selection from `start` to `end`: an undo step of its own. */
function replaceWith(view: EditorView, text: string, start: number, end = start) {
  const old = view.state.doc.toString();
  let from = 0;
  while (from < old.length && from < text.length && old[from] === text[from]) from++;
  let oldTo = old.length;
  let newTo = text.length;
  while (oldTo > from && newTo > from && old[oldTo - 1] === text[newTo - 1]) {
    oldTo--;
    newTo--;
  }
  view.dispatch({ changes: { from, to: oldTo, insert: text.slice(from, newTo) }, selection: EditorSelection.range(start, end), scrollIntoView: true, userEvent: "input", annotations: isolateHistory.of("full") });
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
    if (!line.text.trim()) continue;
    const { alignEnd, markEnd, tail, line: read } = lineMarks(line.text);
    if (read.kind === "blank") continue;
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
export default function LiveNoteEditor({ value, onChange, onDone, onFocus, ref, className = "", label = "Task note", bare = false, onSelect, aligner, hint = "Note. * or - starts a list", autoFocus = false }: NoteEditorProps) {
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
          keymap.of([
            { key: "Enter", run: (view) => enterInList(view) || insertNewline(view) },
            { key: "Tab", run: indentItem(false) },
            { key: "Shift-Tab", run: indentItem(true) },
            { key: "Mod-b", run: markWith("**") },
            { key: "Mod-i", run: markWith("*") },
            { key: "Mod-u", run: markWith("__") },
            {
              key: "Escape",
              run: (view) => {
                // Saved once, by leaving the field.
                stop.current = true;
                view.contentDOM.blur();
                return true;
              },
            },
            // Redo as on every system (CodeMirror has it only for Linux; elsewhere it would undo).
            { key: "Mod-Shift-z", run: redo, preventDefault: true },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.lineWrapping,
          EditorState.transactionFilter.of((tr) => (tr.docChanged && tr.newDoc.length > MAX_LENGTH ? [] : tr)),
          EditorView.contentAttributes.of({ "aria-label": label }),
          placeholder(hint),
          // Typing keeps the line being written above a phone's keyboard, with a line to spare.
          EditorView.scrollMargins.of(() => ({ bottom: keyboardCover() + 24 })),
          EditorView.domEventHandlers({
            focus: () => latest.current.onFocus?.(),
            blur: () => {
              if (isGone) return;
              if (host.current) host.current.style.marginBottom = "";
              latest.current.onDone(stop.current);
              stop.current = false;
            },
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) latest.current.onChange(update.state.doc.toString());
            if (update.docChanged || update.selectionSet) latest.current.onSelect?.(update.state.selection.main.from, update.state.selection.main.to);
          }),
          livePreview,
          looks,
        ],
      }),
    });
    view.current = editor;
    if (autoFocus) editor.focus();
    return () => {
      isGone = true;
      editor.destroy();
      view.current = null;
    };
    // Made once; what is written comes back through onChange, and a new value from outside is put in below.
  }, []);

  useImperativeHandle(ref, () => view.current!.contentDOM, []);
  useImperativeHandle(aligner, () => (to) => {
    const editor = view.current;
    if (!editor) return 0;
    const { from, to: end } = editor.state.selection.main;
    const aligned = alignLines(editor.state.doc.toString(), from, end, to);
    replaceWith(editor, aligned.text, aligned.start, aligned.end);
    return aligned.start;
  });

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
      if (bare) host.current.style.marginBottom = editor.hasFocus && keyboardCover() ? `${keyboardCover()}px` : "";
      if (editor.hasFocus) editor.dispatch({ effects: EditorView.scrollIntoView(editor.state.selection.main.head, { y: "nearest", yMargin: 24 }) });
    };
    viewport.addEventListener("resize", fit);
    const editor = view.current;
    editor?.contentDOM.addEventListener("focus", fit);
    return () => {
      viewport.removeEventListener("resize", fit);
      editor?.contentDOM.removeEventListener("focus", fit);
    };
  }, [bare]);

  return <div ref={host} className={`note-editor ${bare ? "" : "note-paper"} ${className}`} />;
}
