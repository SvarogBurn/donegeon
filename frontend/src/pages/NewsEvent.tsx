import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { addDays } from "../../../shared/dates";
import { countWords, eventState, STORY_TEXT_MAX, STORY_TITLE_MAX, storyWordCap, type StoryEvent } from "../../../shared/events";
import { eventDays, Masthead, Paper, paperDate } from "../components/News/Paper";
import { NeedsConnection } from "../components/NeedsConnection";
import { NoteText } from "../components/TaskTree/NoteText";
import { useEventStories, useStoryChanges } from "../hooks/stories";
import { useMe } from "../hooks/useAuth";
import { localDate } from "../lib/clock";
import { localDay } from "../lib/dates";
import { EVENTS } from "../lib/newsContent";
import { readStored, writeStored } from "../lib/storage";
import type { Story } from "../types";

/** What is being written and not yet saved, kept on this device so a closed page doesn't lose it. */
const draftKey = (eventId: string) => `donegeon.storyDraft.${eventId}`;

function readDraft(eventId: string): { title: string; text: string } | null {
  try {
    const draft = JSON.parse(readStored(draftKey(eventId)) ?? "null");
    return typeof draft?.title === "string" && typeof draft?.text === "string" ? draft : null;
  } catch {
    return null;
  }
}

/** The user's story while the event is open: written, changed and taken back until its last day. */
function StoryForm({ event, mine }: { event: StoryEvent; mine: Story | null }) {
  const { save, withdraw } = useStoryChanges(event.id);
  const [title, setTitle] = useState(() => readDraft(event.id)?.title ?? mine?.title ?? "");
  const [text, setText] = useState(() => readDraft(event.id)?.text ?? mine?.text ?? "");
  const isChanged = title !== (mine?.title ?? "") || text !== (mine?.text ?? "");
  useEffect(() => writeStored(draftKey(event.id), isChanged ? JSON.stringify({ title, text }) : null), [event.id, title, text, isChanged]);
  const words = countWords(text);
  const cap = storyWordCap(event.words);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!save.isPending) save.mutate({ title: title.trim(), text: text.trim() }, { onSuccess: (saved) => (setTitle(saved.title), setText(saved.text)) });
  };

  return (
    <form onSubmit={submit} className="news-section space-y-3 p-4" data-story-form>
      <h2 className="news-title">{mine ? "Your story" : "Write your story"}</h2>
      <NeedsConnection>
        <label className="block space-y-1 text-xs">
          <span className="news-dateline">Title</span>
          <input className="news-field text-sm" value={title} maxLength={STORY_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} data-story-title />
        </label>
        <label className="block space-y-1 text-xs" data-text="notes">
          <span className="news-dateline">Your story</span>
          <textarea className="news-field min-h-[24rem] text-sm leading-relaxed" value={text} maxLength={STORY_TEXT_MAX} onChange={(e) => setText(e.target.value)} data-story-text />
        </label>
        <p className={`text-xs tabular-nums ${words > cap ? "text-red-600" : "news-soft"}`} data-story-words={words}>
          {words} / about {event.words} words{words > cap ? ` (at most ${cap}: cut ${words - cap})` : ""}
        </p>
        {(save.error ?? withdraw.error) && <p className="text-xs text-red-600">{(save.error ?? withdraw.error)!.message}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="news-button" disabled={!isChanged || !title.trim() || !text.trim() || words > cap || save.isPending}>
            {mine ? "Save changes" : "Submit"}
          </button>
          {mine && (
            <button
              type="button"
              className="news-button news-button-quiet"
              disabled={withdraw.isPending}
              onClick={() => confirm("Take your story back? It is deleted, and isn't shown when the event closes.") && withdraw.mutate(undefined, { onSuccess: () => (setTitle(""), setText("")) })}
            >
              Take it back
            </button>
          )}
          <span className="news-soft text-xs">
            {mine ? `Saved ${paperDate(localDay(new Date(mine.updatedAt)))}. ` : ""}You can change it until {paperDate(event.closes)}; everyone's stories open on {paperDate(addDays(event.closes, 1))}.
          </span>
        </div>
      </NeedsConnection>
    </form>
  );
}

/** Everyone's stories once the event is closed, each opening in place; a developer can take one down. */
function StoryList({ eventId, stories }: { eventId: string; stories: (Story & { username: string })[] }) {
  const isDev = useMe().user?.isDev ?? false;
  const { remove } = useStoryChanges(eventId);
  if (stories.length === 0) return <p className="news-section news-soft p-4 text-sm">Nobody wrote a story for this one.</p>;
  return (
    <section className="space-y-3" aria-label="Stories" data-story-list>
      <h2 className="news-title">
        {stories.length} {stories.length === 1 ? "story" : "stories"}
      </h2>
      {remove.error && <p className="text-xs text-red-600">{remove.error.message}</p>}
      {stories.map((story) => (
        <details key={story.id} className="news-section p-4" data-story={story.id}>
          <summary className="cursor-pointer list-none">
            <span className="news-heading text-sm">{story.title}</span>
            <span className="news-soft text-xs">
              {" "}
              · by {story.username} · {story.words} words
            </span>
          </summary>
          <div className="space-y-3 pt-3">
            <NoteText text={story.text} className="text-sm leading-relaxed" />
            {isDev && (
              <button type="button" className="news-button" disabled={remove.isPending} onClick={() => confirm(`Remove “${story.title}” by ${story.username}?`) && remove.mutate(story.id)}>
                Remove
              </button>
            )}
          </div>
        </details>
      ))}
    </section>
  );
}

/** A story event's page (/news/events/:eventId): its prompt, then the user's story while it is open, and everyone's once it is closed. */
export function NewsEventPage() {
  const { eventId = "" } = useParams();
  const event = EVENTS.find((found) => found.id === eventId);
  const state = event && eventState(event, localDate());
  // Nothing to ask for before it opens, or for an event there is no file for.
  const stories = useEventStories(eventId, state !== undefined && state !== "upcoming");

  return (
    <Paper label={event?.title ?? "Story event"}>
      <Masthead small links={<Link to="/news">Back to the front page</Link>} />
      {!event ? (
        <p className="text-sm">There is no such story event.</p>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4" data-text="box">
          <p className="news-dateline flex flex-wrap items-center gap-2">
            <span className="news-stamp">{state === "open" ? "Open for stories" : state === "upcoming" ? "Coming up" : "Closed"}</span>
            Story event · {eventDays(event)}
          </p>
          <h1 className="news-heading text-xl sm:text-2xl">{event.title}</h1>
          {event.prompt && <NoteText text={event.prompt} className="text-sm" />}
          {state === "upcoming" && <p className="news-section p-4 text-sm">Stories can be written from {paperDate(event.opens)}.</p>}
          {state !== "upcoming" && stories.error && <p className="text-sm text-red-600">Couldn't load the stories: {stories.error.message}</p>}
          {state !== "upcoming" && !stories.data && !stories.error && <p className="news-soft text-sm">Loading…</p>}
          {stories.data?.state === "open" && <StoryForm key={stories.data.mine?.updatedAt ?? "new"} event={event} mine={stories.data.mine} />}
          {stories.data?.state === "closed" && <StoryList eventId={event.id} stories={stories.data.stories} />}
        </div>
      )}
    </Paper>
  );
}
