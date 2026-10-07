import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { sendFeedback } from "../../api/feedback";
import type { FeedbackKind } from "../../types";
import { TileFrame } from "../Tiles/TileFrame";

const KIND_CHOICES: [FeedbackKind, string][] = [
  ["bug", "Bug"],
  ["feature", "Feature"],
];

const ROW = "flex items-center gap-2 border-b-2 border-stone-300 py-1 text-xs dark:border-stone-700";
const LABEL = "w-16 flex-none text-stone-500";
const FIELD = "min-w-0 flex-1 bg-transparent text-xs text-stone-900 outline-none placeholder:text-stone-400 dark:text-stone-100";

/** The suggestion box on the user's page, laid out as an email being written: who from, who to, a subject, the letter, Send. */
export function FeedbackBox({ username }: { username: string }) {
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const send = useMutation({
    mutationFn: sendFeedback,
    onSuccess: () => {
      setSubject("");
      setMessage("");
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim() || send.isPending) return;
    send.mutate({ kind, subject, message });
  };
  // "Sent" stays until the next letter is started.
  const edit = () => send.isSuccess && send.reset();

  return (
    <TileFrame title="Send mail to devs" aria-label="Send mail to devs">
      <form onSubmit={submit} className="space-y-3" data-feedback>
        <div>
          <p className={ROW}>
            <span className={LABEL}>From</span>
            <span className="min-w-0 break-words">{username}</span>
          </p>
          <p className={ROW}>
            <span className={LABEL}>To</span>
            <span>Donegeon</span>
          </p>
          <div className={ROW}>
            <label htmlFor="feedback-subject" className={LABEL}>
              Subject
            </label>
            <select
              className="flex-none border-2 border-stone-300 bg-white px-1 py-1 text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
              value={kind}
              onChange={(e) => setKind(e.target.value as FeedbackKind)}
              aria-label="Bug or feature"
              data-feedback-kind
            >
              {KIND_CHOICES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              id="feedback-subject"
              className={FIELD}
              value={subject}
              maxLength={120}
              onChange={(e) => {
                setSubject(e.target.value);
                edit();
              }}
            />
          </div>
        </div>
        <textarea
          className={`${FIELD} block w-full resize-y`}
          rows={6}
          value={message}
          maxLength={4000}
          placeholder={kind === "bug" ? "What went wrong, and what were you doing?" : "What would you like Donegeon to do?"}
          aria-label="Message"
          onChange={(e) => {
            setMessage(e.target.value);
            edit();
          }}
        />
        <div className="flex flex-wrap items-center justify-end gap-3">
          {send.isSuccess && (
            <p className="text-xs text-stone-500" data-feedback-sent>
              Sent. Thank you!
            </p>
          )}
          {send.error && <p className="text-xs text-red-600">{send.error.message}</p>}
          <button type="submit" className="nes-btn is-primary btn !w-auto" disabled={!message.trim() || send.isPending}>
            Send
          </button>
        </div>
      </form>
    </TileFrame>
  );
}
