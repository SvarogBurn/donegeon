import type { DashboardLayout } from "../lib/tileLayout";
import type { Folder } from "../types";
import { api } from "./client";

export interface FolderChanges {
  name?: string;
  /** "#rrggbb"; null = the icon as drawn. */
  color?: string | null;
  layout?: DashboardLayout;
  /** The full set of boxes it shows. */
  views?: string[];
}

export const listFolders = () => api<{ folders: Folder[] }>("/folders").then((r) => r.folders);
/** `views`: boxes it shows straight away. */
export const createFolder = (body: { name?: string; views?: string[] }) =>
  api<{ folder: Folder }>("/folders", { body }).then((r) => r.folder);
export const updateFolder = (id: string, body: FolderChanges) =>
  api<{ folder: Folder }>(`/folders/${id}`, { method: "PATCH", body }).then((r) => r.folder);
/** Only the tab goes: what it showed lives elsewhere. */
export const deleteFolder = (id: string) => api(`/folders/${id}`, { method: "DELETE" });
