import type { Goal } from "../types";
import { api, type When } from "./client";

export const listGoals = () => api<{ goals: Goal[] }>("/goals").then((r) => r.goals);
/** `id`: made on the device for a goal typed offline. */
export const createGoal = (body: { name: string; description?: string | null; id?: string }, when?: When) =>
  api<{ goal: Goal }>("/goals", { body, when }).then((r) => r.goal);
export const updateGoal = (id: string, body: Partial<Pick<Goal, "name" | "description" | "isArchived">>) =>
  api<{ goal: Goal }>(`/goals/${id}`, { method: "PATCH", body }).then((r) => r.goal);
export const deleteGoal = (id: string) => api(`/goals/${id}`, { method: "DELETE" });
