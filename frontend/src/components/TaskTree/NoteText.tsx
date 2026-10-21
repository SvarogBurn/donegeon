import { parseNote, type Align } from "../../lib/noteText";
import { RichText } from "../RichText";

const HEADING_TAG = { 1: "h3", 2: "h4", 3: "h5" } as const;
/** A line put in the centre or to the right ("<> ", ">> "): its words, and a list item's marker with them. */
const TEXT_ALIGN: Record<Align, string> = { center: "text-center", right: "text-right" };
const ITEM_ALIGN: Record<Align, string> = { center: "justify-center", right: "justify-end" };

/**
 * A note as it reads: its lines with their markup, headings, list items with a square bullet or their number, indented
 * by level; each line on the left, in the centre or on the right.
 */
export function NoteText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`space-y-0.5 break-words ${className}`} data-note-text>
      {parseNote(text).map((line, i) =>
        line.kind === "blank" ? (
          <div key={i} className="h-3" />
        ) : line.kind === "heading" ? (
          // A level under the page's own headings, so the page's outline stays whole.
          (() => {
            const Tag = HEADING_TAG[line.level];
            return (
              <Tag key={i} className={`note-heading note-heading-${line.level} ${line.align ? TEXT_ALIGN[line.align] : ""}`} data-note-heading={line.level}>
                <RichText text={line.text} />
              </Tag>
            );
          })()
        ) : line.kind === "text" ? (
          <p key={i} className={`whitespace-pre-wrap ${line.align ? TEXT_ALIGN[line.align] : ""}`}>
            <RichText text={line.text} />
          </p>
        ) : (
          <div key={i} className={`flex gap-2 ${line.align ? ITEM_ALIGN[line.align] : ""}`} style={{ paddingLeft: `${line.depth * 1.25}rem` }} data-note-item={line.depth}>
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
