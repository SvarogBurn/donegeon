import { useLayoutEffect, useRef, type KeyboardEvent, type Ref } from "react";
import { toggleMarker } from "../../lib/markup";
import { enterOnLine, itemPrefix } from "../../lib/noteText";

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Leaving the field: the owner saves it. `stop`: Escape was pressed, so writing is over. */
  onDone: (stop: boolean) => void;
  ref?: Ref<HTMLTextAreaElement>;
  className?: string;
  /** What the field is called; a task's note by default. */
  label?: string;
}

const MARKER_KEYS: Record<string, string> = { b: "**", i: "*", u: "__" };

/**
 * Writing a task's note: grows with what is written. Enter makes a new line, and on a list item ("* ", "- ",
 * "1. ") the next item; Enter on an empty item ends the list. Tab / Shift+Tab move an item a level in or out.
 * Ctrl+B / I / U put markup around the selection as in a title. Leaving the field saves it; Escape saves and stops.
 * Not a task editor, so ↑ / ↓ between titles step over it.
 */
export function NoteEditor({ value, onChange, onDone, ref, className = "", label = "Task note" }: Props) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const stop = useRef(false);
  /** Where the caret goes once a change made by a key is in the field. */
  const selectAfter = useRef<[start: number, end: number] | null>(null);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    if (selectAfter.current) el.setSelectionRange(...selectAfter.current);
    selectAfter.current = null;
  }, [value]);

  function change(text: string, start: number, end = start) {
    selectAfter.current = [start, end];
    onChange(text);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) return;
    const el = e.currentTarget;
    const { selectionStart: start, selectionEnd: end } = el;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = value.indexOf("\n", start) < 0 ? value.length : value.indexOf("\n", start);
    const line = value.slice(lineStart, lineEnd);

    const marker = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey ? MARKER_KEYS[e.key.toLowerCase()] : undefined;
    if (marker) {
      e.preventDefault();
      const marked = toggleMarker(value, start, end, marker);
      if (marked.text.length <= el.maxLength) change(marked.text, marked.start, marked.end);
    } else if (e.key === "Escape") {
      e.preventDefault();
      // Saved once, by leaving the field.
      stop.current = true;
      el.blur();
    } else if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && start === end) {
      const enter = enterOnLine(line);
      if (!enter) return;
      e.preventDefault();
      if ("endList" in enter) change(value.slice(0, lineStart) + value.slice(lineEnd), lineStart);
      else change(value.slice(0, start) + "\n" + enter.next + value.slice(end), start + 1 + enter.next.length);
    } else if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey && itemPrefix(line) !== null) {
      e.preventDefault();
      if (!e.shiftKey) return change(value.slice(0, lineStart) + "  " + value.slice(lineStart), start + 2, end + 2);
      const out = line.match(/^ {1,2}|^\t/)?.[0].length ?? 0;
      change(value.slice(0, lineStart) + value.slice(lineStart + out), Math.max(lineStart, start - out), Math.max(lineStart, end - out));
    }
  }

  return (
    <textarea
      ref={(el) => {
        innerRef.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      rows={3}
      maxLength={5000}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => {
        onDone(stop.current);
        stop.current = false;
      }}
      placeholder={"Note. * or - starts a list"}
      aria-label={label}
      className={`note-paper ${className}`}
    />
  );
}
