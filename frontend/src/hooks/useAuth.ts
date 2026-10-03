import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as authApi from "../api/auth";
import { ApiError } from "../api/client";

const ME = ["me"];

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
