import type { Tag } from "../types";
import type { When } from "../lib/clock";
import { api } from "./client";

export const listTags = () => api<{ tags: Tag[] }>("/tags").then((r) => r.tags);
/** `id`: made on the device for a tag typed offline. */
export const createTag = (name: string, id?: string, when?: When) => api<{ tag: Tag }>("/tags", { body: { name, id }, when }).then((r) => r.tag);
export const deleteTag = (id: string) => api(`/tags/${id}`, { method: "DELETE" });
