import type { ReactNode } from "react";
import type { StoryEvent } from "../../../../shared/events";
import { Link } from "react-router";
import { localDate } from "../../lib/clock";
import { COMMITS } from "../../lib/newsContent";
// The masthead's pixel blackletter, only its Latin letters: loaded with the News pages, not the app.
import "@fontsource/jacquard-24/latin-400.css";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** A day as a newspaper prints it: "28 October 2026". */
export function paperDate(day: string) {
  const [year, month, date] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1]} ${year}`;
}

/** The days of an event, "1 December – 7 December 2026". */
export const eventDays = (event: StoryEvent) => `${paperDate(event.opens).replace(/ \d{4}$/, "")} – ${paperDate(event.closes)}`;

/** The sheet of newsprint every News page is printed on. */
export function Paper({ children, label }: { children: ReactNode; label: string }) {
  return (
    <article className="news-paper space-y-5" aria-label={label} data-news>
      {children}
    </article>
  );
}

/**
 * The paper's name across the top, in its blackletter, and the strip under it: the day, the issue (one number a commit)
 * and `links`. `small` is the event pages' masthead: the name smaller, back to the front page.
 */
export function Masthead({ small = false, links }: { small?: boolean; links?: ReactNode }) {
  return (
    <header className="space-y-3">
      {small ? (
        <Link to="/news" className="news-masthead block text-center !text-[48px] !no-underline" title="Back to the front page">
          The Donegeon Post
        </Link>
      ) : (
        <h1 className="news-masthead pt-1 text-center">The Donegeon Post</h1>
      )}
      <div className="news-strip">
        <span>{paperDate(localDate())}</span>
        <span>Vol. 1, No. {COMMITS.length}</span>
        {links && <span className="ml-auto flex flex-wrap gap-x-4">{links}</span>}
      </div>
    </header>
  );
}
