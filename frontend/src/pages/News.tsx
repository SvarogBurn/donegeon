import type { CSSProperties } from "react";
import { Navigate } from "react-router";
import { Masthead, Paper, paperDate } from "../components/News/Paper";
import { NoteText } from "../components/TaskTree/NoteText";
import { useNewsTab } from "../hooks/useAuth";
import { commitPoints, type Feature, type Project } from "../lib/news";
import { CHANGELOG, FEATURES, PROJECTS } from "../lib/newsContent";

const SECTIONS = [
  ["whats-new", "What's new"],
  ["projects", "Projects"],
  ["stories", "Stories"],
] as const;

/** A feature as an article: the lead one bigger, every one with the commits' points it gathers under it. */
function Article({ feature, lead = false }: { feature: Feature; lead?: boolean }) {
  // Two commits with the same message are one point.
  const points = [...new Set(feature.commits.flatMap((commit) => commitPoints(commit.subject)))];
  return (
    <section className="space-y-2 after:block after:clear-both" data-news-feature={feature.slug}>
      <h2 className={`news-heading ${lead ? "text-xl sm:text-2xl" : "text-sm sm:text-base"}`}>{feature.title}</h2>
      {feature.date && <p className="news-dateline">{paperDate(feature.date)}</p>}
      {/* The lead's "photo": the paper itself, drawn big. */}
      {lead && (
        <figure className="mb-2 space-y-1 sm:float-right sm:ml-4 sm:w-56" aria-hidden>
          <div className="flex h-36 items-center justify-center">
            <span className="tab-icon tab-icon-news !size-[calc(42*var(--u))] !bg-size-[calc(38*var(--u))] max-w-full" />
          </div>
          <figcaption className="news-dateline text-center">Fresh off the press</figcaption>
        </figure>
      )}
      {feature.body && <NoteText text={feature.body} className="text-sm" />}
      {points.length > 0 && (
        <div className="news-section clear-both space-y-1 p-3 text-xs">
          <p className="news-dateline">In this update</p>
          <ul className="space-y-0.5">
            {points.map((point, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="note-bullet" />
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * The commits no article is about, a day each, newest first, in a hole punched out of the front page (the back of the
 * page shows through it): scrolls inside it, as a long list would.
 */
function Changelog() {
  return (
    <aside className="news-hole space-y-3 self-start" aria-label="Changelog" data-news-changelog>
      <h2 className="news-title text-center">Changelog</h2>
      {CHANGELOG.length === 0 ? (
        <p className="news-soft text-center text-xs">The changelog comes with the app's build: none was found in this one.</p>
      ) : (
        <div className="max-h-[36rem] space-y-4 overflow-y-auto pr-1">
          {CHANGELOG.map((day) => (
            <section key={day.date} className="space-y-1 text-sm">
              <h3 className="news-dateline news-halftone py-1 text-center">
                <span className="bg-[var(--back)] px-1">{paperDate(day.date)}</span>
              </h3>
              <ul className="space-y-1">
                {day.commits.flatMap((commit) =>
                  commit.points.map((point, i) => (
                    <li key={`${commit.hash}-${i}`} className="flex gap-2">
                      <span aria-hidden className="note-bullet" />
                      {point}
                    </li>
                  )),
                )}
              </ul>
            </section>
          ))}
        </div>
      )}
    </aside>
  );
}

/**
 * One of the devs' other projects: a whole section on paper of its own, its logo on top, or its name on a flat band of
 * its colour. Its picture is drawn at its own size.
 */
function ProjectSection({ project }: { project: Project }) {
  return (
    <section
      className="news-project space-y-3 p-2"
      style={{ ...(project.color && { "--project": project.color }), ...(project.accent && { "--news-red": project.accent }) } as CSSProperties}
      data-news-project={project.slug}
    >
      {project.logo ? (
        <h3>
          <img src={project.logo} alt={project.name} className="news-logo mx-auto" />
        </h3>
      ) : (
        <h3 className="news-title news-panel !text-[24px]" style={project.color ? { background: project.color } : undefined}>
          {project.name}
        </h3>
      )}
      <div className={project.image ? "grid items-start gap-4 sm:grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,1fr)_auto]" : ""}>
        {project.image && <img src={project.image} alt={project.name} className="mx-auto max-w-full [image-rendering:pixelated]" />}
        <div className="space-y-3">
          {project.tagline && <p className="text-center text-sm italic">{project.tagline}</p>}
          {project.body && <NoteText text={project.body} className="text-center text-sm" />}
          {(project.url || project.form) && (
            <div className="flex flex-wrap justify-center gap-2">
              {project.url && (
                <a href={project.url} target="_blank" rel="noopener noreferrer" className="news-button">
                  Visit {project.name}
                </a>
              )}
              {project.form && (
                <a href={project.form} target="_blank" rel="noopener noreferrer" className="news-button">
                  Sign up
                </a>
              )}
            </div>
          )}
        </div>
        {/* On a wide page, the text as far from the right as the picture puts it from the left: an unseen copy of it. */}
        {project.image && <img src={project.image} alt="" aria-hidden className="invisible hidden lg:block" />}
      </div>
    </section>
  );
}

/**
 * The News tab: a newspaper of what's new in Donegeon (the features written up in news/features, the rest of the git
 * log as a changelog), the devs' other projects, and the story events. Not there while the tab is off.
 */
export function NewsPage() {
  const newsTab = useNewsTab();
  if (!newsTab) return <Navigate to="/" replace />;
  const [lead, ...rest] = FEATURES;
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <Paper label="News">
      <Masthead
        links={SECTIONS.map(([id, label]) => (
          <button key={id} type="button" className="uppercase hover:underline" onClick={() => go(id)}>
            {label}
          </button>
        ))}
      />
      <div id="whats-new" className="scroll-mt-20 gap-6 space-y-6 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)] lg:space-y-0" data-text="box">
        <div className="space-y-10">
          {lead ? (
            <>
              <Article feature={lead} lead />
              {rest.map((feature) => (
                <Article key={feature.slug} feature={feature} />
              ))}
            </>
          ) : (
            <p className="news-soft text-sm">No articles yet: what's new is in the changelog.</p>
          )}
        </div>
        <Changelog />
      </div>
      {PROJECTS.length > 0 && (
        <div id="projects" className="news-section scroll-mt-20 space-y-4 p-4 sm:p-6" data-text="box">
          <h2 className="news-title text-center sm:!text-[72px]">From the same desk</h2>
          {PROJECTS.map((project) => (
            <ProjectSection key={project.slug} project={project} />
          ))}
        </div>
      )}
      <div id="stories" className="scroll-mt-20 space-y-4" data-text="box">
        <h2 className="news-title text-center">Community corner</h2>
        <p className="news-heading text-center text-sm" data-news-corner>Under construction</p>
      </div>
    </Paper>
  );
}
