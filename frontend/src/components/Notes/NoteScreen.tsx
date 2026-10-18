import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";
import { useDeleteNote, useEditNote, useNotes } from "../../hooks/useTasks";
import { useOnline } from "../../lib/offline/online";
import type { Note } from "../../types";
import { NoteEditor } from "../TaskTree/NoteEditor";
import { NoteText } from "../TaskTree/NoteText";

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
  const [editing, setEditing] = useState(Boolean((location.state as NoteScreenState | null)?.fresh));
  const [confirming, setConfirming] = useState(false);
  // Offline, the notice that says so stays along the top of the screen (ServerStatus): the note starts under it.
  const online = useOnline();
  const field = useRef<HTMLTextAreaElement>(null);
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

  useEffect(() => {
    if (!editing) return;
    const el = field.current;
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  // Back where it was opened from: the Notes page, a folder, the search.
  const back = () => (location.key === "default" ? navigate("/notes", { replace: true }) : navigate(-1));

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-100 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] dark:bg-stone-950" role="dialog" aria-label="Note">
      <div className={`mx-auto max-w-2xl space-y-3 px-4 py-3 ${online ? "" : "pt-14"}`}>
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="btn-quiet font-pixel text-[10px]" onClick={back}>
            ‹ Back
          </button>
          {confirming ? (
            <span className="flex items-center gap-2 text-xs">
              Delete this note?
              <button
                type="button"
                className="nes-btn is-error btn-small"
                onClick={() => {
                  deleted.current = true;
                  remove.mutate({ id: note.id });
                  back();
                }}
              >
                Delete
              </button>
              <button type="button" className="btn-quiet" onClick={() => setConfirming(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button type="button" className="btn-quiet text-xs text-stone-500" onClick={() => setConfirming(true)}>
              Delete
            </button>
          )}
        </div>
        <input
          className="w-full bg-transparent font-pixel text-sm outline-none placeholder:text-stone-400"
          value={title}
          placeholder="Title"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && (setEditing(true), e.preventDefault())}
          aria-label="Note title"
          maxLength={100}
        />
        {editing ? (
          <NoteEditor
            ref={field}
            value={text}
            onChange={setText}
            onDone={() => {
              save();
              setEditing(false);
            }}
            label="Note"
            bare
            className="min-h-[60dvh] text-sm"
          />
        ) : (
          // The text itself is what is tapped to write in it; the empty page under it too.
          <button type="button" className="flex min-h-[60dvh] w-full cursor-text flex-col justify-start text-left text-sm" onClick={() => setEditing(true)} aria-label="Write in this note">
            {text ? <NoteText text={text} /> : <span className="text-stone-400">Tap to write. * or - starts a list</span>}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
