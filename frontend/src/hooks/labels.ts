import { useQuery } from "@tanstack/react-query";
import * as goalsApi from "../api/goals";
import * as tagsApi from "../api/tags";
import { useInvalidating } from "./mutations";
import { GOALS, TAGS, TASKS } from "./queryKeys";

/** Goals and tags: labels any task can carry several of. */
export const useGoals = () => useQuery({ queryKey: GOALS, queryFn: goalsApi.listGoals });
export const useTags = () => useQuery({ queryKey: TAGS, queryFn: tagsApi.listTags });

export const useCreateGoal = () => useInvalidating((body: { name: string; description?: string | null }) => goalsApi.createGoal(body), [GOALS]);
// Deleting a goal unlinks it from its tasks.
export const useDeleteGoal = () => useInvalidating(goalsApi.deleteGoal, [GOALS, TASKS]);

export const useCreateTag = () => useInvalidating((name: string) => tagsApi.createTag(name), [TAGS]);
export const useDeleteTag = () => useInvalidating(tagsApi.deleteTag, [TAGS, TASKS]);
