import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import * as authApi from "../api/auth";
import { ApiError } from "../api/client";
import type { DeadlineToday, TickedTasks, User } from "../types";
import { readStored, writeStored } from "../lib/storage";
import { normalizeDeadlineTable, type DeadlineTable } from "../lib/deadlineTable";

export const ME = ["me"];

/** `user` is null when logged out, undefined while still loading. */
export function useMe() {
  const query = useQuery({
    queryKey: ME,
    queryFn: () =>
      authApi.getMe().then(
        (user) => {
          keepFor(user.id);
          return user;
        },
        (err) => {
          if (err instanceof ApiError && err.status === 401) return null;
          throw err;
        },
      ),
    retry: false,
    staleTime: Infinity,
  });
  // Pending, not loading: while the phone's kept copy is read in, or offline with nothing kept, nothing is being fetched either.
  return { user: query.data, isLoading: query.isPending && !query.isError, error: query.error };
}

/** What the lists do with a ticked task; under the open ones unless the user chose otherwise on their page. */
export function useTickedTasks(): TickedTasks {
  return useMe().user?.tickedTasks ?? "bottom";
}

/** Whether lists show their tasks soonest date first, instead of in the user's own order; off unless switched on on their page. */
export function useSortByDeadline(): boolean {
  return useMe().user?.sortByDeadline ?? false;
}

/** When a task with a deadline comes into Today by itself; never, unless the user chose otherwise on their page. */
export function useDeadlineToday(): DeadlineToday {
  return useMe().user?.deadlineToday ?? "never";
}

/** The dashboard's deadlines box as the user set it on their page, and the way to change it (saved whole). */
export function useDeadlineTable(): [DeadlineTable, (next: DeadlineTable) => void] {
  const saved = useMe().user?.deadlineTable;
  const update = useUpdateMe();
  const table = useMemo(() => normalizeDeadlineTable(saved), [saved]);
  return [table, (next) => update.mutate({ deadlineTable: next })];
}

/** Whether the Notes tab is shown; off unless switched on on the user's page. */
export function useNotesTab(): boolean {
  return useMe().user?.notesTab ?? false;
}

/**
 * The colour the user picked for a built-in box (Today, Done, the character, a stats box…), by the box's key: its
 * folder view where it has one ("box:today", "stat:points", "cal:month"), else its tile key ("done", "character"). So a
 * box and its copies in folders share one colour. A box with none keeps its own; a list has its own `color` instead.
 */
export function useBoxColor(key: string | undefined): string | undefined {
  const colors = useMe().user?.boxColors;
  return key ? colors?.[key] : undefined;
}

/** Whether the built-in boxes show their colour button; off unless switched on on the user's page. */
export function useBoxColorEdit(): boolean {
  return useMe().user?.boxColorEdit ?? false;
}

/** Picks a built-in box's colour (see useBoxColor); null = back to the box's own. */
export function useSetBoxColor() {
  const colors = useMe().user?.boxColors;
  const update = useUpdateMe();
  return (key: string, color: string | null) => {
    const others = Object.fromEntries(Object.entries(colors ?? {}).filter(([other]) => other !== key));
    update.mutate({ boxColors: color ? { ...others, [key]: color } : others });
  };
}

/** A setting of the account's: shows at once and is saved in the background. */
export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.updateMe,
    onMutate: (changes) => {
      queryClient.setQueryData<User | null>(ME, (user) => user && { ...user, ...changes });
    },
    onSuccess: (user) => queryClient.setQueryData(ME, user),
    onError: () => queryClient.invalidateQueries({ queryKey: ME }),
  });
}

/** Whose data the device keeps: changes made offline wait for that account to log back in, and only that one. */
const KEPT_FOR_KEY = "donegeon.keptFor";

const keptFor = () => readStored(KEPT_FOR_KEY);
// Without storage the cache is dropped at every login, which is only slower.
const keepFor = (userId: string | null) => writeStored(KEPT_FOR_KEY, userId);

export function useLogin(mode: "login" | "signup") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mode === "login" ? authApi.login : authApi.signup,
    onSuccess: (user) => {
      // Drop anything cached for a previous account before showing this one. The same account logging back in (its
      // session ran out) keeps it: its changes still waiting are sent now.
      if (keptFor() === user.id) {
        void queryClient.resumePausedMutations();
        void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== ME[0] });
      } else queryClient.clear();
      keepFor(user.id);
      queryClient.setQueryData(ME, user);
    },
  });
}

/** Logged out, with nothing of the account's left in the cache. */
function forgetAccount(queryClient: QueryClient) {
  // Not clear(): that drops the "me" query out from under AppShell, which then never hears it changed.
  queryClient.setQueryData(ME, null);
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ME[0] });
  queryClient.getMutationCache().clear();
  keepFor(null);
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => forgetAccount(queryClient),
  });
}

/** Deletes the account for good; the app then stands where it does after logging out. */
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.deleteMe,
    onSuccess: () => forgetAccount(queryClient),
  });
}
