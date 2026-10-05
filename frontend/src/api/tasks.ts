import type { CombinedCountdown, Countdown, PointsSummary, PressureSummary, RepeatUnit, Task, TaskTreeNode } from "../types";
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

export const listTaskTrees = () => api<{ tasks: TaskTreeNode[] }>("/tasks").then((r) => r.tasks);
export const createTask = (body: {
  title: string;
  parentId?: string | null;
  listId?: string | null;
  index?: number;
  goalIds?: string[];
  tagIds?: string[];
}) =>
  api<{ task: Task }>("/tasks", { body }).then((r) => r.task);
export const updateTask = (id: string, body: TaskChanges) =>
  api<{ task: Task }>(`/tasks/${id}`, { method: "PATCH", body }).then((r) => r.task);
export const toggleTask = (id: string) =>
  api<{ task: Task }>(`/tasks/${id}/toggle`, { method: "PATCH" }).then((r) => r.task);
/** One press of a persistent task's "done it" button, and its undo. */
export const pressTask = (id: string) =>
  api<{ completion: { id: string; day: string } }>(`/tasks/${id}/completions`, { method: "POST" }).then((r) => r.completion);
export const undoPress = (id: string, completionId: string) =>
  api(`/tasks/${id}/completions/${completionId}`, { method: "DELETE" });
export const getLayout = () => api<{ layout: DashboardLayout | null }>("/layout").then((r) => r.layout);
export const saveLayout = (layout: DashboardLayout) => api("/layout", { method: "PUT", body: layout });
export const getPoints = () => api<PointsSummary>("/points");
export const setTodayPoints = (points: number) => api("/points/today", { method: "PUT", body: { points } });
export const moveTask = (id: string, placement: TaskPlacement) => api(`/tasks/${id}/move`, { body: placement });
export const deleteTask = (id: string) => api(`/tasks/${id}`, { method: "DELETE" });
export const restoreTask = (id: string) => api(`/tasks/${id}/restore`, { method: "POST" });

export const getCountdown = (id: string) => api<{ countdown: Countdown }>(`/tasks/${id}/countdown`).then((r) => r.countdown);
export const getPressure = () => api<{ pressure: PressureSummary }>("/dashboard").then((r) => r.pressure);
export const getCombinedCountdown = () =>
  api<{ countdown: CombinedCountdown }>("/dashboard/countdown").then((r) => r.countdown);
