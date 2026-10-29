import commits from "virtual:git-log";
import { eventFromFile, type StoryEvent } from "../../../shared/events";
import hidden from "../../../news/hidden.txt?raw";
import { changelog, featuresFrom, hiddenHashes, projectsFrom } from "./news";

/**
 * The News page's issue as the app was built: news/ at the repo root (see news/README.md) and the git log. Only the
 * folders named here are read, so news/README.md is not a page.
 */
const featureFiles = import.meta.glob<string>("../../../news/features/*.md", { query: "?raw", import: "default", eager: true });
const projectFiles = import.meta.glob<string>("../../../news/projects/*.md", { query: "?raw", import: "default", eager: true });
const projectImages = import.meta.glob<string>("../../../news/projects/*.{png,jpg,jpeg,gif,webp,svg}", { query: "?url", import: "default", eager: true });
const eventFiles = import.meta.glob<string>("../../../news/events/*.md", { query: "?raw", import: "default", eager: true });

export const FEATURES = featuresFrom(featureFiles, commits);
export const CHANGELOG = changelog(commits, FEATURES, hiddenHashes(hidden));
export const PROJECTS = projectsFrom(projectFiles, projectImages);
/** The story events, the latest to open first. */
export const EVENTS: StoryEvent[] = Object.entries(eventFiles)
  .map(([path, raw]) => eventFromFile(path, raw))
  .filter((event): event is StoryEvent => event !== null)
  .sort((a, b) => b.opens.localeCompare(a.opens));
