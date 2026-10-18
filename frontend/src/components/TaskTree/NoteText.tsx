import { parseNote } from "../../lib/noteText";
import { RichText } from "../RichText";

/** A note as it reads: its lines with their markup, list items with a square bullet or their number, indented by level. */
export function NoteText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`space-y-0.5 break-words ${className}`} data-note-text>
      {parseNote(text).map((line, i) =>
        line.kind === "blank" ? (
          <div key={i} className="h-3" />
        ) : line.kind === "text" ? (
          <p key={i} className="whitespace-pre-wrap">
            <RichText text={line.text} />
          </p>
        ) : (
          <div key={i} className="flex gap-2" style={{ paddingLeft: `${line.depth * 1.25}rem` }} data-note-item={line.depth}>
            {line.number === undefined ? <span aria-hidden className="note-bullet" /> : <span className="flex-none tabular-nums">{line.number}.</span>}
            <span className="min-w-0">
              <RichText text={line.text} />
            </span>
          </div>
        ),
      )}
    </div>
  );
}
