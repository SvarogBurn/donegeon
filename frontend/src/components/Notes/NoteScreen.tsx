import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";
import { useDeleteNote, useEditNote, useNotes } from "../../hooks/notes";
import { useOnline } from "../../lib/offline/online";
import { lineAlign, type Align } from "../../lib/noteText";
import type { Note } from "../../types";
import { NoteEditor } from "../TaskTree/NoteEditor";
import { DeleteOrKeep } from "../DeleteOrKeep";

const ALIGNS: { to: Align | null; name: string }[] = [
  { to: null, name: "left" },
  { to: "center", name: "centre" },
  { to: "right", name: "right" },
];

/** An alignment button's picture: lines of text, long and short, against one side or in the middle. */
function AlignIcon({ to }: { to: Align | null }) {
  const x = (width: number) => (to === "right" ? 14 - width : to === "center" ? (14 - width) / 2 : 0);
  return (
    <svg viewBox="0 0 14 11" width="14" height="11" className="fill-current" shapeRendering="crispEdges" aria-hidden>
      {[14, 8, 14, 8].map((width, i) => (
        <rect key={i} x={x(width)} y={i * 3} width={width} height={2} />
      ))}
    </svg>
  );
}

/** What opening a note can say: it was just made, so it opens to be written in. */
export interface NoteScreenState {
  fresh?: boolean;
}

/**
 * A note on a screen of its own (/notes/:id), over everything else: a blank page with just the note, its title over it.
 * A tap on the text writes in it; leaving it saves, as does going back (also with the phone's own back button).
 */
export function NoteScreen() {
  const { noteId } = useParams();
  const { data, isLoading } = useNotes();
  const note = data?.notes.find((n) => n.id === noteId);
  if (isLoading) return null;
  if (!note) return <Navigate to="/notes" replace />;
  return <Screen key={note.id} note={note} />;
}

function Screen({ note }: { note: Note }) {
  const navigate = useNavigate();
  const location = useLocation();
  const edit = useEditNote();
  const remove = useDeleteNote();
  const [title, setTitle] = useState(note.title);
  const [text, setText] = useState(note.text);
  // Being written in: the caret is in the text (the alignment buttons show).
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Offline, the notice that says so stays along the top of the screen (ServerStatus): the note starts under it.
  const online = useOnline();
  const field = useRef<HTMLElement>(null);
  const aligner = useRef<(to: Align | null) => number>(null);
  // Where the caret is, for the alignment button of its line to show pressed.
  const [caret, setCaret] = useState(0);
  // What was last sent, and what is typed now (read when the screen goes, however it goes).
  const saved = useRef({ title: note.title, text: note.text });
  const typed = useRef({ title, text });
  typed.current = { title, text };
  const deleted = useRef(false);

  function save() {
    if (deleted.current) return;
    const next = { title: typed.current.title.trim(), text: typed.current.text.trimEnd() };
    const changes = {
      ...(next.title !== saved.current.title && { title: next.title }),
      ...(next.text !== saved.current.text && { text: next.text }),
    };
    if (Object.keys(changes).length > 0) edit.mutate({ id: note.id, changes });
    saved.current = next;
  }
  const latestSave = useRef(save);
  latestSave.current = save;
  // Gone back with the phone's own button, with the field still open: saved all the same.
  useEffect(() => () => latestSave.current(), []);

  // Back where it was opened from: the Notes page, a folder, the search.
  const back = () => (location.key === "default" ? navigate("/notes", { replace: true }) : navigate(-1));

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-100 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] dark:bg-stone-950" role="dialog" aria-label="Note">
      <div className={`space-y-3 px-6 py-3 sm:px-12 ${online ? "" : "pt-14"}`}>
        {/* Stays at the top while a long note is scrolled, so the alignment is at hand while writing. */}
        <div className={`sticky z-10 -my-1 flex items-center justify-between gap-2 bg-stone-100 py-1 dark:bg-stone-950 ${online ? "top-0" : "top-14"}`}>
          <button type="button" className="btn-quiet font-pixel text-[10px]" onClick={back}>
            ‹ Back
          </button>
          {editing && (
            // Pressed without taking the caret out of the text: the line it is on (or every line selected) moves.
            <span className="flex items-center gap-1" role="group" aria-label="Line alignment">
              {ALIGNS.map(({ to, name }) => (
                <button
                  key={name}
                  type="button"
                  className={`btn-quiet !px-2 ${lineAlign(text, caret) === to ? "text-[#3544a1] dark:text-[#cbdbfc]" : "text-stone-500"}`}
                  aria-label={`Line to the ${name}`}
                  aria-pressed={lineAlign(text, caret) === to}
                  title={`Puts this line ${to ? `in the ${name}` : "on the left"} (or every line selected). Typed: ${to === "center" ? '"<> "' : to === "right" ? '">> "' : "no mark"} at the start of the line`}
                  onPointerDown={(e) => e.preventDefault()}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => aligner.current && setCaret(aligner.current(to))}
                >
                  <AlignIcon to={to} />
                </button>
              ))}
            </span>
          )}
          {confirming ? (
            <span className="flex items-center gap-2 text-xs">
              Delete this note?
              <DeleteOrKeep
                onDelete={() => {
                  deleted.current = true;
                  remove.mutate({ id: note.id });
                  back();
                }}
                onKeep={() => setConfirming(false)}
              />
            </span>
          ) : (
            <button type="button" className="btn-quiet text-xs text-stone-500" onClick={() => setConfirming(true)}>
              Delete
            </button>
          )}
        </div>
        <input
          className="w-full bg-transparent font-pixel text-base outline-none placeholder:text-stone-400"
          value={title}
          placeholder="Title"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && (field.current?.focus(), e.preventDefault())}
          aria-label="Note title"
          maxLength={100}
        />
        {/* Always the editor: it reads as written, and a tap anywhere in it (or the empty page under it) writes there. */}
        <NoteEditor
          ref={field}
          value={text}
          onChange={setText}
          onFocus={() => setEditing(true)}
          onDone={() => {
            save();
            setEditing(false);
          }}
          label="Note"
          bare
          aligner={aligner}
          onSelect={setCaret}
          hint="Tap to write. * or - starts a list"
          autoFocus={Boolean((location.state as NoteScreenState | null)?.fresh)}
          className="min-h-[60dvh] cursor-text text-sm"
        />
      </div>
    </div>,
    document.body,
  );
}
