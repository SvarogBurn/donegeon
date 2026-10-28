import { isLocalDate } from "../../../shared/dates";
import { fileSlug, parseFrontMatter } from "../../../shared/frontMatter";

/**
 * The News page's issue, from the git log at the build (virtual:git-log) and the files of news/ at the repo root
 * (see news/README.md): the features written about some commits, the rest of the commits as a changelog by day, and
 * the projects. Pure: lib/newsContent.ts gathers the files.
 */
export interface Commit {
  hash: string;
  /** "YYYY-MM-DD". */
  date: string;
  subject: string;
}

export interface Feature {
  slug: string;
  title: string;
  /** Its own date, else the newest of its commits'; "" when it has neither. */
  date: string;
  commits: Commit[];
  /** In the markup of a note. */
  body: string;
}

export interface ChangeDay {
  date: string;
  commits: { hash: string; points: string[] }[];
}

export interface Project {
  slug: string;
  name: string;
  url: string;
  /** A sign-up form's address: a second button beside the visit one. */
  form: string;
  tagline: string;
  color: string | null;
  /** Its buttons' colour under the pointer, instead of the paper's red. */
  accent: string | null;
  /** The picture's address, if it has one that was found. */
  image: string | null;
  /** The logo's address, if it has one that was found: shown on top instead of the name. */
  logo: string | null;
  order: number;
  body: string;
}

/** A hash written in a file names a commit when one starts with the other: git's short hashes grow longer as the repo does. */
const names = (written: string, hash: string) => written.length >= 4 && (hash.startsWith(written) || written.startsWith(hash));

/**
 * A commit's message as the points it is made of: commits are written "add X, fix Y, add Z". A comma inside brackets
 * stays ("(#tags, ^goals)"). Each point starts with a capital.
 */
export function commitPoints(subject: string): string[] {
  const points: string[] = [];
  let depth = 0;
  let from = 0;
  for (let at = 0; at <= subject.length; at++) {
    const char = subject[at];
    if (char === "(" || char === "[") depth++;
    else if ((char === ")" || char === "]") && depth > 0) depth--;
    else if (at === subject.length || (char === "," && depth === 0)) {
      const point = subject.slice(from, at).trim().replace(/\s+/g, " ");
      if (point) points.push(point[0].toUpperCase() + point.slice(1));
      from = at + 1;
    }
  }
  return points;
}

/** The hashes in hidden.txt: the first word of each line, "#" lines left out. */
export const hiddenHashes = (raw: string) =>
  raw
    .split("\n")
    .map((line) => line.trim().split(/\s+/)[0])
    .filter((word) => word && !word.startsWith("#"));

/** The features, newest first, from their files ({path: text}); a hash in none of the commits is left out of it. */
export function featuresFrom(files: Record<string, string>, log: Commit[]): Feature[] {
  return Object.entries(files)
    .map(([path, raw]) => {
      const { data, body } = parseFrontMatter(raw);
      const written = (data.commits ?? "").split(/[\s,]+/).filter(Boolean);
      const commits = log.filter((commit) => written.some((hash) => names(hash, commit.hash)));
      const date = isLocalDate(data.date) ? data.date : commits.reduce((newest, commit) => (commit.date > newest ? commit.date : newest), "");
      return { slug: fileSlug(path), title: data.title || fileSlug(path), date, commits, body };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

/** The commits no feature is about and none hidden, by day, newest first (the log's own order within a day). */
export function changelog(log: Commit[], features: Feature[], hidden: string[]): ChangeDay[] {
  const featured = new Set(features.flatMap((feature) => feature.commits.map((commit) => commit.hash)));
  const days: ChangeDay[] = [];
  for (const commit of log) {
    if (featured.has(commit.hash) || hidden.some((hash) => names(hash, commit.hash))) continue;
    const points = commitPoints(commit.subject);
    if (points.length === 0) continue;
    const last = days[days.length - 1];
    if (last?.date === commit.date) last.commits.push({ hash: commit.hash, points });
    else days.push({ date: commit.date, commits: [{ hash: commit.hash, points }] });
  }
  return days.sort((a, b) => b.date.localeCompare(a.date));
}

/** The projects, by their `order` (lowest first), then name. `images` are the pictures beside them, {path: address}. */
export function projectsFrom(files: Record<string, string>, images: Record<string, string>): Project[] {
  const picture = (name: string | undefined) => {
    const found = name && Object.keys(images).find((imagePath) => imagePath.endsWith(`/${name}`));
    return found ? images[found] : null;
  };
  return Object.entries(files)
    .map(([path, raw]) => {
      const { data, body } = parseFrontMatter(raw);
      const order = Number(data.order);
      return {
        slug: fileSlug(path),
        name: data.name || fileSlug(path),
        url: /^https?:\/\//.test(data.url ?? "") ? data.url : "",
        form: /^https?:\/\//.test(data.form ?? "") ? data.form : "",
        tagline: data.tagline ?? "",
        color: /^#[0-9a-f]{6}$/i.test(data.color ?? "") ? data.color : null,
        accent: /^#[0-9a-f]{6}$/i.test(data.accent ?? "") ? data.accent : null,
        image: picture(data.image),
        logo: picture(data.logo),
        order: Number.isFinite(order) && data.order ? order : Infinity,
        body,
      };
    })
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}
