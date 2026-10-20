import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getFeedback, sendFeedback } from "../api/feedback";
import { FEEDBACK } from "./queryKeys";

/** Every letter sent from the suggestion box, newest first: only a developer's account may read them. */
export const useFeedback = () => useQuery({ queryKey: FEEDBACK, queryFn: getFeedback });

/** Sends a letter; a developer's own letter turns up in the inbox under the box. */
export function useSendFeedback(onSent: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: sendFeedback,
    onSuccess: () => {
      onSent();
      queryClient.invalidateQueries({ queryKey: FEEDBACK });
    },
  });
}
