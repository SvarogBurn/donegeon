import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { whenNow } from "../lib/clock";
import { changeKey, type ChangeKind, type ChangeVars } from "../lib/offline/changes";
import type { Change } from "../lib/offline/changeSpec";

/**
 * A change that needs a connection: sent, then `keys` are asked for again. `onError`: for the mutations whose refusal
 * shows in the popup next to the click.
 */
export function useInvalidating<TArgs, TResult>(mutationFn: (args: TArgs) => Promise<TResult>, keys: string[][], onError?: (error: Error) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: TArgs) => mutationFn(args),
    onError,
    onSettled: () => Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  });
}

/**
 * One of the everyday changes that also work offline (lib/offline/changes: how each is sent and shown at once), by
 * its kind. `mutate` stamps it with the day and moment it was made. It may wait to be sent, so nothing should wait
 * for it: what it changes is on the page already.
 */
export function useChange<K extends ChangeKind>(kind: K) {
  const mutation = useMutation<unknown, Error, Change<ChangeVars[K]>>({ mutationKey: [...changeKey(kind)] });
  const { mutate: send } = mutation;
  const mutate = useCallback(
    (change: ChangeVars[K], options?: { onError?: (error: Error) => void }) => send({ ...change, when: whenNow() }, options),
    [send],
  );
  return { ...mutation, mutate };
}
