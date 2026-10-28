import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getEventStories, removeStory, saveStory, withdrawStory } from "../api/stories";
import { STORIES } from "./queryKeys";

/** A story event's page: the user's own story, and everyone's once the event is closed. */
export const useEventStories = (eventId: string, enabled = true) => useQuery({ queryKey: [...STORIES, eventId], queryFn: () => getEventStories(eventId), enabled });

/** Writing, taking back and (a developer) removing stories: each needs a connection, and refreshes the event's page. */
export function useStoryChanges(eventId: string) {
  const queryClient = useQueryClient();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: [...STORIES, eventId] });
  return {
    save: useMutation({ mutationFn: (story: { title: string; text: string }) => saveStory(eventId, story), onSuccess }),
    withdraw: useMutation({ mutationFn: () => withdrawStory(eventId), onSuccess }),
    remove: useMutation({ mutationFn: removeStory, onSuccess }),
  };
}
