import { useState, type ReactNode } from "react";
import { hasTaskPage } from "../../lib/taskPage";
import type { Folder, List, TaskTreeNode } from "../../types";

/** What a step can look at: the account's data, the page that is open, and what the tutorial has noted so far. */
export interface TutorialContext {
  tasks: TaskTreeNode[];
  lists: List[];
  folders: Folder[];
  /** How many boxes of the Tasks page are minimized. */
  hidden: number;
  /** Changes whenever the boxes of the Tasks page are arranged differently. */
  arranged: number;
  /** How many columns the boxes of the Tasks page are in, as far as it was ever arranged. */
  columns: number;
  path: string;
  /** The task the user made for the tutorial, once there is one. */
  task: TaskTreeNode | undefined;
  /** Numbers noted when earlier steps began (see Step.note), to tell what was made since. */
  base: Record<string, number>;
  /** The main tasks there were when the user was told to make one. */
  known: string[];
  isTouch: boolean;
}

export interface Step {
  text: (ctx: TutorialContext) => ReactNode;
  /** The opening: nothing of the app shows behind the words. */
  dark?: boolean;
  /** What the arrow points at: the first of these selectors that is on the page. */
  target?: (ctx: TutorialContext) => string[];
  /** Other things left undimmed with it, each one that is on the page. */
  also?: (ctx: TutorialContext) => string[];
  /** Where the words go if there is room there, rather than under or over the target. */
  side?: "right";
  /** Set on <html> (as data-...) while the step is on, for index.css to show something that is otherwise out of sight. */
  flag?: string;
  /** The page this step happens on, opened when the step begins. */
  route?: string | ((ctx: TutorialContext) => string | undefined);
  /** True where the step can't be done (no room for it on this screen): it is passed over. */
  skip?: (ctx: TutorialContext) => boolean;
  /** Numbers to remember when the step begins. */
  note?: (ctx: TutorialContext) => Record<string, number>;
  /** True once the user did what was asked: the next step comes by itself. Without it there is a button. */
  done?: (ctx: TutorialContext) => boolean;
  /** Only makes sense while the tutorial's task exists; if it was deleted, back to making one. */
  needsTask?: boolean;
  /** What the button says, on a step without `done`. */
  button?: string;
}

const MENU = '[role="dialog"][aria-label="Task options"]';
const part = (name: string) => `${MENU} [data-menu-part="${name}"]`;
const row = (ctx: TutorialContext) => `[data-task-row="${ctx.task?.id}"]`;
/** The task with everything under it: its subtasks, theirs, and a row being typed. */
const tree = (ctx: TutorialContext) => `li:has(> ${row(ctx)})`;
const dots = (ctx: TutorialContext) => `${row(ctx)} button[aria-label="Task options"]`;
const name = (ctx: TutorialContext) => <b>{ctx.task?.title.split("\n")[0]}</b>;
/** Subtasks at every depth. */
const subtasks = (ctx: TutorialContext) => ctx.task?.descendantCount ?? 0;
const views = (ctx: TutorialContext) => ctx.folders.reduce((sum, folder) => sum + folder.views.length, 0);
const rewardLists = (ctx: TutorialContext) => ctx.lists.filter((list) => list.kind === "reward").length;
const FOLDER_EDITOR = 'nav [role="dialog"][aria-label^="Folder"]';

/** Something said under one's breath: folded away behind the little arrow (the one that folds subtasks away). */
function Aside({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <span className="mt-1 flex items-start gap-2">
      <button type="button" className="task-arrow flex-none" aria-expanded={isOpen} aria-label="More" onClick={() => setIsOpen(!isOpen)} />
      {isOpen && <span className="text-xs text-stone-500">{children}</span>}
    </span>
  );
}

const HANDLE = '[data-tile^="list:"] .tile-button-tab';

/** The index of the step that asks for a task: where the tutorial falls back to when its task is deleted. */
export const MAKE_TASK = 2;

export const STEPS: Step[] = [
  {
    dark: true,
    text: () => (
      <>
        <b>Welcome to Donegeon.</b>
        <br />A gamified task manager where you sweat and do tasks to earn points with me. Then, you spend those points on doing
        things you enjoy and love (like scrolling YouTube, you filthy degenerate. I've seen your history). Gotta love capitalism
        babeeeyy~!
      </>
    ),
    button: "Go on",
  },
  {
    dark: true,
    text: () => (
      <>
        You're gonna make tasks, you're gonna earn points. You're gonna break down your tasks and earn even more points!
        <br />
        Then, as a reward, gonna brain dump all your passion projects here and not feel guilty for doing and spending points on them, since, you earned
        it. &gt;:3
        <br />
        So let me show you your personal dungeon ;)
        <Aside>this isnt a sex thing, I swear!</Aside>
      </>
    ),
    button: "Fine",
  },
  // MAKE_TASK
  {
    route: "/",
    text: () => (
      <>
        <b>Make a task.</b>
        <br />
        Type it in the list, press Enter. I'm not picky.
      </>
    ),
    target: () => ['[data-tile^="list:"] [data-task-editor^="add:"]', '[data-tile^="list:"]', '[data-tile="newList"]'],
    // `done` here is seen to by the tutorial itself: it has to note which task was made.
  },
  {
    needsTask: true,
    route: "/",
    text: (ctx) => (
      <>
        Ah yes, {name(ctx)}. I was curious how you will go through with {name(ctx)}.
        <br />
        <b>Make a sub-task.</b>
        <br />
        {ctx.isTouch ? (
          <>
            Tap the <b>⋯</b> on your task, then <b>Add subtask</b>.
          </>
        ) : (
          <>
            Click into your task and press <b>Ctrl+Enter</b>.
          </>
        )}
        <br />
        Type it.
        <br />
        Go on.
        <br />
        Do it.
        <br />
        {ctx.isTouch ? "Confirm it." : "press Enter."}
      </>
    ),
    target: (ctx) => [tree(ctx)],
    done: (ctx) => subtasks(ctx) >= 1,
  },
  {
    needsTask: true,
    route: "/",
    text: (ctx) => (
      <>
        What, you didnt think the tutorial ends there? <b>make another subtask</b> for {name(ctx)}
      </>
    ),
    target: (ctx) => [tree(ctx)],
    done: (ctx) => subtasks(ctx) >= 2,
  },
  {
    needsTask: true,
    route: "/",
    text: () => <b>Another.</b>,
    target: (ctx) => [tree(ctx)],
    done: (ctx) => subtasks(ctx) >= 3,
  },
  {
    needsTask: true,
    route: "/",
    text: () => (
      <>
      <br />
        Subtasks can have subtasks of their own, by the way.
        <br />
        Keep writing subtasks, what are you hesitating for?
      </>
    ),
    target: (ctx) => [tree(ctx)],
    done: (ctx) => subtasks(ctx) >= 4,
  },
  {
    text: () => (
      <>
        <b>I'm just messing with you.</b> You can stop breaking it down into baby steps. Although breaking it down as much as you
        can, helps.
      </>
    ),
    target: (ctx) => [tree(ctx)],
    needsTask: true,
    button: "Very funny",
  },
  {
    needsTask: true,
    route: "/",
    text: () => (
      <>
        Every task has a <b>⋯</b> at the end of its row. Imagine,... I know a guy who went his whole life without touching those three dots.
        Not you though. You are <i>modern</i> and <i>sleek</i>. <b>Open it.</b>
      </>
    ),
    target: (ctx) => [MENU, dots(ctx)],
    done: () => Boolean(document.querySelector(MENU)),
  },
  {
    needsTask: true,
    text: () => <>This interface is where you customize the shit out of your task.</>,
    target: (ctx) => [MENU, dots(ctx)],
    button: "Next",
  },
  {
    needsTask: true,
    text: () => <>Here are the points you earn or loose. Every task can have its own amount, subtasks too. Leave it empty and it's worth what its list says.</>,
    target: (ctx) => [part("points"), MENU, dots(ctx)],
    button: "Next",
  },
  {
    needsTask: true,
    text: () => (
      <>
        Two types of deadlines to watch out for: Hard and soft, or as my friend Snaker says, Erect and Flaccid.
        <br />
        Hard deadlines are things you must do. Miss it and there are consequences.
        <br />A Soft one is self-imposed, the kind that says "I'll do it tomorrow".
      </>
    ),
    target: (ctx) => [part("deadline"), MENU, dots(ctx)],
    button: "Next",
  },
  {
    needsTask: true,
    text: () => (
      <>you have a today tab with relevant tasks. Do today puts it in your Today box, so you can't pretend you forgot.</>
    ),
    target: (ctx) => [part("today"), MENU, dots(ctx)],
    also: () => ['section[aria-label="Today"]'],
    button: "Next",
  },
  {
    needsTask: true,
    text: () => (
      <>
        Persistent tasks never go away. You can repeat them as many times as you want. Customize how often you want to see them: every 3 days, 2 weeks, 9 months, ...
      </>
    ),
    target: (ctx) => [part("persistent"), MENU, dots(ctx)],
    button: "Next",
  },
  {
    needsTask: true,
    text: () => (
      <>
        you can attribute goals or other tags to tasks. I recommend giving each big task a goal so you don't get lost in the sauce
        and do tasks just to do them. Later, when creating a list, you can give it tags or goals too, so they automatically transfer to it's
        tasks.
      </>
    ),
    target: (ctx) => [part("labels"), MENU, dots(ctx)],
    button: "Next",
  },
  {
    needsTask: true,
    route: "/",
    text: () => (
      <>
        Give this task a{" "}
        <b>
          <i>Hard deadline</i>
        </b>
        . Next week will do.
      </>
    ),
    target: (ctx) => [part("deadline"), MENU, dots(ctx)],
    done: (ctx) => Boolean(ctx.task?.deadlineDate) && ctx.task?.deadlineType === "hard",
  },
  {
    route: "/",
    text: (ctx) => (
      <>
        There it is. Your {name(ctx)}. Every deadline you have lands in this one table, day by day, with how many related tasks you
        need to do per day to make it. It only gets worse from here.
      </>
    ),
    target: () => ['section[aria-label="All deadlines"]', 'section[aria-label="Deadline pressure"]'],
    needsTask: true,
    // No deadline was given: no table to show.
    skip: (ctx) => !ctx.task?.deadlineDate,
    button: "Great",
  },
  {
    needsTask: true,
    route: "/",
    text: () => (
      <>
        A task with a hard deadline and a couple of subtasks is a big one, and big ones get their own screen. <b>Click your task.</b>
        <br />
        The row, not the text.
      </>
    ),
    target: (ctx) => [row(ctx)],
    // Only a big task has a page of its own to go to.
    skip: (ctx) => !ctx.task || !hasTaskPage(ctx.task),
    done: (ctx) => ctx.path.startsWith("/tasks/"),
  },
  {
    text: () => (
      <>
        This is a separate table for each task. it calculates how many days you have, each day writes down how many tasks you did
        and how many tasks you have left till you finish.
        <br />
        Most important is the column on the right. Tells you how many tasks you need to do on average to finish the big task. Tick
        subtasks and watch the pace drop. Or don't, and watch it climb.
      </>
    ),
    target: () => ['[aria-label="Countdown"]'],
    needsTask: true,
    route: (ctx) => ctx.task && `/tasks/${ctx.task.id}`,
    skip: (ctx) => !ctx.task || !hasTaskPage(ctx.task),
    button: "Back",
  },
  {
    route: "/",
    text: () => (
      <>
        Here you make lists. They are a collections of tasks.
        <br />
        Now make a new list. I want you to flip its
        switch to Reward. That's where your points are worth something.
      </>
    ),
    target: () => ['[data-tile="newList"]'],
    note: (ctx) => ({ rewards: rewardLists(ctx) }),
    done: (ctx) => rewardLists(ctx) > ctx.base.rewards,
  },
  {
    route: "/",
    text: () => <>grab a tab by it's handle and reorder it</>,
    target: () => [HANDLE],
    note: (ctx) => ({ arranged: ctx.arranged }),
    done: (ctx) => ctx.arranged !== ctx.base.arranged,
  },
  {
    route: "/",
    text: () => <>grab a tab by it's handle and pull it to the right to create a new colum</>,
    // The handle to grab; once a box is in the air, the strip at the right edge to drop it on.
    target: () => ['[data-zone="new"]', HANDLE],
    also: () => [HANDLE],
    // One column is all a narrow screen has.
    skip: () => document.querySelector<HTMLElement>("[data-tile-grid]")?.dataset.fits === "1",
    note: (ctx) => ({ columns: Math.max(1, ctx.columns) }),
    done: (ctx) => ctx.columns > ctx.base.columns,
  },
  {
    route: "/",
    text: () => <>before you become a slob, learn to minimize your lists and tabs, regardless of folders, tasks, stats,..</>,
    target: () => ['[data-tile="tags"] .tile-button-min', '[data-tile="goals"] .tile-button-min', ".tile-button-min"],
    note: (ctx) => ({ hidden: ctx.hidden }),
    done: (ctx) => ctx.hidden > ctx.base.hidden,
  },
  {
    text: () => <>Better. It waits in the Hidden row at the bottom if you ever miss it.</>,
    target: () => ['[aria-label="Hidden boxes"]'],
    // Nothing was minimized: no Hidden row to point at.
    skip: (ctx) => ctx.hidden === 0,
    button: "Next",
  },
  {
    text: () => (
      <>
        Good. Put your vices in it later. Now click <b>Stats</b>.
      </>
    ),
    target: () => ['header nav [aria-label="Stats"]'],
    done: (ctx) => ctx.path === "/stats",
  },
  {
    text: () => (
      <>
        Your stats. Pathetic right now, I know.
        <br />
        It gets bigger the more you fill it up ;)
      </>
    ),
    route: "/stats",
    button: "…okay",
  },
  {
    text: () => (
      <>
        For separate views of only some tasks or only rewards or whatever, make a folder.
        <br />
        Hit + New, give it a name and a colour, press Enter.
      </>
    ),
    // The tab to press; then the little box that asks for the folder's name and colour.
    target: () => [FOLDER_EDITOR, 'nav [aria-label="New folder"]'],
    also: () => ["[data-folder-tab]"],
    side: "right",
    flag: "tutorialNewFolder",
    note: (ctx) => ({ folders: ctx.folders.length, views: views(ctx) }),
    // Not while the new folder's name is still being typed.
    done: (ctx) => ctx.folders.length > ctx.base.folders && !document.querySelector(FOLDER_EDITOR),
  },
  {
    // The new folder's own page, with nothing on it yet.
    route: (ctx) => ctx.folders.at(-1) && `/folders/${ctx.folders.at(-1)!.id}`,
    // No folder was made: none to show, and none to fill in the step after.
    skip: (ctx) => ctx.folders.length <= ctx.base.folders,
    text: () => <>An empty folder. Impressive.</>,
    target: () => ["[data-folder-title]"],
    button: "Next",
  },
  {
    route: "/",
    text: () => (
      <>
        An empty folder. Impressive.
        <br />
        You can fill it with your lists and junk from the Tasks screen or the Stats screen. The folder only shows a copy of the
        actual list.
        <br />
        Go on: grab a list by the handle on its title band and drop it on your folder's tab.
      </>
    ),
    // The handle to grab; once a list is in the air, the tab to drop it on.
    target: () => ["html[data-dragging-list] [data-folder-tab]", HANDLE],
    also: () => ["[data-folder-tab]"],
    skip: (ctx) => ctx.folders.length === 0,
    done: (ctx) => views(ctx) > ctx.base.views,
  },
  {
    text: () => <>And that's it. I'm tired. You want to change something? Your settings are under your name. Fuck around and find out.</>,
    target: () => ['header [aria-label="Account"]'],
    button: "Get out",
  },
];
