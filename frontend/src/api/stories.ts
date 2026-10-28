import type { EventStories, Story } from "../types";
import { api } from "./client";

export const getEventStories = (eventId: string) => api<EventStories>(`/stories/${encodeURIComponent(eventId)}`);

/** Writes the user's story for the event, or changes it; only while the event is open. */
export const saveStory = (eventId: string, body: { title: string; text: string }) => api<Story>(`/stories/${encodeURIComponent(eventId)}`, { method: "PUT", body });

/** Takes the user's story back, while the event is open. */
export const withdrawStory = (eventId: string) => api(`/stories/${encodeURIComponent(eventId)}`, { method: "DELETE" });

/** A developer takes any story down. */
export const removeStory = (id: string) => api(`/stories/story/${encodeURIComponent(id)}`, { method: "DELETE" });
