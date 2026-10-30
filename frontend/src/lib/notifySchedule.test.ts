import { describe, expect, it } from "vitest";
import type { TaskTreeNode } from "../types";
import { buildSchedule, dueToday, momentOf, PLAN_DAYS } from "./notifySchedule";
import { NOTIFY_DEFAULTS, normalizeNotifications, reminderSummary, spreadTimes, type NotifySettings, type Reminder } from "./notifySettings";

// Tuesday; its week's Saturday is 2026-10-24 and Sunday 2026-10-25, the next Monday 2026-10-26. The last day planned
// is 2026-11-02.
const today = "2026-10-20";
const early = momentOf(today, "07:00");

function node(id: string, extra: Partial<TaskTreeNode> = {}): TaskTreeNode {
  return {
    id,
    title: id,
    parentId: null,
    listId: "list",
    isComplete: false,
    completedOn: null,
    deadlineDate: null,
    deadlineType: null,
    todaySince: null,
    weekDay: null,
    weekPosition: 0,
    isPersistent: false,
    repeatEvery: null,
    repeatUnit: "day",
    repeatAfterDone: false,
    repeatMakeUp: false,
    roundMoves: null,
    nextDue: null,
    notes: null,
    children: [],
    descendantCount: 0,
    descendantDoneCount: 0,
    ...extra,
  } as TaskTreeNode;
}

const reminder = (kind: Reminder["kind"], extra: Partial<Reminder> = {}): Reminder => ({ id: kind, on: true, kind, days: "all", times: ["08:00"], ...extra });
const settings = (reminders: Reminder[], changes: Partial<NotifySettings> = {}): NotifySettings => ({
  ...NOTIFY_DEFAULTS,
  deadline: { ...NOTIFY_DEFAULTS.deadline, on: false },
  passed: { on: false },
  reminders,
  ...changes,
});
const plan = (trees: TaskTreeNode[], set: NotifySettings, now = early) => buildSchedule(trees, today, now, set, "bottom", "never");
const keyed = <T extends { key: string }>(items: T[], key: string) => items.find((item) => item.key === key)!;

describe("a reminder of the day's tasks", () => {
  // Old was left undone yesterday: it isn't carried on, so no reminder names it. Later is marked for tomorrow.
  const trees = [
    node("Essay", { todaySince: today }),
    node("Gym", { weekDay: today }),
    node("Read", { weekDay: "2026-10-22" }),
    node("Done", { todaySince: today, isComplete: true, completedOn: today }),
    node("Old", { todaySince: "2026-10-19" }),
    node("Later", { todaySince: "2026-10-21" }),
    node("Call", { weekDay: "2026-10-26" }),
  ];

  it("names what is open in Today and planned in the Week that day, at each of its times", () => {
    const items = plan(trees, settings([reminder("today", { times: ["08:00", "12:30"] })]));
    const morning = keyed(items, `r:today:${today}:0800`);
    expect(morning.title).toBe("Today: 2 tasks");
    expect(morning.body).toBe("Essay, Gym");
    expect(keyed(items, `r:today:${today}:1230`).sendAt).toEqual(momentOf(today, "12:30"));
    expect(keyed(items, "r:today:2026-10-21:0800").body).toBe("Later");
    expect(keyed(items, "r:today:2026-10-22:0800").body).toBe("Read");
  });

  it("comes only on the weekdays picked", () => {
    const keys = plan(trees, settings([reminder("today", { days: [0, 3] })])).map((item) => item.key);
    // Thursday 22/10 and Monday 26/10; Thursday 29/10 and Monday 2/11 have nothing to do.
    expect(keys.filter((key) => key.startsWith("r:"))).toEqual(["r:today:2026-10-22:0800", "r:today:2026-10-26:0800"]);
  });

  it("can say tomorrow's and what is still open", () => {
    const items = plan(trees, settings([reminder("tomorrow", { times: ["21:00"] }), reminder("open", { times: ["20:00"] })]));
    expect(keyed(items, `r:tomorrow:${today}:2100`).title).toBe("Tomorrow: 1 task");
    expect(keyed(items, `r:open:${today}:2000`).title).toBe("2 tasks still open today");
  });

  it("is left out on a day with nothing to do, and the last day planned says to open the app", () => {
    const items = plan([], settings([reminder("today")]));
    expect(items.map((item) => item.key)).toEqual(["last:2026-11-02"]);
    expect(items[0].body).toBe("Open Donegeon to keep your reminders coming.");
    expect(PLAN_DAYS).toBe(14);
    // Nothing is carried on: Gym and Read, still open, aren't on that Monday, which says only that.
    const keys = plan(trees, settings([reminder("today")])).map((item) => item.key);
    expect(keys.includes("r:today:2026-11-02:0800")).toBe(false);
    expect(keys.includes("last:2026-11-02")).toBe(true);
  });

  it("leaves out a moment gone by, but not one the server may not have sent yet, nor one switched off", () => {
    const set = settings([reminder("today")]);
    expect(plan(trees, set, momentOf(today, "08:30")).some((item) => item.key === `r:today:${today}:0800`)).toBe(true);
    expect(plan(trees, set, momentOf(today, "10:00")).some((item) => item.key === `r:today:${today}:0800`)).toBe(false);
    expect(plan(trees, settings([reminder("today", { on: false })]))).toEqual([]);
  });
});

describe("next week's plan", () => {
  it("tells the week after the reminder's, day by day, on the day picked", () => {
    // Gym, planned for this week and still open, isn't carried on to next week.
    const trees = [node("Exam", { weekDay: "2026-10-28" }), node("Call", { weekDay: "2026-10-26" }), node("Gym", { weekDay: today })];
    const friday = keyed(plan(trees, settings([reminder("nextWeek", { days: [4], times: ["18:30"] })])), "r:nextWeek:2026-10-23:1830");
    expect(friday.title).toBe("Next week: 2 tasks");
    expect(friday.body).toBe("Mon: Call\nWed: Exam");
  });
});

describe("tasks left undone", () => {
  const trees = [node("Old", { todaySince: "2026-10-19" }), node("Essay", { todaySince: today }), node("Gym", { weekDay: today }), node("Later", { todaySince: "2026-10-21" })];

  it("are pushed only if the user chose so: this morning's, and tomorrow's as today will leave them", () => {
    expect(plan(trees, settings([])).some((item) => item.kind === "undone")).toBe(false);
    const items = plan(trees, settings([], { undone: { push: true, time: "09:15" } })).filter((item) => item.kind === "undone");
    expect(items.map((item) => [item.key, item.title, item.body])).toEqual([
      [`undone:${today}`, "Left undone: 1 task", "Old\nTap to pick when to do them."],
      ["undone:2026-10-21", "Left undone: 3 tasks", "Essay, Gym, Old\nTap to pick when to do them."],
    ]);
    expect(items[0].sendAt).toEqual(momentOf(today, "09:15"));
    expect(items[0].url).toBe("/?bell=1");
  });
});

describe("the week so far", () => {
  it("is the server's to count, from Monday to the reminder's day", () => {
    const items = plan([], settings([reminder("recap", { days: [3], times: ["19:00"] })]));
    const thursday = keyed(items, "r:recap:2026-10-22:1900");
    expect(thursday.kind).toBe("recap");
    expect(thursday.params).toEqual({ from: "2026-10-19", to: "2026-10-22", since: momentOf("2026-10-19", 0).toISOString() });
  });
});

describe("upcoming deadlines", () => {
  it("lists the hard deadlines in the next days, soonest first", () => {
    const trees = [node("Exam", { deadlineDate: "2026-10-27", deadlineType: "hard" }), node("Essay", { deadlineDate: "2026-10-23", deadlineType: "hard" }), node("Soft", { deadlineDate: "2026-10-22", deadlineType: "soft" })];
    const item = keyed(plan(trees, settings([reminder("deadlines", { ahead: 7 })])), `r:deadlines:${today}:0800`);
    expect(item.title).toBe("2 deadlines in the next 7 days");
    expect(item.body).toBe("Fri 23/10: Essay\nTue 27/10: Exam");
  });
});

describe("a reminder of the user's own", () => {
  it("on a task says the task, and has Done and Snooze; a persistent one's Done presses it", () => {
    const water = node("Water the plants", { id: "w", isPersistent: true });
    const items = plan([node("Home", { children: [water] })], settings([reminder("text", { taskId: "w", times: ["09:00", "15:00"] })]));
    const item = keyed(items, `r:text:${today}:0900`);
    expect([item.title, item.body]).toEqual(["Water the plants", "in Home"]);
    expect(item.params).toEqual({ taskId: "w", press: true, actions: ["done", "snooze"] });
  });

  it("on a task opens the task: its row, by its id, when it has no page of its own", () => {
    const item = plan([node("Brush teeth", { id: "b", isPersistent: true })], settings([reminder("text", { taskId: "b" })]))[0];
    expect(item.url).toBe("/?task=b");
  });

  it("coming on days it's due says which day, for a Done from a notification to call it off", () => {
    const daily = node("Brush teeth", { id: "b", isPersistent: true, repeatEvery: 1, repeatUnit: "day", nextDue: today });
    const item = keyed(plan([daily], settings([reminder("text", { taskId: "b", days: "due" })])), `r:text:${today}:0800`);
    expect(item.params?.dueDay).toBe(today);
  });

  it("on a task stops once it is ticked or gone", () => {
    const set = settings([reminder("text", { taskId: "t" })]);
    expect(plan([node("Call", { id: "t", isComplete: true, completedOn: today })], set).filter((item) => item.key.startsWith("r:"))).toEqual([]);
    expect(plan([], set).filter((item) => item.key.startsWith("r:"))).toEqual([]);
  });

  it("on a task on a schedule can come only on the days it is due: not before its round, and on until it is pressed", () => {
    const pills = node("Pills", { id: "p", isPersistent: true, repeatEvery: 2, repeatUnit: "day", nextDue: "2026-10-22" });
    const keys = plan([pills], settings([reminder("text", { taskId: "p", days: "due" })])).map((item) => item.key);
    expect(keys.slice(0, 2)).toEqual(["r:text:2026-10-22:0800", "r:text:2026-10-23:0800"]);
  });

  it("with its own words and a note opens the note, with Snooze", () => {
    const item = plan([], settings([reminder("text", { text: "Read it again", noteId: "n", linkTitle: "Recipes" })]))[0];
    expect([item.title, item.body, item.url]).toEqual(["Read it again", "Recipes", "/notes/n"]);
    expect(item.params).toEqual({ actions: ["snooze"] });
  });
});

describe("hard deadlines", () => {
  const set = settings([], { deadline: { on: true, dayBefore: true, days: { on: true, amount: 3 }, weeks: { on: true, amount: 1 }, time: "09:15" } });

  it("are told of the day before, some days before and some weeks before, at their own time", () => {
    const essay = node("Essay", { id: "e", deadlineDate: "2026-10-30", deadlineType: "hard", descendantCount: 4, descendantDoneCount: 1 });
    const items = plan([essay], set);
    expect(items.map((item) => [item.key, item.title])).toEqual([
      ["deadline:2026-10-30:e:7", "Deadline in 1 week: Essay"],
      ["deadline:2026-10-30:e:3", "Deadline in 3 days: Essay"],
      ["deadline:2026-10-30:e:1", "Deadline tomorrow: Essay"],
    ]);
    expect(items[2].sendAt).toEqual(momentOf("2026-10-29", "09:15"));
    expect(items[2].body).toBe("Fri 30/10 · 4 of 5 left");
  });

  it("leave out soft and finished deadlines, and notices whose day has gone", () => {
    const trees = [
      node("soft", { deadlineDate: "2026-10-30", deadlineType: "soft" }),
      node("done", { deadlineDate: "2026-10-30", deadlineType: "hard", isComplete: true }),
      node("soon", { deadlineDate: "2026-10-21", deadlineType: "hard" }),
    ];
    expect(plan(trees, set).map((item) => item.key)).toEqual(["deadline:2026-10-21:soon:1"]);
  });

  it("gone by with work left are told of the morning after", () => {
    const trees = [node("Late", { id: "l", deadlineDate: "2026-10-19", deadlineType: "hard" }), node("Old", { deadlineDate: "2026-10-01", deadlineType: "hard" })];
    const items = plan(trees, settings([], { passed: { on: true } }));
    expect(items.map((item) => [item.key, item.url])).toEqual([["passed:2026-10-19:l", "/?bell=1"]]);
    expect(items[0].sendAt).toEqual(momentOf(today, "08:00"));
  });
});

describe("the settings", () => {
  it("start with round one's reminders, and fill in what is missing or broken", () => {
    expect(normalizeNotifications(null)).toEqual(NOTIFY_DEFAULTS);
    const saved = normalizeNotifications({
      deadline: { weeks: { on: true, amount: 4 }, time: "23:30" },
      reminders: [{ id: "a", kind: "today", times: ["06:00", "21:00", "21:00"], days: [9, 2] }, { id: "b", kind: "today", times: ["23:00"] }, { id: "c", kind: "nope", times: ["08:00"] }],
    });
    expect(saved.deadline.weeks).toEqual({ on: true, amount: 4 });
    expect(saved.deadline.time).toBe("08:00");
    expect(saved.reminders).toEqual([{ id: "a", on: true, kind: "today", days: [2], times: ["21:00"] }]);
    expect(normalizeNotifications({ reminders: [] }).reminders).toEqual([]);
    expect(normalizeNotifications({ bell: "actions" }).bell).toBe("actions");
    expect(normalizeNotifications({ bell: "nope" }).bell).toBe("all");
  });

  it("spread times evenly, and say when a reminder comes", () => {
    expect(spreadTimes(3, "09:00", "21:00")).toEqual(["09:00", "15:00", "21:00"]);
    expect(spreadTimes(4, "09:00", "10:00")).toEqual(["09:00", "09:20", "09:40", "10:00"]);
    expect(reminderSummary({ days: [0, 3], times: ["18:30"] })).toBe("Mon, Thu · 18:30");
    expect(reminderSummary({ days: "all", times: ["09:00", "15:00"], spread: { count: 2, from: "09:00", to: "15:00" } })).toBe("Every day · 2 times from 09:00 to 15:00");
  });
});

describe("the bell showing everything", () => {
  it("lists today's messages once their time has come, the latest first; not what it lists one by one", () => {
    const trees = [node("Essay", { todaySince: today }), node("Old", { todaySince: "2026-10-19" }), node("Due", { id: "d", deadlineDate: "2026-10-21", deadlineType: "hard" }), node("Gone", { id: "g", deadlineDate: "2026-10-19", deadlineType: "hard" })];
    const set = settings([reminder("today"), reminder("open", { times: ["20:00"] })], { deadline: { ...NOTIFY_DEFAULTS.deadline, time: "08:30" }, passed: { on: true }, undone: { push: true, time: "08:00" } });
    expect(dueToday(trees, today, momentOf(today, "09:00"), set, "bottom", "never").map((item) => item.key)).toEqual(["deadline:2026-10-21:d:1", `r:today:${today}:0800`]);
    expect(dueToday(trees, today, momentOf(today, "21:00"), set, "bottom", "never")[0].key).toBe(`r:open:${today}:2000`);
  });
});
