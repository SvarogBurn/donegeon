import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as tasksApi from "../api/tasks";
import { START_LAYOUT, STATS_START_LAYOUT, type DashboardLayout } from "../lib/tileLayout";
import { LAYOUT } from "./queryKeys";

/** A Tasks or Stats page never arranged starts as START_LAYOUT / STATS_START_LAYOUT; the first change saves it. */
export const useLayout = (page: tasksApi.LayoutPage = "dashboard") =>
  useQuery({ queryKey: [...LAYOUT, page], queryFn: async () => (await tasksApi.getLayout(page)) ?? (page === "dashboard" ? START_LAYOUT : page === "stats" ? STATS_START_LAYOUT : null) });
/** The new arrangement shows at once and is saved in the background. */
export function useSaveLayout(page: tasksApi.LayoutPage = "dashboard") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (layout: DashboardLayout) => tasksApi.saveLayout(page, layout),
    onMutate: (layout: DashboardLayout) => {
      queryClient.setQueryData([...LAYOUT, page], layout);
    },
    onError: () => queryClient.invalidateQueries({ queryKey: [...LAYOUT, page] }),
  });
}
