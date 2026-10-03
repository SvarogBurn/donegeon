import { useLayoutEffect, useRef, type KeyboardEvent, type Ref, type TextareaHTMLAttributes } from "react";

const EDITOR = "[data-task-editor]";

/** Focus with the caret at the end, so typing appends and Delete acts on the task. */
function focusAtEnd(editor: HTMLElement) {
  editor.focus();
  if (editor instanceof HTMLTextAreaElement) editor.setSelectionRange(editor.value.length, editor.value.length);
}

/** Moves focus to the task editor above (-1) or below (+1) `from` in reading order. */
export function focusNeighbor(from: HTMLElement, direction: -1 | 1): boolean {
  const editors = Array.from(document.querySelectorAll<HTMLElement>(EDITOR));
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
}

/**
 * A task title field: grows with its text, Shift+Enter makes a new line, and
 * Up/Down step to the neighbouring task once the caret is on the first/last line.
 * Plain Enter never inserts a line break; the owner decides what it does.
 */
export function TitleEditor({ value, onChange, editorId, onKeyDown, className = "", ref, fitText = false, ...rest }: Props) {
  const innerRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Let an input method finish composing before any key means something here.
    if (e.nativeEvent.isComposing) return;
    const el = e.currentTarget;
    const plain = !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;

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
      maxLength={300}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      className={`block w-full resize-none overflow-hidden rounded bg-transparent px-1.5 py-1 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-emerald-600/30 dark:focus:bg-stone-950 ${fitText ? "col-start-1 row-start-1" : ""} ${className}`}
    />
  );
  if (!fitText) return textarea;

  // An invisible copy of the text sizes the grid cell; the textarea fills it.
  return (
    <div className="inline-grid max-w-full min-w-10 align-top">
      <span aria-hidden className="invisible col-start-1 row-start-1 px-1.5 py-1 text-sm break-words whitespace-pre-wrap">
        {value}{" "}
      </span>
      {textarea}
    </div>
  );
}
