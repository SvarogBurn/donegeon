import { useMemo } from "react";
import { useMe, useUpdateMe } from "../../hooks/useAuth";
import { useGoals, useLists, useTags } from "../../hooks/useTasks";
import { DEFAULT_LOOK } from "../../lib/character/bodies";
import { normalizeProfile, type Known, type Profile } from "../../lib/character/profile";

/** The user's character as saved, made whole (see normalizeProfile), and the way to save a changed one. */
export function useProfile() {
  const { user } = useMe();
  const lists = useLists();
  const goals = useGoals();
  const tags = useTags();
  const update = useUpdateMe();
  const known = useMemo<Known | undefined>(
    () =>
      lists.data && goals.data && tags.data
        ? { lists: new Set(lists.data.map((l) => l.id)), goals: new Set(goals.data.map((g) => g.id)), tags: new Set(tags.data.map((t) => t.id)) }
        : undefined,
    [lists.data, goals.data, tags.data],
  );
  const profile = useMemo(() => normalizeProfile(user?.profile, known), [user?.profile, known]);
  return {
    profile,
    look: profile.look ?? DEFAULT_LOOK,
    /** The character's name: the username. */
    name: user?.username ?? "",
    save: (next: Profile) => update.mutate({ profile: next }),
    error: update.error,
  };
}
