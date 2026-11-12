import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";
import { useDeleteNote, useEditNote, useNotes } from "../../hooks/notes";
import { useOnline } from "../../lib/offline/online";
import { lineAlign, type Align } from "../../lib/noteText";
import { FOLDER_COLOR, folderIconStyle } from "../../lib/frameTones";
import { pathTo, treeOrder } from "../../lib/noteFolders";
import type { Note, NoteFolder } from "../../types";
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

/** The table button's picture: a little grid of two by two, its top row filled as a header. */
function TableIcon() {
  return (
    <svg viewBox="0 0 14 11" width="14" height="11" className="fill-current" shapeRendering="crispEdges" aria-hidden>
      {[
        [0, 0, 14, 4],
        [0, 0, 2, 11],
        [12, 0, 2, 11],
        [6, 0, 2, 11],
        [0, 9, 14, 2],
      ].map(([x, y, width, height], i) => (
        <rect key={i} x={x} y={y} width={width} height={height} />
      ))}
    </svg>
  );
}

/** The break line button's picture: a line of text above and below, a bar right across between them. */
function RuleIcon() {
  return (
    <svg viewBox="0 0 14 11" width="14" height="11" className="fill-current" shapeRendering="crispEdges" aria-hidden>
      <rect x={0} y={0} width={8} height={2} opacity={0.5} />
      <rect x={0} y={4} width={14} height={3} />
      <rect x={0} y={9} width={8} height={2} opacity={0.5} />
    </svg>
  );
}

/** What opening a note can say: it was just made, so it opens to be written in. */
export interface NoteScreenState {
  fresh?: boolean;
}

/**
 * A note on a screen of its own (/notes/:id), over everything else: a blank page with just the note, its title over it.
 * A tap on the text writes in it; leaving it saves, as does going back (also with the phone's own back button, or Escape).
 */
export function NoteScreen() {
  const { noteId } = useParams();
  const { data, isLoading } = useNotes();
  const note = data?.notes.find((n) => n.id === noteId);
  if (isLoading) return null;
  if (!note) return <Navigate to="/notes" replace />;
  return <Screen key={note.id} note={note} folders={data?.noteFolders ?? []} />;
}

/** A folder's icon, in its colour; without a folder, dimmed. */
function FolderIcon({ folder }: { folder?: NoteFolder }) {
  return <span className={`tab-icon tab-icon-folder !size-[21px] flex-none ${folder ? "" : "opacity-50"}`} style={folderIconStyle(folder?.color)} aria-hidden />;
}

/**
 * The folder the note is in, as a tag in its colour beside the title (without one, a quiet "No folder"). A click opens
 * the folders under it, each under the one it is in, to move the note to another; a click outside or Escape closes them.
 */
function FolderTag({ noteFolderId, folders, onMove }: { noteFolderId: string | null; folders: NoteFolder[]; onMove: (id: string | null) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const folder = folders.find((f) => f.id === noteFolderId);
  const color = folder ? (folder.color ?? FOLDER_COLOR) : undefined;
  const path = pathTo(folders, noteFolderId).map((f) => f.name).join(" › ");

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setIsOpen(false);
    };
    // Caught first, and marked as used: Escape closes just the folders, not the note under them.
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && (e.preventDefault(), setIsOpen(false));
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [isOpen]);

  const row = (to: NoteFolder | undefined, depth = 0) => {
    const isCurrent = (to?.id ?? null) === (folder?.id ?? null);
    return (
      <button
        key={to?.id ?? "none"}
        type="button"
        className={`flex w-full items-center gap-1.5 py-1 pr-1.5 pl-(--indent) text-left font-pixel text-[8px] ${isCurrent ? "bg-stone-200 text-stone-950 dark:bg-stone-800 dark:text-white" : "text-stone-700 hover:bg-stone-200/60 dark:text-stone-300 dark:hover:bg-stone-800/60"}`}
        style={{ "--indent": `${6 + depth * 12}px` } as CSSProperties}
        title={to ? pathTo(folders, to.id).map((f) => f.name).join(" › ") : undefined}
        aria-pressed={isCurrent}
        onClick={() => {
          setIsOpen(false);
          onMove(to?.id ?? null);
        }}
      >
        <FolderIcon folder={to} />
        <span className="truncate">{to?.name ?? "No folder"}</span>
      </button>
    );
  };

  return (
    <span ref={ref} className="relative flex flex-none">
      <button
        type="button"
        className={`flex max-w-36 items-center gap-1.5 border-l-4 py-1 pr-2 pl-1.5 font-pixel text-[8px] ${folder ? "text-stone-700 dark:text-stone-300" : "border-stone-300 text-stone-500 dark:border-stone-700"}`}
        style={color ? { borderColor: color, backgroundColor: `${color}33` } : undefined}
        aria-expanded={isOpen}
        title={folder ? `In the folder "${path}". Click to move the note to another folder` : "In no folder. Click to put the note in one"}
        onClick={() => setIsOpen(!isOpen)}
      >
        <FolderIcon folder={folder} />
        <span className="truncate">{folder?.name ?? "No folder"}</span>
      </button>
      {isOpen && (
        <div className="card absolute top-full right-0 z-20 mt-1 max-h-[50dvh] w-48 overflow-y-auto !p-1 shadow-lg" role="dialog" aria-label="Move the note to a folder">
          {row(undefined)}
          {treeOrder(folders).map(({ folder: to, depth }) => row(to, depth))}
        </div>
      )}
    </span>
  );
}

function Screen({ note, folders }: { note: Note; folders: NoteFolder[] }) {
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
  const titleField = useRef<HTMLInputElement>(null);
  const aligner = useRef<(to: Align | null) => number>(null);
  const tableMaker = useRef<() => void>(null);
  const ruleMaker = useRef<() => void>(null);
  // Where the caret is, for the alignment button of its line to show pressed.
  const [caret, setCaret] = useState(0);
  // What was last sent, and what is typed now (read when the screen goes, however it goes).
  const saved = useRef({ title: note.title, text: note.text });
  const typed = useRef({ title, text });
  typed.current = { title, text };
  const deleted = useRef(false);

  // Made by "+ New note" just now: left without a word written in it, it goes again rather than staying an empty card.
  const isFresh = Boolean((location.state as NoteScreenState | null)?.fresh);

  /** `leaving`: the screen goes (Back, the phone's own back): only then is an untouched new note removed. */
  function save(leaving = false) {
    if (deleted.current) return;
    const next = { title: typed.current.title.trim(), text: typed.current.text.trimEnd() };
    if (leaving && isFresh && !next.title && !next.text.trim() && !note.title && !note.text) {
      deleted.current = true;
      remove.mutate({ id: note.id });
      return;
    }
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
  // Only once it is really gone: in development React unmounts and mounts it again at once, which isn't leaving.
  const isMounted = useRef(false);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      setTimeout(() => !isMounted.current && latestSave.current(true));
    };
  }, []);

  const moveTo = (noteFolderId: string | null) => {
    if (noteFolderId !== note.noteFolderId) edit.mutate({ id: note.id, changes: { noteFolderId } });
  };

  // Back where it was opened from: the Notes page, a folder, the search.
  const back = () => (location.key === "default" ? navigate("/notes", { replace: true }) : navigate(-1));

  // Not writing: Escape goes back, as Back does (asking whether to delete, it keeps the note instead), and Space starts
  // writing, in the title at its end. While writing, Escape only stops it (the editor's own, or the title's), and it is
  // left alone when something else used it (the folders' list closing); Space on a button presses it.
  const onEscape = useRef(back);
  onEscape.current = () => (confirming ? setConfirming(false) : back());
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target as Element;
      if (target.closest?.("input, textarea, select, [contenteditable=true]")) return;
      if (e.key === "Escape") onEscape.current();
      else if (e.key === " " && !e.ctrlKey && !e.altKey && !e.metaKey && !target.closest?.("button")) {
        e.preventDefault();
        titleField.current?.focus();
        titleField.current?.setSelectionRange(titleField.current.value.length, titleField.current.value.length);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-stone-100 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] dark:bg-stone-950" role="dialog" aria-label="Note">
      <div className={`space-y-3 px-6 py-3 sm:px-12 ${online ? "" : "pt-14"}`}>
        {/* Stays at the top while a long note is scrolled, so the alignment is at hand while writing. */}
        <div className={`sticky z-10 -my-1 flex items-center justify-between gap-2 bg-stone-100 py-1 dark:bg-stone-950 ${online ? "top-0" : "top-14"}`}>
          <button type="button" className="btn-quiet font-pixel text-[10px]" onClick={back}>
            ‹ Back
          </button>
          {editing && (
            <span className="flex items-center gap-3">
              {/* Pressed without taking the caret out of the text: the line it is on (or every line selected) moves. */}
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
              <button
                type="button"
                className="btn-quiet !px-2 text-stone-500"
                aria-label="Insert table"
                title='Puts a table in under this line. Typed: "| a | b |" lines'
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => tableMaker.current?.()}
              >
                <TableIcon />
              </button>
              <button
                type="button"
                className="btn-quiet !px-2 text-stone-500"
                aria-label="Insert break line"
                title='Puts a break line under this line. Typed: "-----" on a line of its own'
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => ruleMaker.current?.()}
              >
                <RuleIcon />
              </button>
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
        {/* The title and the text: in the font picked for notes. */}
        <div className="space-y-3" data-text="notes">
          <div className="flex items-center gap-3">
            <input
              className="note-title min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-stone-400"
              value={title}
              placeholder="Title"
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => save()}
              ref={titleField}
              onKeyDown={(e) => {
                if (e.key === "Enter") field.current?.focus(), e.preventDefault();
                else if (e.key === "Escape") e.currentTarget.blur();
              }}
              aria-label="Note title"
              maxLength={100}
            />
            {folders.length > 0 && <FolderTag noteFolderId={note.noteFolderId} folders={folders} onMove={moveTo} />}
          </div>
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
            tableMaker={tableMaker}
            ruleMaker={ruleMaker}
            onSelect={setCaret}
            hint="Tap to write. * or - starts a list"
            autoFocus={isFresh}
            maxLength={1_000_000}
            className="min-h-[60dvh] cursor-text text-sm"
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
