import type { StatTask } from "./stats";

/** A task as the stats see it, for tests: open, in "list-a", written on 1 October; `over` changes what a test is about. */
export function statTask(over: Partial<StatTask> = {}): StatTask {
  return {
    id: over.id ?? "t",
    title: "A task",
    isRoot: true,
    listId: "list-a",
    goalIds: [],
    tagIds: [],
    deadlineDate: null,
    deadlineKind: null,
    isPersistent: false,
    habit: null,
    createdAt: new Date("2026-10-01T10:00:00"),
    createdOn: "2026-10-01",
    completedOn: null,
    closedOn: null,
    isOpen: true,
    isLoose: true,
    ...over,
  };
}
