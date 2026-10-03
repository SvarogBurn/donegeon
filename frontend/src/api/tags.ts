import type { Tag } from "../types";
import { api } from "./client";

export const listTags = () => api<{ tags: Tag[] }>("/tags").then((r) => r.tags);
export const createTag = (name: string) => api<{ tag: Tag }>("/tags", { body: { name } }).then((r) => r.tag);
export const deleteTag = (id: string) => api(`/tags/${id}`, { method: "DELETE" });
