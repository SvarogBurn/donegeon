import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as tasksApi from "../api/tasks";
import type { DashboardLayout } from "../lib/tileLayout";
import { LAYOUT } from "./queryKeys";

export const useLayout = (page: tasksApi.LayoutPage = "dashboard") =>
  useQuery({ queryKey: [...LAYOUT, page], queryFn: () => tasksApi.getLayout(page) });
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
