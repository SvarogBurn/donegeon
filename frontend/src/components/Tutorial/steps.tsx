import { useState, type ReactNode } from "react";
import { hasTaskPage } from "../../lib/taskPage";
import { NEW_LIST_TILE } from "../../lib/tileLayout";
import type { Folder, List, TaskTreeNode } from "../../types";

/** What a step can look at: the account's data, the page that is open, and what the tutorial has noted so far. */
export interface TutorialContext {
  tasks: TaskTreeNode[];
  lists: List[];
  folders: Folder[];
  /** How many boxes of the Tasks page are minimized. */
  hidden: number;
  /** Which ones: their keys ("search", "tags", "list:<id>"). */
  hiddenBoxes: string[];
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
  /** A phone's width: the steps that only show something more are left out, and the words are kept small. */
  isNarrow: boolean;
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
  /** The target is lit but not pointed at: there is nothing to do with it. */
  noArrow?: boolean;
  /** Set on <html> (as data-...) while the step is on, for index.css to show something that is otherwise out of sight. */
  flag?: string;
  /** A box of the Tasks page this step needs: brought back from the Hidden row when the step begins. */
  show?: string;
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
/** Main tasks that carry something a typed shortcut sets: points, a deadline, a Today mark, a tag, a goal or a schedule. */
const withShortcuts = (ctx: TutorialContext) =>
  ctx.tasks.filter((task) => task.points !== null || task.deadlineDate || task.isPersistent || task.tagIds.length + task.goalIds.length > 0 || (task.todaySince && task.listId)).length;
const withDeadline = (ctx: TutorialContext) => ctx.tasks.filter((task) => task.deadlineDate).length;
/** Every list's box: lit where something is made, so the new thing doesn't land in the dark. */
const LISTS = '[data-tile^="list:"]';
/** The box of the list the tutorial's task is in. */
const listOf = (ctx: TutorialContext) => `${LISTS}:has(${row(ctx)})`;
const ADD_FIELD = '[data-tile^="list:"] [data-task-editor^="add:"]';
const FOLDER_EDITOR = 'nav [role="dialog"][aria-label^="Folder"]';
const TODAY = 'section[aria-label="Today"]';
const CHARACTER = 'section[aria-label="Character"]';
const EDIT = "[data-character-edit]";
const EDITOR = "[data-character-editor]";
/** The steps in the character editor are passed over once it is closed (or was never opened). */
const noEditor = () => !document.querySelector(EDITOR);
const count = (selector: string) => document.querySelectorAll(selector).length;
/** A number that changes when the text in `selector` does. */
const textOf = (selector: string) => [...(document.querySelector(selector)?.textContent ?? "")].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) | 0, 0);
const BODY = `${EDITOR} [data-stepper="body"]`;
const STATS = `${EDITOR} [data-editor-section="stats"]`;
const LONGEST = 'input[data-stat-switch="longest"]';
const WEEK = 'input[data-stat-switch="week"]';
/** The skill just added: the last one. */
const NEW_SKILL = `${EDITOR} [data-skill-editor]:last-of-type`;
/** What the new skill is called: its own name if one was written, else its list's, goal's or tag's. */
const skillName = () =>
  document.querySelector<HTMLInputElement>(`${NEW_SKILL} [data-skill-name]`)?.value.trim() ||
  document.querySelector<HTMLSelectElement>(`${NEW_SKILL} [data-skill-source]`)?.selectedOptions[0]?.text ||
  "it";

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
        <br />A gamified task manager where you do tasks to earn points with me. Then, you spend those points on doing
        things you enjoy and love (like scrolling YouTube, playing games, building passion projects). Gotta love capitalism
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
    also: () => [LISTS],
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
    also: (ctx) => [listOf(ctx)],
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
    also: (ctx) => [listOf(ctx)],
    done: (ctx) => subtasks(ctx) >= 2,
  },
  {
    needsTask: true,
    route: "/",
    text: () => <b>Another.</b>,
    target: (ctx) => [tree(ctx)],
    also: (ctx) => [listOf(ctx)],
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
    also: (ctx) => [listOf(ctx)],
    done: (ctx) => subtasks(ctx) >= 4,
  },
  {
    text: () => (
      <>
        <b>I'm just messing with you.</b> You can stop breaking it down into baby steps. Although breaking it down as much as you
        can, helps.
        <br />
        By default a subtask is worth no points. It can also be worth what its main task is, or have an amount of its own.
      </>
    ),
    target: (ctx) => [tree(ctx)],
    also: (ctx) => [listOf(ctx)],
    noArrow: true,
    needsTask: true,
    button: "Very funny",
  },
  {
    needsTask: true,
    route: "/",
    text: () => (
      <>
        Every task has a <b>⋯</b> at the end of its row... I know a guy who went his whole life without touching those three dots.
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
    text: () => <>Here are the points you earn or lose. Every task can have its own amount, subtasks too. Leave it empty and it'll have the points from the list by default.</>,
    target: (ctx) => [part("points"), MENU, dots(ctx)],
    button: "Next",
  },
  {
    needsTask: true,
    text: () => (
      <>
        Two types of deadlines to watch out for: Hard and soft, or as my friend Snake says, Erect and Flaccid.
        <br />
        Hard deadlines are things you must do. Miss it and there are consequences.
        <br />A Soft ones are self-imposed, the kind that says "I'll do it tomorrow".
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
        tasks. You can also filter by going to the goals or tags panel so it shows only tasks from that goal/task.
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
        There it is. Your {name(ctx)}. Every deadline you have lands in this one table, with how many related tasks you
        need to do per day to make it.
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
        Most of what the menu does can be typed. Add a task and put a shortcut in its title, for example <b>Buy milk @today 5p</b>. The
        chips under the field show what the task will get.
      </>
    ),
    // The field to type in, with what opens under it: the dropdown and the chips.
    target: () => [ADD_FIELD, '[data-tile^="list:"]'],
    also: () => [LISTS, "[data-syntax-options]", "[data-syntax-chips]"],
    note: (ctx) => ({ typed: withShortcuts(ctx) }),
    done: (ctx) => withShortcuts(ctx) > ctx.base.typed,
  },
  {
    route: "/",
    text: () => (
      <>
        <b>#tag</b>, <b>^goal</b>, <b>@date</b> for a hard deadline, <b>~date</b> for a soft one, <b>/list</b> to send it to another
        list. A backslash in front keeps the character as plain text. The whole list is on your user page.
      </>
    ),
    target: () => [ADD_FIELD, '[data-tile^="list:"]'],
    also: () => [LISTS],
    // On a phone the one shortcut just tried is enough; the rest is on the cheat sheet.
    skip: (ctx) => ctx.isNarrow,
    button: "Next",
  },
  {
    route: "/",
    text: (ctx) => (
      <>
        Titles can be styled. {!ctx.isTouch && (
          <>
            Select some words and press <b>Ctrl+B</b>, <b>Ctrl+I</b> or <b>Ctrl+U</b>. You can also type the markers yourself:
          </>
        )}
        {ctx.isTouch && "Type the markers around the words:"} **bold**, *italic*, __underline__, ==highlight==, ~~crossed out~~.
      </>
    ),
    target: (ctx) => [...(ctx.task ? [row(ctx)] : []), ADD_FIELD, '[data-tile^="list:"]'],
    // Its keys want a keyboard.
    skip: (ctx) => ctx.isNarrow,
    button: "Next",
  },
  {
    route: "/",
    text: () => (
      <>
        The search looks through everything: tasks (finished ones too), lists, goals, tags and pages. Picking a goal or a tag filters the
        lists by it.
      </>
    ),
    // The installed app has only the spyglass in its top strip until it is tapped.
    target: () => [document.querySelector("[data-site-search]") ? "[data-site-search]" : 'header [aria-label="Search"]'],
    // Minimized away: nothing to point at.
    skip: (ctx) => ctx.hiddenBoxes.includes("search"),
    button: "Next",
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
    also: () => [LISTS],
    // It starts minimized.
    show: NEW_LIST_TILE,
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
    // The new-list field, done with now.
    target: () => ['[data-tile="newList"] .tile-button-min', ".tile-button-min"],
    done: (ctx) => ctx.hiddenBoxes.includes(NEW_LIST_TILE),
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
    route: "/",
    text: () => (
      <>
        Back to Tasks. This is your <b>Today</b> box: your daily tasks. What you marked Do today, what's due, and whatever you type
        straight in here. Ticked ones stay till the day is over, so you can admire them.
      </>
    ),
    target: () => [TODAY],
    // Minimized away: nothing to show.
    skip: (ctx) => ctx.hiddenBoxes.includes("today"),
    button: "Next",
  },
  {
    route: "/",
    text: () => (
      <>
        Under it is the bin for next week. Drag a task you won't touch today in there and it's out of your sight till Monday. Out of
        sight, not off the hook.
      </>
    ),
    target: () => [`${TODAY} [data-next-week]`, TODAY],
    also: () => [TODAY],
    skip: (ctx) => ctx.hiddenBoxes.includes("today"),
    button: "Next",
  },
  {
    route: "/",
    text: () => (
      <>
        Now your weekly tasks. Click the <b>Week</b> tab.
      </>
    ),
    target: () => [`${TODAY} [role="tab"][data-drop-week]`],
    also: () => [TODAY],
    skip: (ctx) => ctx.hiddenBoxes.includes("today"),
    done: () => Boolean(document.querySelector(`${TODAY} [role="tab"][data-drop-week][aria-selected="true"]`)),
  },
  {
    route: "/",
    text: () => (
      <>
        Monday to Sunday. Drag your tasks onto the days you'll actually do them. The next week bin is at the bottom here too, and
        whatever you leave open rolls over onto next Monday. Yes, it keeps count.
      </>
    ),
    target: () => [TODAY],
    noArrow: true,
    skip: (ctx) => ctx.hiddenBoxes.includes("today"),
    button: "Next",
  },
  {
    text: () => (
      <>
        Deadlines are easier to read on a calendar. Click <b>Calendar</b>.
      </>
    ),
    target: () => ['header nav [aria-label="Calendar"]'],
    done: (ctx) => ctx.path === "/calendar",
  },
  {
    route: "/calendar",
    text: () => (
      <>
        Each column is a day, starting today. A day lists what is due on it: deadlines, repeating tasks, and what you marked for Today.
        Drag the row sideways, or use the arrows, to see other days.
      </>
    ),
    target: () => ['section[aria-label="Days"]'],
    button: "Next",
  },
  {
    route: "/calendar",
    text: () => (
      <>
        Press <b>+ Add</b> under a day and write a task. It gets that day as a soft deadline.
      </>
    ),
    // The button to press; then the field it opens.
    target: () => ["[data-add-on]", 'section[aria-label="Days"] [aria-label^="Add a task on"]'],
    also: () => ['section[aria-label="Days"]'],
    // A day only offers "+ Add" when there is a task list to add to.
    skip: (ctx) => !ctx.lists.some((list) => list.kind === "task"),
    note: (ctx) => ({ dated: withDeadline(ctx) }),
    done: (ctx) => withDeadline(ctx) > ctx.base.dated,
  },
  {
    route: "/calendar",
    text: () => (
      <>
        The month shows how much is due and done on each day. Click a day to bring the Days row to it, or a task's name to see more about
        it. Both boxes can be moved, like the ones on Tasks.
      </>
    ),
    target: () => ['section[aria-label="Calendar"]'],
    skip: (ctx) => ctx.isNarrow,
    button: "Next",
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
    // The whole page is lit: the emptiness is the thing to see.
    target: () => ["[data-folder-title]"],
    also: () => ["main"],
    button: "Next",
  },
  {
    route: "/",
    text: () => (
      <>
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
    text: () => <>Your own page is behind the face in the bar. Click it.</>,
    target: () => ['header [aria-label="Account"]'],
    done: (ctx) => ctx.path === "/user",
  },
  {
    route: "/user",
    text: () => (
      <>
        <b>Meet yourself!</b>
        <br />I am here to get you from an ugly duckling into a majestic swan. You haven't done any tasks yet, so you are currently level
        one... ugly, ugly, duckling.
      </>
    ),
    target: () => [CHARACTER],
    button: "Next",
  },
  {
    route: "/user",
    text: () => <>This is a donegeon after all, and to get through you need to get exp, collect points and level up!</>,
    target: () => [CHARACTER],
    noArrow: true,
    button: "Next",
  },
  {
    route: "/user",
    text: () => (
      <>
        Every task, subtasks, bug and feature report you send is 1 exp. The higher level you are, the more customization options you
        have. Certain items are only unlockable with the streak.
      </>
    ),
    target: () => [`${CHARACTER} .exp-bar`, CHARACTER],
    also: () => [CHARACTER],
    button: "Next",
  },
  {
    route: "/user",
    text: () => <>Here you can also see your basic stats and skills (hahaha you barely have any yet)</>,
    target: () => ["[data-character-stats]", CHARACTER],
    also: () => [CHARACTER],
    button: "Next",
  },
  {
    route: "/user",
    text: () => (
      <>
        Now make it look less like a stranger. Press <b>Edit</b>.
      </>
    ),
    target: () => [EDIT],
    also: () => [CHARACTER],
    // Offline the editor can't be opened (nothing could be saved): the steps in it are passed over too.
    skip: () => Boolean(document.querySelector(`${EDIT}:disabled`)),
    done: () => !noEditor(),
  },
  {
    text: () => <>Each body is a whole drawing. Flip through them with ◀ ▶.</>,
    target: () => [BODY, EDIT],
    also: () => [`${EDITOR} .character-stage`],
    flag: "tutorialEditor",
    skip: noEditor,
    note: () => ({ body: textOf(BODY) }),
    done: (ctx) => textOf(BODY) !== ctx.base.body,
  },
  {
    text: () => <>Every body has its own bits that come and go: hats, hair, horns, tails.</>,
    target: () => [`${EDITOR} [data-stepper]:not([data-stepper="body"])`, EDIT],
    also: () => [`${EDITOR} [data-stepper]:not([data-stepper="body"])`, `${EDITOR} .character-stage`],
    flag: "tutorialEditor",
    // A body with nothing to change has no rows to show; on a phone the colours are enough.
    skip: (ctx) => noEditor() || ctx.isNarrow || count(`${EDITOR} [data-stepper]`) < 2,
    button: "Next",
  },
  {
    text: () => <>You can change the colors too!</>,
    target: () => [`${EDITOR} [data-color-row]`, EDIT],
    also: () => [`${EDITOR} [data-color-row]`, `${EDITOR} .character-stage`],
    flag: "tutorialEditor",
    skip: noEditor,
    button: "Next",
  },
  {
    text: () => <>Certain options unlock once you show some grit and get through Donegeon ;)</>,
    target: () => [`${EDITOR} [data-editor-section="look"]`, EDIT],
    noArrow: true,
    flag: "tutorialEditor",
    skip: noEditor,
    button: "Next",
  },
  {
    text: () => <>Finish setting up your charararacter. When you are done, click next.</>,
    // All of the Look is lit, to play with; the words keep to the bottom of the screen.
    target: () => [`${EDITOR} [data-editor-section="look"]`, EDIT],
    noArrow: true,
    flag: "tutorialEditor",
    skip: noEditor,
    button: "Next",
  },
  {
    text: () => (
      <>
        Not my first choice for a mug but I am glad you like it. Less ugly.
        <br />
        Let's set up the stats you see. Click on the <b>Stats</b> tab.
      </>
    ),
    target: () => ['[data-editor-tab="stats"]', EDIT],
    also: () => [`${EDITOR} .character-stage`],
    flag: "tutorialEditor",
    skip: noEditor,
    done: () => Boolean(document.querySelector('[data-editor-tab="stats"][aria-selected="true"]')),
  },
  {
    text: () => (
      <>
        The ticked stats are what you will see on your profile. Currently you see your streak, your longest streak and how many tasks you
        have done this year.
        <br />
        <b>Untick your longest streak, and show the tasks done in the last 7 days.</b>
      </>
    ),
    // The longest streak while it is ticked; then the 7 days while they are not.
    target: () => [`label:has(${LONGEST}:checked)`, `label:has(${WEEK}:not(:checked))`, `${STATS} > ul`, EDIT],
    also: () => [`${STATS} > ul`],
    flag: "tutorialEditor",
    skip: noEditor,
    done: () => !document.querySelector(`${LONGEST}:checked`) && Boolean(document.querySelector(`${WEEK}:checked`)),
  },
  {
    text: () => (
      <>
        Let's see those skills you desperately want to upgrade. Click the <b>Skills</b> tab.
      </>
    ),
    target: () => ['[data-editor-tab="skills"]', EDIT],
    flag: "tutorialEditor",
    skip: noEditor,
    done: () => Boolean(document.querySelector('[data-editor-tab="skills"][aria-selected="true"]')),
  },
  {
    text: () => (
      <>
        Let's create our first skill.
        <br />
        Every skill you make will be connected to a tag, goal or list. Every time you solve a task from one of them, your skill will gain
        exp and level up as well. Press <b>+ Skill</b>.
      </>
    ),
    target: () => ["[data-add-skill]", EDIT],
    also: () => ['[data-editor-section="skills"]'],
    flag: "tutorialEditor",
    // Every list, goal and tag is a skill already: nothing left to add, and no new skill to name.
    skip: () => noEditor() || Boolean(document.querySelector("[data-add-skill]:disabled")),
    note: () => ({ skills: count("[data-skill-editor]") }),
    done: (ctx) => count("[data-skill-editor]") > ctx.base.skills,
  },
  {
    text: (ctx) => {
      const list = ctx.lists.find((l) => l.kind === "task" && l.name === "List")?.name;
      return (
        <>
          Choose to link it to {list ? <>the list named <b>{list}</b></> : "one of your lists"}. You will write all your tasks connected to
          this skill in {list ? <>the list named <b>{list}</b></> : "that list"}.
          <br />
          What will the skill name be? Cooking? Cleaning? <b>Write it down.</b>
        </>
      );
    },
    target: () => [`${NEW_SKILL} [data-skill-source]`, EDIT],
    also: () => [NEW_SKILL],
    flag: "tutorialEditor",
    // No skill was added: none to name.
    skip: (ctx) => noEditor() || count("[data-skill-editor]") <= ctx.base.skills,
    button: "Written",
  },
  {
    text: () => (
      <>
        Good, I want to get proficient in <b>{skillName()}</b>. Let me write that down real quick...
      </>
    ),
    target: () => [NEW_SKILL, EDIT],
    noArrow: true,
    flag: "tutorialEditor",
    skip: (ctx) => noEditor() || count("[data-skill-editor]") <= ctx.base.skills,
    button: "Next",
  },
  {
    text: () => <>Don't forget to save :)</>,
    target: () => ["[data-editor-save]", EDIT],
    flag: "tutorialEditor",
    skip: noEditor,
    done: noEditor,
  },
  {
    route: "/user",
    text: () => (
      <>
        Got notes that belong to no task? There's a <b>Notes</b> tab for those. Tick it here to show it in the bar, untick it to hide it
        again.
      </>
    ),
    target: () => ["label:has([data-notes-tab])", 'section[aria-label="Settings"]'],
    also: () => ['section[aria-label="Settings"]'],
    button: "Next",
  },
  {
    route: "/user",
    text: () => (
      <>
        Your streak counts the days in a row with at least one task done. In Settings you can cap your points, ask for a break reminder,
        switch the boxes to a plain font, and start this tutorial again.
      </>
    ),
    target: () => ['section[aria-label="Settings"]'],
    button: "Next",
  },
  {
    route: "/user",
    text: () => <>Refer to the cheat sheet for speedy task and note taking.</>,
    target: () => ["[data-cheatsheet]"],
    button: "Next",
  },
  {
    route: "/user",
    text: () => <>Got a bug, or a cool, or lukewarm idea to recommend? Send me a mail. I read each and every one, plus you get more exp!</>,
    target: () => ['section[aria-label="Send mail to devs"]'],
    button: "Next",
  },
  {
    text: () => <>And that's it. I'm tired. You want to change something? Your settings are under your face. Fuck around and find out.</>,
    target: () => ['header [aria-label="Account"]'],
    button: "Get out",
  },
];
