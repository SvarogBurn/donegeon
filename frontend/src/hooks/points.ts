import { useQuery } from "@tanstack/react-query";
import * as tasksApi from "../api/tasks";
import { useInvalidating } from "./mutations";
import { POINTS, TASKS } from "./queryKeys";

export const usePoints = () => useQuery({ queryKey: POINTS, queryFn: tasksApi.getPoints });
// Changes what every Today-only task without its own amount is worth.
export const useSetTodayPoints = () => useInvalidating(tasksApi.setTodayPoints, [POINTS, TASKS]);
