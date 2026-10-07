import { useQuery } from "@tanstack/react-query";
import { getFeedback } from "../../api/feedback";
import { TileFrame } from "../Tiles/TileFrame";

const sentAt = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** On a developer's user page: every letter sent from the suggestion box, newest first. */
export function FeedbackInbox() {
  const { data: letters, error } = useQuery({ queryKey: ["feedback"], queryFn: getFeedback });

  return (
    <TileFrame title="Inbox" aria-label="Inbox" tone="record">
      {error && <p className="text-xs text-red-600">{error.message}</p>}
      {letters?.length === 0 && <p className="text-xs text-stone-500">No mail yet.</p>}
      {letters && letters.length > 0 && (
        <ul className="divide-y-2 divide-stone-300 dark:divide-stone-700" data-feedback-inbox>
          {letters.map((letter) => (
            <li key={letter.id} className="space-y-1 py-2 text-xs first:pt-0 last:pb-0">
              <p className="flex flex-wrap items-baseline gap-x-2 text-stone-500">
                <span className="text-stone-900 dark:text-stone-100">{letter.username}</span>
                <span>{letter.kind === "bug" ? "Bug" : "Feature"}</span>
                <span className="ml-auto tabular-nums">{sentAt(letter.createdAt)}</span>
              </p>
              {letter.subject && <p className="break-words">{letter.subject}</p>}
              <p className="break-words whitespace-pre-wrap text-stone-600 dark:text-stone-300">{letter.message}</p>
            </li>
          ))}
        </ul>
      )}
    </TileFrame>
  );
}
