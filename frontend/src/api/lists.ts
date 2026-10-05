import type { List, ListKind } from "../types";
import { api } from "./client";

export interface ListChanges {
  name?: string;
  kind?: ListKind;
  defaultPoints?: number;
  /** "#rrggbb"; null = back to the kind's own colour. */
  color?: string | null;
}

export const listLists = () => api<{ lists: List[] }>("/lists").then((r) => r.lists);
/** `folderId`: a folder that shows the new list straight away. */
export const createList = (body: ListChanges & { name: string; folderId?: string | null }) =>
  api<{ list: List }>("/lists", { body }).then((r) => r.list);
export const updateList = (id: string, body: ListChanges) =>
  api<{ list: List }>(`/lists/${id}`, { method: "PATCH", body }).then((r) => r.list);
export const deleteList = (id: string) => api(`/lists/${id}`, { method: "DELETE" });
export const restoreList = (id: string) => api(`/lists/${id}/restore`, { method: "POST" });
