import type { List } from "../types";
import { api } from "./client";

export const listLists = () => api<{ lists: List[] }>("/lists").then((r) => r.lists);
export const createList = (name: string) => api<{ list: List }>("/lists", { body: { name } }).then((r) => r.list);
export const renameList = (id: string, name: string) =>
  api<{ list: List }>(`/lists/${id}`, { method: "PATCH", body: { name } }).then((r) => r.list);
export const deleteList = (id: string) => api(`/lists/${id}`, { method: "DELETE" });
export const restoreList = (id: string) => api(`/lists/${id}/restore`, { method: "POST" });
