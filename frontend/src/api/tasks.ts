import type { CombinedCountdown, Countdown, DonePage, PointsSummary, PressureSummary, RepeatUnit, SearchResult, StatRow, Task, TaskTreeNode } from "../types";
import type { DashboardLayout } from "../lib/tileLayout";
import { api } from "./client";

/** A place in the tree: under a parent task, or at the top level of a list. */
export interface TaskPlacement {
  parentId: string | null;
  listId: string | null;
  /** Position among the destination's tasks, not counting the task being placed. */
  index: number;
}

export interface TaskChanges {
  title?: string;
  notes?: string | null;
  /** Full replacement sets. */
  goalIds?: string[];
  tagIds?: string[];
  deadlineDate?: string | null;
  deadlineType?: "hard" | "soft";
  /** null = back to the default: the list's amount, or for a subtask what its main task hands down. */
  points?: number | null;
  /** Main tasks only. */
  pointsToSubtasks?: boolean;
  today?: boolean;
  isPersistent?: boolean;
  /** null = no schedule. A number also makes the task persistent. */
  repeatEvery?: number | null;
  repeatUnit?: RepeatUnit;
  repeatAfterDone?: boolean;
  nextDue?: string;
}

/** The open main tasks and whatever was ticked since yesterday, each with its whole tree. */
export const listTaskTrees = () => api<{ tasks: TaskTreeNode[] }>("/tasks").then((r) => r.tasks);
/** The Done page's days before `before`; null = from the newest. */
export const listDone = (before: string | null) => api<DonePage>(before ? `/tasks/done?before=${before}` : "/tasks/done");
/** The trees holding what was ticked or pressed on `day`. */
export const listDoneOn = (day: string) => api<{ tasks: TaskTreeNode[] }>(`/tasks/done/${day}`).then((r) => r.tasks);
export const listStatRows = () => api<{ tasks: StatRow[] }>("/tasks/stats").then((r) => r.tasks);
/** Every task whose title holds `q`, those finished long ago too; `more` when there were too many to send. */
export const searchTasks = (q: string) => api<{ results: SearchResult[]; more: boolean }>(`/tasks/search?q=${encodeURIComponent(q)}`);
export interface NewTask {
  title: string;
  parentId?: string | null;
  listId?: string | null;
  index?: number;
  goalIds?: string[];
  tagIds?: string[];
  /** Main tasks and their direct subtasks: soft unless said otherwise. */
  deadlineDate?: string;
  deadlineType?: "hard" | "soft";
  points?: number;
  /** In the Today box from the start. */
  today?: boolean;
  /** Main tasks only: makes it persistent, due every so many units from `nextDue` (today if left out). */
  repeatEvery?: number;
  repeatUnit?: RepeatUnit;
  nextDue?: string;
}
export const createTask = (body: NewTask) => api<{ task: Task }>("/tasks", { body }).then((r) => r.task);
export const updateTask = (id: string, body: TaskChanges) =>
  api<{ task: Task }>(`/tasks/${id}`, { method: "PATCH", body }).then((r) => r.task);
export const toggleTask = (id: string) =>
  api<{ task: Task; doneToday: number }>(`/tasks/${id}/toggle`, { method: "PATCH" }).then((r) => ({ ...r.task, doneToday: r.doneToday }));
/** One press of a persistent task's "done it" button, and its undo. */
export const pressTask = (id: string) =>
  api<{ completion: { id: string; day: string }; doneToday: number }>(`/tasks/${id}/completions`, { method: "POST" }).then((r) => ({
    ...r.completion,
    doneToday: r.doneToday,
  }));
export const undoPress = (id: string, completionId: string) =>
  api(`/tasks/${id}/completions/${completionId}`, { method: "DELETE" });
/** Which page's boxes: the dashboard's, or the stats boxes on the Stats page. */
export type LayoutPage = "dashboard" | "stats";
const layoutPath = (page: LayoutPage) => (page === "stats" ? "/layout/stats" : "/layout");
export const getLayout = (page: LayoutPage) => api<{ layout: DashboardLayout | null }>(layoutPath(page)).then((r) => r.layout);
export const saveLayout = (page: LayoutPage, layout: DashboardLayout) => api(layoutPath(page), { method: "PUT", body: layout });
export const getPoints = () => api<PointsSummary>("/points");
export const setTodayPoints = (points: number) => api("/points/today", { method: "PUT", body: { points } });
export const moveTask = (id: string, placement: TaskPlacement) => api(`/tasks/${id}/move`, { body: placement });
export const deleteTask = (id: string) => api(`/tasks/${id}`, { method: "DELETE" });
export const restoreTask = (id: string) => api(`/tasks/${id}/restore`, { method: "POST" });

export const getCountdown = (id: string) => api<{ countdown: Countdown }>(`/tasks/${id}/countdown`).then((r) => r.countdown);
export const getPressure = () => api<{ pressure: PressureSummary }>("/dashboard").then((r) => r.pressure);
export const getCombinedCountdown = () =>
  api<{ countdown: CombinedCountdown }>("/dashboard/countdown").then((r) => r.countdown);
