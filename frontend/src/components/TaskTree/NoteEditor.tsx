import { lazy, Suspense, useState, type ComponentType, type Ref } from "react";
import type { Align } from "../../lib/noteText";
import { NoteText } from "./NoteText";

export interface NoteEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Leaving the field: the owner saves it. `stop`: Escape was pressed, so writing is over. */
  onDone: (stop: boolean) => void;
  /** Gone into the field. */
  onFocus?: () => void;
  /** The editable part, to focus or leave it. */
  ref?: Ref<HTMLElement>;
  className?: string;
  /** What the field is called; a task's note by default. */
  label?: string;
  /** Without the paper and its edge: plain text on the page (a note on a screen of its own). */
  bare?: boolean;
  /** The caret or the selection moved (or what it is on changed). */
  onSelect?: (start: number, end: number) => void;
  /** Given a way to put the lines the selection is on to the left (null), the centre or the right; it says where the caret went. */
  aligner?: Ref<(to: Align | null) => number>;
  /** Shown while it is empty. */
  hint?: string;
  /** Written in at once, the caret at the end. */
  autoFocus?: boolean;
}

// The editor is a library of its own, not part of the app's first load: fetched once the page has settled, so it is
// there before a note is written in (keys typed while it was still on its way would be lost).
let loaded: ComponentType<NoteEditorProps> | null = null;
const loadEditor = () =>
  import("./LiveNoteEditor").then(
    (module) => ((loaded = module.default), module),
    // Not fetched (offline before it ever came; the browser keeps that failure until a reload): the note is shown, and
    // why it can't be written in.
    () => ({ default: EditorMissing }),
  );
const LiveNoteEditor = lazy(loadEditor);
if (typeof requestIdleCallback === "function") requestIdleCallback(() => void loadEditor(), { timeout: 5000 });
else setTimeout(() => void loadEditor(), 2000);

/**
 * Writing a note (a task's, or one of the Notes page's). It reads as it will look: headings, lists, alignment and
 * markup are shown, and their marks only on the line being written on (markup's, only around the caret). Enter makes
 * a new line, and on a list item ("* ", "- ", "1. ") the next item; Enter on an empty item ends the list. Tab /
 * Shift+Tab move an item a level in or out. Ctrl+B / I / U put markup around the selection as in a title; Ctrl+Z
 * undoes. Leaving the field saves it; Escape saves and stops. Not a task editor, so ↑ / ↓ between titles step over it.
 */
export function NoteEditor(props: NoteEditorProps) {
  // Already fetched: shown at once (through lazy() it would wait a moment, and keys typed in it would be lost). Kept
  // for the field's life, so it isn't made again once the fetch is done.
  const [Editor] = useState(() => loaded);
  if (Editor) return <Editor {...props} />;
  return (
    <Suspense fallback={<NoteText text={props.value} className={`${props.bare ? "" : "note-paper"} ${props.className ?? ""}`} />}>
      <LiveNoteEditor {...props} />
    </Suspense>
  );
}

function EditorMissing({ value, bare, className = "" }: NoteEditorProps) {
  return (
    <div className="space-y-1">
      <NoteText text={value} className={`${bare ? "" : "note-paper"} ${className}`} />
      <p className="text-xs text-red-600">Couldn't load the note editor. Once you're online, reload the app to write in it.</p>
    </div>
  );
}
