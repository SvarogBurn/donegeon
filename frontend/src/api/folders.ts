import type { DashboardLayout } from "../lib/tileLayout";
import type { Folder } from "../types";
import { api } from "./client";

export interface FolderChanges {
  name?: string;
  /** "#rrggbb"; null = the icon as drawn. */
  color?: string | null;
  layout?: DashboardLayout;
}

export const listFolders = () => api<{ folders: Folder[] }>("/folders").then((r) => r.folders);
/** `listIds`: lists to put in it straight away. */
export const createFolder = (body: { name?: string; listIds?: string[] }) =>
  api<{ folder: Folder }>("/folders", { body }).then((r) => r.folder);
export const updateFolder = (id: string, body: FolderChanges) =>
  api<{ folder: Folder }>(`/folders/${id}`, { method: "PATCH", body }).then((r) => r.folder);
/** Its lists go back to the Tasks page. */
export const deleteFolder = (id: string) => api(`/folders/${id}`, { method: "DELETE" });
