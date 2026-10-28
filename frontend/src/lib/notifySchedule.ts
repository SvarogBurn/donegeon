import { addDays, daysBetween, mondayOf } from "../../../shared/dates";
import type { DeadlineToday, TaskTreeNode, TickedTasks } from "../types";
import { formatDay } from "./dates";
import { plainFirstLine } from "./markup";
import { KIND_NAMES, type NotifySettings, type Reminder } from "./notifySettings";
import { isDue } from "./repeat";
import { hasTaskPage } from "./taskPage";
import { livesInToday, todayItems, weekDays } from "./week";

/**
 * The notifications the app plans and the server sends at their moment (PUT /notifications/schedule). Worked out
 * from the task trees as they are now: a change to the tasks plans them all again, so what a message says is what
 * the day will hold unless something changes, and then it is planned again.
 */
export interface Planned {
  /** Names it once: a key that was sent is never sent again, however often the plan is sent. */
  key: string;
  kind: "reminder" | "deadline" | "passed" | "recap";
  /** The instant, on this device's clock and time zone. */
  sendAt: Date;
  title: string;
  body: string;
  /** The page a tap opens. */
  url: string;
  /** What the bell calls it: the reminder's kind ("Today's tasks"), "Reminder", "Deadline coming". Not sent. */
  label?: string;
  /**
   * The recap's week, which the server counts when it sends it; a task reminder's task, whose Done ticks it (or
   * presses it: `press`); the buttons under it.
   */
  params?: { from?: string; to?: string; since?: string; taskId?: string; press?: boolean; actions?: ("done" | "snooze")[] };
}

/** How many days ahead the reminders are planned: opening the app once a fortnight keeps them coming. */
export const PLAN_DAYS = 14;
/** A moment this long gone is still planned: the server may not have sent it yet. */
const STILL_DUE_MS = 60 * 60_000;
/** The most the server takes at once: the soonest go. */
const MAX_PLANNED = 300;
const MAX_BODY = 500;
/** Titles named in a message before "+N more". */
const NAMED = 4;
const LAST_LINE = "Open Donegeon to keep your reminders coming.";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** 0 = Monday. */
const weekdayIndex = (day: string) => daysBetween(mondayOf(day), day);
const weekday = (day: string) => WEEKDAYS[weekdayIndex(day)];

/** `time` ("HH:MM", or a whole hour) on `day`, on this device. */
export function momentOf(day: string, time: string | number): Date {
  const [year, month, date] = day.split("-").map(Number);
  const [hours, minutes] = typeof time === "number" ? [time, 0] : time.split(":").map(Number);
  return new Date(year, month - 1, date, hours, minutes);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const clip = (text: string) => (text.length > MAX_BODY ? `${text.slice(0, MAX_BODY - 1)}…` : text);

/** "Essay, Gym, Read, Call mum, +2 more". */
function named(nodes: TaskTreeNode[]): string {
  const titles = nodes.slice(0, NAMED).map((node) => plainFirstLine(node.title));
  return [...titles, ...(nodes.length > NAMED ? [`+${nodes.length - NAMED} more`] : [])].join(", ");
}

const byId = (nodes: TaskTreeNode[]) => [...new Map(nodes.map((node) => [node.id, node])).values()];

/**
 * What there is to do on `day`: what Today will show (marked for it, due, its deadline near if the user chose so,
 * written straight into it) and what the Week box has planned that day. Open ones only.
 */
export function tasksOn(trees: TaskTreeNode[], day: string, ticked: TickedTasks, deadlines: DeadlineToday): TaskTreeNode[] {
  const today = todayItems(trees, day, ticked, deadlines).map((item) => item.node);
  const own = trees.filter(livesInToday);
  const planned = weekDays(trees, day, ticked, deadlines).find((week) => week.day === day && !week.nextWeek)?.items.map((item) => item.node) ?? [];
  return byId([...today, ...own, ...planned]).filter((node) => !node.isComplete);
}

/** Open hard deadlines, on main tasks and their direct subtasks (where deadlines can be), with the title of the task above. */
function hardDeadlines(trees: TaskTreeNode[]): { node: TaskTreeNode; under?: string }[] {
  const found: { node: TaskTreeNode; under?: string }[] = [];
  for (const main of trees) {
    if (main.isComplete) continue;
    if (main.deadlineDate && main.deadlineType === "hard") found.push({ node: main });
    for (const child of main.children) {
      if (!child.isComplete && child.deadlineDate && child.deadlineType === "hard") found.push({ node: child, under: plainFirstLine(main.title) });
    }
  }
  return found;
}

/** A task anywhere in the trees, with the titles of the tasks above it. */
export function findTask(trees: TaskTreeNode[], id: string, path: string[] = []): { node: TaskTreeNode; path: string[] } | null {
  for (const node of trees) {
    if (node.id === id) return { node, path };
    const below = findTask(node.children, id, [...path, plainFirstLine(node.title)]);
    if (below) return below;
  }
  return null;
}

const inDays = (days: number) => (days === 1 ? "tomorrow" : days % 7 === 0 ? `in ${plural(days / 7, "week")}` : `in ${plural(days, "day")}`);
const dateOf = (day: string) => `${weekday(day)} ${formatDay(day)}`;

/** "Fri 30/10 · 5 of 12 left · in Essay". */
function deadlineBody(node: TaskTreeNode, under: string | undefined) {
  const total = node.descendantCount + 1;
  const left = total - node.descendantDoneCount;
  return [dateOf(node.deadlineDate!), ...(total > 1 ? [`${left} of ${total} left`] : []), ...(under ? [`in ${under}`] : [])].join(" · ");
}

interface Context {
  trees: TaskTreeNode[];
  ticked: TickedTasks;
  deadlines: DeadlineToday;
}

type Message = Omit<Planned, "key" | "sendAt">;

/** What a reminder says on `day`, or null when it has nothing to say (nothing to do, its task ticked or gone). */
function reminderMessage(reminder: Reminder, day: string, { trees, ticked, deadlines }: Context): Message | null {
  const label = KIND_NAMES[reminder.kind];
  const tasks = (on: string, title: (n: number) => string): Message | null => {
    const nodes = tasksOn(trees, on, ticked, deadlines);
    return nodes.length ? { kind: "reminder", label, title: title(nodes.length), body: clip(named(nodes)), url: "/" } : null;
  };
  switch (reminder.kind) {
    case "today":
      return tasks(day, (n) => `Today: ${plural(n, "task")}`);
    case "open":
      return tasks(day, (n) => `${plural(n, "task")} still open today`);
    case "tomorrow":
      return tasks(addDays(day, 1), (n) => `Tomorrow: ${plural(n, "task")}`);
    case "nextWeek": {
      const week = weekDays(trees, addDays(mondayOf(day), 7), ticked, deadlines).filter((one) => !one.nextWeek);
      const days = week.map((one) => ({ day: one.day, nodes: byId(one.items.map((item) => item.node)).filter((node) => !node.isComplete) })).filter((one) => one.nodes.length);
      const count = days.reduce((sum, one) => sum + one.nodes.length, 0);
      if (!count) return null;
      return { kind: "reminder", label, title: `Next week: ${plural(count, "task")}`, body: clip(days.map((one) => `${weekday(one.day)}: ${named(one.nodes)}`).join("\n")), url: "/" };
    }
    case "recap": {
      // The text is the server's, counted when it is sent.
      const monday = mondayOf(day);
      return { kind: "recap", label, title: "", body: "", url: "/stats", params: { from: monday, to: day, since: momentOf(monday, 0).toISOString() } };
    }
    case "deadlines": {
      const ahead = reminder.ahead ?? 7;
      const last = addDays(day, ahead);
      const coming = hardDeadlines(trees)
        .filter(({ node }) => node.deadlineDate! >= day && node.deadlineDate! <= last)
        .sort((a, b) => a.node.deadlineDate!.localeCompare(b.node.deadlineDate!));
      if (!coming.length) return null;
      return {
        kind: "reminder",
        label,
        title: `${plural(coming.length, "deadline")} in the next ${plural(ahead, "day")}`,
        body: clip(coming.map(({ node }) => `${dateOf(node.deadlineDate!)}: ${plainFirstLine(node.title)}`).join("\n")),
        url: "/",
      };
    }
    case "text": {
      if (reminder.taskId) {
        const found = findTask(trees, reminder.taskId);
        // Ticked, or deleted: its reminders stop (the plan is made again on every tick).
        if (!found || found.node.isComplete) return null;
        const { node, path } = found;
        if (reminder.days === "due" && !(node.repeatEvery && isDue(node, day))) return null;
        const title = plainFirstLine(node.title);
        return {
          kind: "reminder",
          label: "Reminder",
          title: reminder.text ?? title,
          body: [...(reminder.text ? [title] : []), ...(path.length ? [`in ${path.join(" › ")}`] : [])].join("\n"),
          url: hasTaskPage(node) ? `/tasks/${node.id}` : "/",
          params: { taskId: node.id, press: node.isPersistent, actions: ["done", "snooze"] },
        };
      }
      if (reminder.noteId) {
        return { kind: "reminder", label: "Reminder", title: reminder.text ?? reminder.linkTitle ?? "Your note", body: reminder.text ? (reminder.linkTitle ?? "") : "", url: `/notes/${reminder.noteId}`, params: { actions: ["snooze"] } };
      }
      return { kind: "reminder", label: "Reminder", title: reminder.text ?? "Reminder", body: "", url: "/", params: { actions: ["snooze"] } };
    }
  }
}

/** Whether a reminder comes on `day` at all: every day, the weekdays picked, or (on a task) the days it is due, worked out with its message. */
const comesOn = (reminder: Reminder, day: string) => reminder.days === "all" || reminder.days === "due" || reminder.days.includes(weekdayIndex(day));

/**
 * Every notification switched on, from `now` (a little before, see STILL_DUE_MS): the reminders for PLAN_DAYS days
 * from `today`, each at each of its times; the deadline notices for every hard deadline ahead. The last day planned
 * says so. Sorted by moment, at most MAX_PLANNED.
 */
export function buildSchedule(trees: TaskTreeNode[], today: string, now: Date, settings: NotifySettings, ticked: TickedTasks, deadlines: DeadlineToday): Planned[] {
  const planned: Planned[] = [];
  const add = (item: Planned) => {
    if (item.sendAt.getTime() > now.getTime() - STILL_DUE_MS) planned.push(item);
  };
  const context = { trees, ticked, deadlines };
  const { deadline, passed } = settings;
  const reminders = settings.reminders.filter((reminder) => reminder.on);
  const lastDay = addDays(today, PLAN_DAYS - 1);

  for (let i = 0; i < PLAN_DAYS; i++) {
    const day = addDays(today, i);
    for (const reminder of reminders) {
      if (!comesOn(reminder, day)) continue;
      const message = reminderMessage(reminder, day, context);
      if (!message) continue;
      for (const time of reminder.times) add({ ...message, key: `r:${reminder.id}:${day}:${time.replace(":", "")}`, sendAt: momentOf(day, time) });
    }
  }

  for (const { node, under } of hardDeadlines(trees)) {
    const due = node.deadlineDate!;
    const title = plainFirstLine(node.title);
    if (deadline.on) {
      const before = new Set([...(deadline.dayBefore ? [1] : []), ...(deadline.days.on ? [deadline.days.amount] : []), ...(deadline.weeks.on ? [deadline.weeks.amount * 7] : [])]);
      for (const days of before) {
        const day = addDays(due, -days);
        if (day < today) continue;
        add({ key: `deadline:${due}:${node.id}:${days}`, kind: "deadline", label: "Deadline coming", sendAt: momentOf(day, deadline.time), title: `Deadline ${inDays(days)}: ${title}`, body: clip(deadlineBody(node, under)), url: `/tasks/${node.id}` });
      }
    }
    // The deadline day is the last day to work on it: the morning after, it has passed.
    if (passed.on && due >= addDays(today, -1)) {
      add({ key: `passed:${due}:${node.id}`, kind: "passed", sendAt: momentOf(addDays(due, 1), deadline.time), title: `Deadline passed: ${title}`, body: "Tap to pick a new day for it.", url: "/?bell=1" });
    }
  }

  planned.sort((a, b) => a.sendAt.getTime() - b.sendAt.getTime() || a.key.localeCompare(b.key));
  // The last day planned says so: nothing more comes until the app is opened again. On its first message that has
  // words of its own, or, with nothing that day, in a message of its own at the first reminder's time.
  if (reminders.length) {
    const first = planned.find((item) => item.kind === "reminder" && momentOf(lastDay, "00:00") <= item.sendAt && item.sendAt < momentOf(addDays(lastDay, 1), "00:00"));
    if (first) first.body = clip(first.body ? `${first.body}\n${LAST_LINE}` : LAST_LINE);
    else {
      const time = reminders.flatMap((reminder) => reminder.times).sort()[0];
      add({ key: `last:${lastDay}`, kind: "reminder", label: "Donegeon", sendAt: momentOf(lastDay, time), title: "Donegeon", body: LAST_LINE, url: "/" });
      planned.sort((a, b) => a.sendAt.getTime() - b.sendAt.getTime() || a.key.localeCompare(b.key));
    }
  }
  return planned.slice(0, MAX_PLANNED);
}

/**
 * Today's messages whose time has come, for the bell: the reminders and the deadline notices (a deadline gone by is in
 * the bell already, from passedDeadlines; the recap's numbers are the server's). Worked out from the trees as they are
 * now, latest first.
 */
export function dueToday(trees: TaskTreeNode[], today: string, now: Date, settings: NotifySettings, ticked: TickedTasks, deadlines: DeadlineToday): Planned[] {
  const end = momentOf(addDays(today, 1), 0).getTime();
  return buildSchedule(trees, today, momentOf(today, 0), settings, ticked, deadlines)
    .filter((item) => item.kind !== "recap" && item.kind !== "passed" && !item.key.startsWith("last:") && item.sendAt.getTime() <= now.getTime() && item.sendAt.getTime() < end)
    .reverse();
}
