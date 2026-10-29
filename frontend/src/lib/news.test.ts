import { describe, expect, it } from "vitest";
import { changelog, commitPoints, featuresFrom, hiddenHashes, projectsFrom, type Commit } from "./news";

const LOG: Commit[] = [
  { hash: "fcba909", date: "2026-10-28", subject: "add setting for notifications in app" },
  { hash: "99484ee", date: "2026-10-28", subject: "add notifications" },
  { hash: "4f341ee", date: "2026-10-27", subject: "add collapsible boxes, rework deadline day popup" },
  { hash: "ca71f29", date: "2026-10-22", subject: "edit README.md" },
  { hash: "d7b2f50", date: "2026-10-09", subject: "add shortcuts in text for tasks (#tags, ^goals, @date)" },
];

describe("commitPoints", () => {
  it("splits a commit at its commas into points, each with a capital", () => {
    expect(commitPoints("add collapsible boxes, rework deadline day popup")).toEqual(["Add collapsible boxes", "Rework deadline day popup"]);
    expect(commitPoints("  add delete account")).toEqual(["Add delete account"]);
    expect(commitPoints("add point  cap, , fix points")).toEqual(["Add point cap", "Fix points"]);
  });

  it("keeps the commas inside brackets", () => {
    expect(commitPoints("add shortcuts (#tags, ^goals), fix x")).toEqual(["Add shortcuts (#tags, ^goals)", "Fix x"]);
  });
});

describe("hiddenHashes", () => {
  it("is the first word of each line that isn't a comment", () => {
    expect(hiddenHashes("# a note\nca71f29 edit README\n\n  bce7f85\n")).toEqual(["ca71f29", "bce7f85"]);
  });
});

describe("featuresFrom", () => {
  it("gathers the commits it names, dated by the newest of them unless it has a date, newest first, numbered from the oldest", () => {
    const features = featuresFrom(
      {
        "news/features/notifications.md": "---\ntitle: Notifications\ncommits: 99484ee fcba90\n---\nRemind me.",
        "news/features/old.md": "---\ntitle: Old\ncommits: d7b2f50\ndate: 2026-10-10\n---\n",
        "news/features/nothing.md": "Just words.",
      },
      LOG,
    );
    expect(features.map((feature) => [feature.slug, feature.issue, feature.date, feature.commits.map((commit) => commit.hash)])).toEqual([
      ["notifications", 3, "2026-10-28", ["fcba909", "99484ee"]],
      ["old", 2, "2026-10-10", ["d7b2f50"]],
      ["nothing", 1, "", []],
    ]);
    expect(features[0]).toMatchObject({ title: "Notifications", body: "Remind me." });
    expect(features[2].title).toBe("nothing");
  });
});

describe("changelog", () => {
  it("is the commits no feature took and none hidden, by day, newest first", () => {
    const features = featuresFrom({ "f.md": "---\ncommits: 99484ee\n---\n" }, LOG);
    expect(changelog(LOG, features, ["ca71f29"])).toEqual([
      { date: "2026-10-28", commits: [{ hash: "fcba909", points: ["Add setting for notifications in app"] }] },
      { date: "2026-10-27", commits: [{ hash: "4f341ee", points: ["Add collapsible boxes", "Rework deadline day popup"] }] },
      { date: "2026-10-09", commits: [{ hash: "d7b2f50", points: ["Add shortcuts in text for tasks (#tags, ^goals, @date)"] }] },
    ]);
  });
});

describe("projectsFrom", () => {
  it("reads each project, its picture and logo found beside it, by its order", () => {
    const projects = projectsFrom(
      {
        "news/projects/b.md": "---\nname: B\nurl: javascript:alert(1)\nform: javascript:alert(1)\ncolor: blue\n---\n",
        "news/projects/moveus.md": "---\nname: MoveUs\nurl: https://moveusapp.com/home\nform: https://forms.gle/abc\ntagline: Move\ncolor: #60CCF2\naccent: #F58431\nimage: logo.png\nlogo: moveus-logo.svg\norder: 1\n---\nFind events.",
      },
      { "../../../news/projects/logo.png": "/assets/logo-abc.png", "../../../news/projects/moveus-logo.svg": "/assets/moveus-logo-abc.svg" },
    );
    expect(projects.map((project) => project.slug)).toEqual(["moveus", "b"]);
    expect(projects[0]).toMatchObject({ name: "MoveUs", url: "https://moveusapp.com/home", form: "https://forms.gle/abc", tagline: "Move", color: "#60CCF2", accent: "#F58431", image: "/assets/logo-abc.png", logo: "/assets/moveus-logo-abc.svg", body: "Find events." });
    // Only a web address is a link, and only a #rrggbb a colour.
    expect(projects[1]).toMatchObject({ url: "", form: "", color: null, accent: null, image: null, logo: null });
  });
});
