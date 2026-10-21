import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getFeedback, getFeedbackSent, sendFeedback } from "../api/feedback";
import { FEEDBACK, FEEDBACK_SENT } from "./queryKeys";

/** Every letter sent from the suggestion box, newest first: only a developer's account may read them. */
export const useFeedback = () => useQuery({ queryKey: FEEDBACK, queryFn: getFeedback });

/** How many letters this account has sent: each is 1 exp for the character. */
export const useFeedbackSent = () => useQuery({ queryKey: FEEDBACK_SENT, queryFn: getFeedbackSent, select: (data) => data.count });

/** Sends a letter (1 exp; FEEDBACK covers the count too); a developer's own letter turns up in the inbox under the box. */
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
