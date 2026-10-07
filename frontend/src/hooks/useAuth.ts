import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as authApi from "../api/auth";
import { ApiError } from "../api/client";
import type { TickedTasks, User } from "../types";

export const ME = ["me"];

/** `user` is null when logged out, undefined while still loading. */
export function useMe() {
  const query = useQuery({
    queryKey: ME,
    queryFn: () =>
      authApi.getMe().catch((err) => {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }),
    retry: false,
    staleTime: Infinity,
  });
  return { user: query.data, isLoading: query.isLoading, error: query.error };
}

/** What the lists do with a ticked task; under the open ones unless the user chose otherwise on their page. */
export function useTickedTasks(): TickedTasks {
  return useMe().user?.tickedTasks ?? "bottom";
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

export function useLogin(mode: "login" | "signup") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: mode === "login" ? authApi.login : authApi.signup,
    onSuccess: (user) => {
      // Drop anything cached for a previous account before showing this one.
      queryClient.clear();
      queryClient.setQueryData(ME, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      // Not clear(): that drops the "me" query out from under AppShell, which then never hears it changed.
      queryClient.setQueryData(ME, null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ME[0] });
    },
  });
}
