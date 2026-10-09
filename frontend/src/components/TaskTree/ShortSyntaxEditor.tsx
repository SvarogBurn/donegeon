import { useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { useSyntaxContext } from "../../hooks/useTasks";
import { activeToken, parseShortSyntax, type Suggestion, type SyntaxToken } from "../../lib/shortSyntax";
import { TitleEditor } from "./TitleEditor";

const CHIP_STYLES: Record<SyntaxToken["kind"], string> = {
  goal: "bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200",
  tag: "bg-white text-stone-600 dark:bg-stone-900 dark:text-stone-300",
  hard: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  soft: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  today: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  repeat: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
  points: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
  list: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
};

/** What the shortcuts typed into a new task will set on it, as chips under the field. Nothing without shortcuts. */
export function SyntaxChips({ tokens, className = "" }: { tokens: SyntaxToken[]; className?: string }) {
  if (tokens.length === 0) return null;
  return (
    <p className={`flex flex-wrap items-center gap-1.5 ${className}`} data-syntax-chips aria-label="What the shortcuts set">
      {tokens.map((token) => (
        <span key={token.start} data-syntax-chip={token.kind} className={`pixel-chip max-w-40 truncate px-2 py-0.5 text-xs ${CHIP_STYLES[token.kind]}`}>
          {token.label}
        </span>
      ))}
    </p>
  );
}

interface Props extends ComponentProps<typeof TitleEditor> {
  /** The task the new one goes under, if any: a subtask can't take every shortcut. */
  parentId?: string | null;
}

/**
 * The title field of a task that is being added. It reads the shortcuts typed into it (#tag, ^goal, @date, ...):
 * while one is being typed a dropdown offers what could finish it (↑ ↓ to move, Enter or Tab to pick, Esc to
 * close), and the chips under the field show what the task will get. Adding the task is the owner's doing, with
 * useAddTask.
 */
export function ShortSyntaxEditor({ parentId, value, onChange, onBlur, onFocus, ref, ...rest }: Props) {
  const ctx = useSyntaxContext(parentId);
  const field = useRef<HTMLTextAreaElement | null>(null);
  const [caret, setCaret] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  /** Where the shortcut starts whose dropdown Esc closed; it stays closed until another shortcut is typed. */
  const [closedAt, setClosedAt] = useState<number | null>(null);
  const [picked, setPicked] = useState(0);
  /** Where the caret goes once a pick is written into the field. */
  const caretAfterPick = useRef<number | null>(null);

  const tokens = useMemo(() => parseShortSyntax(value, ctx).tokens, [value, ctx]);
  const token = useMemo(() => (isFocused ? activeToken(value, Math.min(caret, value.length), ctx) : null), [isFocused, value, caret, ctx]);
  // Nothing to offer once what is typed is all there is to it.
  const options = token && token.start !== closedAt ? token.suggestions : [];
  const isOpen = options.length > 0 && !(options.length === 1 && options[0].insert.toLowerCase() === token!.typed.toLowerCase());
  const at = Math.min(picked, options.length - 1);

  useLayoutEffect(() => {
    if (caretAfterPick.current === null) return;
    field.current?.setSelectionRange(caretAfterPick.current, caretAfterPick.current);
    setCaret(caretAfterPick.current);
    caretAfterPick.current = null;
  }, [value]);

  function pick(option: Suggestion) {
    if (!token) return;
    const end = Math.min(caret, value.length);
    const space = /^\s/.test(value.slice(end)) ? "" : " ";
    caretAfterPick.current = token.start + option.insert.length + 1;
    setPicked(0);
    onChange(value.slice(0, token.start) + option.insert + space + value.slice(end));
  }

  function interceptKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!isOpen || e.altKey || e.ctrlKey || e.metaKey) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      setPicked((at + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
    } else if ((e.key === "Enter" || e.key === "Tab") && !e.shiftKey) {
      // Enter on what is already typed in full adds the task, as it does without a dropdown.
      if (e.key === "Enter" && options[at].insert.toLowerCase() === token!.typed.toLowerCase()) return false;
      pick(options[at]);
    } else if (e.key === "Escape") {
      setClosedAt(token!.start);
    } else return false;
    e.preventDefault();
    return true;
  }

  return (
    <div className="relative">
      <TitleEditor
        {...rest}
        ref={(el) => {
          field.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) ref.current = el;
        }}
        value={value}
        onChange={(next) => {
          setPicked(0);
          setCaret(field.current?.selectionStart ?? next.length);
          onChange(next);
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
        onFocus={(e) => {
          setIsFocused(true);
          setCaret(e.currentTarget.selectionStart);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          setClosedAt(null);
          onBlur?.(e);
        }}
        interceptKey={interceptKey}
        aria-autocomplete="list"
        aria-expanded={isOpen}
      />
      {isOpen && (
        <div className="card absolute top-full left-0 z-50 mt-1 w-64 max-w-full !p-1 shadow-lg" data-syntax-options>
          <ul role="listbox" aria-label="Shortcuts">
            {options.map((option, i) => (
              <li
                key={option.insert + option.detail}
                role="option"
                aria-selected={i === at}
                // The field keeps the focus: a new row is saved when it loses it.
                onPointerDown={(e) => {
                  e.preventDefault();
                  pick(option);
                }}
                onPointerEnter={() => setPicked(i)}
                className={`flex cursor-pointer items-baseline justify-between gap-2 px-1.5 py-1 text-sm ${i === at ? "bg-stone-100 dark:bg-stone-800" : ""}`}
              >
                <span className="min-w-0 truncate">{option.insert}</span>
                <span className="flex-none text-xs text-stone-500">{option.detail}</span>
              </li>
            ))}
          </ul>
          <p className="border-t-2 border-stone-200 px-1.5 pt-1 text-xs text-stone-500 dark:border-stone-700">
            ↑ ↓ Enter ·{" "}
            <Link to="/user#shortcuts" className="underline" onPointerDown={(e) => e.preventDefault()}>
              All shortcuts
            </Link>
          </p>
        </div>
      )}
      <SyntaxChips tokens={tokens} className="mt-1 px-1" />
    </div>
  );
}
