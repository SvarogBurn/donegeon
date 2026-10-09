import { useLayoutEffect, useRef, useState, type KeyboardEvent, type Ref, type TextareaHTMLAttributes } from "react";
import { hasMarkup, toggleMarker } from "../../lib/markup";
import { RichText } from "../RichText";

const EDITOR = "[data-task-editor]";
/** Ctrl (or Cmd) with one of these puts its marker around the selected text, or takes it off. */
const MARKER_KEYS: Record<string, string> = { b: "**", i: "*", u: "__" };

/** Focus with the caret at the end, so typing appends and Delete acts on the task. */
function focusAtEnd(editor: HTMLElement) {
  editor.focus();
  if (editor instanceof HTMLTextAreaElement) editor.setSelectionRange(editor.value.length, editor.value.length);
}

/**
 * Moves focus to the task editor above (-1) or below (+1) `from` in reading
 * order; with `within`, only to one inside that element.
 */
export function focusNeighbor(from: HTMLElement, direction: -1 | 1, within: ParentNode | null = null): boolean {
  const editors = Array.from((within ?? document).querySelectorAll<HTMLElement>(EDITOR));
  const next = editors[editors.indexOf(from) + direction];
  if (!next) return false;
  focusAtEnd(next);
  return true;
}

export function focusTaskEditor(taskId: string) {
  const editor = document.querySelector<HTMLElement>(`[data-task-editor="${taskId}"]`);
  if (editor) focusAtEnd(editor);
}

interface Props extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> {
  value: string;
  onChange: (value: string) => void;
  /** Task id for existing tasks, or any label for add fields; makes the field reachable with the arrow keys. */
  editorId: string;
  ref?: Ref<HTMLTextAreaElement>;
  /** Only as wide as the text (not the whole row), so the space beside it stays free to click. */
  fitText?: boolean;
  /** Asked before any key does anything here; true = the key was used up (by an open dropdown, say). */
  interceptKey?: (e: KeyboardEvent<HTMLTextAreaElement>) => boolean;
}

/**
 * A task title field: grows with its text, Shift+Enter makes a new line, and
 * Up/Down step to the neighbouring task once the caret is on the first/last line.
 * Plain Enter never inserts a line break; the owner decides what it does.
 * Markup (**bold**, *italic*, ... see lib/markup) is typed as it is, or put on with Ctrl+B / Ctrl+I / Ctrl+U; a
 * fitted title shows it styled while the field isn't being typed in.
 */
export function TitleEditor({ value, onChange, editorId, onKeyDown, className = "", ref, fitText = false, interceptKey, onFocus, onBlur, ...rest }: Props) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  /** What to select once a marker put on by key is in the field. */
  const selectAfter = useRef<[start: number, end: number] | null>(null);
  // The styled title is shown in place of the field's own text, which is still what is clicked and typed in.
  const showsStyled = fitText && !isFocused && hasMarkup(value);

  useLayoutEffect(() => {
    if (selectAfter.current) innerRef.current?.setSelectionRange(...selectAfter.current);
    selectAfter.current = null;
  }, [value]);

  useLayoutEffect(() => {
    const el = innerRef.current;
    // A fitted title fills its grid cell, which the invisible copy sizes at any width.
    if (!el || fitText) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, fitText]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Let an input method finish composing before any key means something here.
    if (e.nativeEvent.isComposing || interceptKey?.(e)) return;
    const el = e.currentTarget;
    const plain = !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;

    const marker = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey ? MARKER_KEYS[e.key.toLowerCase()] : undefined;
    if (marker) {
      e.preventDefault();
      const marked = toggleMarker(el.value, el.selectionStart, el.selectionEnd, marker);
      if (marked.text.length > el.maxLength) return;
      selectAfter.current = [marked.start, marked.end];
      onChange(marked.text);
      return;
    }

    if (plain && e.key === "ArrowUp" && !el.value.slice(0, el.selectionStart).includes("\n")) {
      if (focusNeighbor(el, -1)) e.preventDefault();
      return;
    }
    if (plain && e.key === "ArrowDown" && !el.value.slice(el.selectionEnd).includes("\n")) {
      if (focusNeighbor(el, 1)) e.preventDefault();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) e.preventDefault();
    onKeyDown?.(e);
  }

  const textarea = (
    <textarea
      {...rest}
      ref={(el) => {
        innerRef.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      data-task-editor={editorId}
      rows={1}
      enterKeyHint="done"
      maxLength={300}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      onFocus={(e) => {
        setIsFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setIsFocused(false);
        onBlur?.(e);
      }}
      className={`block w-full resize-none overflow-hidden rounded bg-transparent px-1.5 py-1 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-emerald-600/30 dark:focus:bg-stone-950 ${fitText ? "col-start-1 row-start-1 h-full" : ""} ${className} ${showsStyled ? "!text-transparent" : ""}`}
    />
  );
  if (!fitText) return textarea;

  // An invisible copy of the text sizes the grid cell; the textarea fills it. A title with markup is seen in the
  // copy instead, styled, until the field is typed in: then the markers are back to be edited.
  return (
    <div className="inline-grid max-w-full min-w-10 align-top">
      <span
        aria-hidden
        data-styled-title={showsStyled ? "" : undefined}
        className={`pointer-events-none col-start-1 row-start-1 px-1.5 py-1 text-sm break-words whitespace-pre-wrap ${showsStyled ? className : "invisible"}`}
      >
        {showsStyled ? <RichText text={value} /> : value}{" "}
      </span>
      {textarea}
    </div>
  );
}
