import { onlineManager, type Mutation, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { ApiError, isUnreachable } from "../../api/client";
import { clockNow } from "../clock";
import { refuse } from "../refusal";
import { getServerStatus, reportFailure } from "../serverStatus";
import type { Change, Saved, Spec, Specs } from "./changeSpec";
import { noteSpecs, type NoteChangeVars } from "./noteChanges";
import { taskSpecs, taskTitle, type TaskChangeVars } from "./taskChanges";

/*
 * Everyday changes to tasks work offline. Each one is shown at once (onMutate), waits in one queue (the "changes"
 * scope: sent one at a time, in the order made), and is kept in IndexedDB with the query cache (main.tsx), so it
 * survives closing the app. When the server can be reached again it is sent; a send the connection lost is sent
 * again, which the server takes as the same change (ids made here, "make it so" requests). Everything a change
 * needs is decided when it is made and kept in its variables, the day and moment included (`when`): registered
 * here by key (the kinds are in ./taskChanges and ./noteChanges) rather than written in the hooks, so a change
 * read back from IndexedDB still knows how to send itself.
 */

export const CHANGES_SCOPE = "changes";

/** What each kind of change carries, by its name. */
export type ChangeVars = TaskChangeVars & NoteChangeVars;
export type ChangeKind = keyof ChangeVars;

const specs: Specs<ChangeVars> = { ...taskSpecs, ...noteSpecs };

/** The mutation key of a kind of change, which the hooks name it by. */
export const changeKey = <K extends ChangeKind>(kind: K) => ["change", kind] as const;

/** An id for a row made on the device. crypto.randomUUID is missing on a plain-http page (the dev server opened on a phone). */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Changes that had to wait (offline, or sent again after the connection failed): made a while before their answer. */
const waited = new WeakSet<object>();
/** Nor is a change this old just clicked, waited or not (one read back from IndexedDB). */
const FRESH_MS = 15_000;
/**
 * A change just clicked and answered straight away: a refusal shows next to the click and the page goes back to
 * before it. Others were made a while ago; changes made since build on them.
 */
const isFresh = (change: Change<unknown>) => !waited.has(change) && clockNow().getTime() - Date.parse(change.when.at) < FRESH_MS;

const isChange = (mutation: Mutation<unknown, Error, unknown, unknown>) => mutation.options.scope?.id === CHANGES_SCOPE;

/** How many changes are still to be saved, the one being sent included. */
export const changesWaiting = (queryClient: QueryClient) => queryClient.isMutating({ predicate: isChange });

/** What the page asks again for once every waiting change is saved: refetching earlier would undo the ones still waiting. */
const toRefresh = new Map<string, QueryKey>();

/** The title a change is named by in the notice: its new task's, or the task it is about. */
function titleOf(queryClient: QueryClient, change: object, saved: Saved | undefined) {
  const { id, task } = change as { id?: unknown; task?: { title?: unknown } };
  if (typeof task?.title === "string") return task.title;
  return taskTitle(queryClient, typeof id === "string" ? id : "", saved);
}

/** Waits a little longer each time, up to half a minute, while the server can't be reached. */
const retryDelay = (attempt: number) => Math.min(30_000, 1000 * 2 ** attempt);

/** How one kind of change is sent, shown and refreshed. */
function register<V>(queryClient: QueryClient, kind: string, spec: Spec<V>) {
  queryClient.setMutationDefaults(["change", kind], {
    mutationFn: (change: Change<V>) => spec.send(change),
    scope: { id: CHANGES_SCOPE },
    // While the server can't be reached the change waits (paused while offline) and is sent again; a refusal is final.
    // Logged out meanwhile (the session ran out): it waits for the same user to log back in (hooks/useAuth).
    retry: (_count, error) => isUnreachable(error) || (error instanceof ApiError && error.status === 401),
    retryDelay,
    onMutate: (change: Change<V>) => spec.show?.(queryClient, change) ?? [],
    onSuccess: (result: unknown, change: Change<V>) => {
      if (isFresh(change)) spec.onSaved?.(queryClient, result, change);
    },
    onError: (error: Error, change: Change<V>, saved: Saved | undefined) => {
      if (isFresh(change)) {
        // Just clicked: back to how it was, and why next to the click (or in the box that made it).
        if (spec.popup) refuse(error);
        for (const [queryKey, data] of saved ?? []) queryClient.setQueryData(queryKey, data);
        return;
      }
      // Made a while ago (offline, most likely): changes made after it build on what it showed, so nothing is put
      // back by hand; the refresh once the queue is empty shows the server's own. Said in the notice at the top.
      const what = `${spec.name(change, titleOf(queryClient, change, saved))}: ${error.message}`;
      const earlier = getServerStatus().failure;
      reportFailure(earlier?.startsWith("Couldn't save") ? `${earlier}; ${what}` : `Couldn't save ${what}`);
    },
    onSettled: () => {
      for (const queryKey of spec.refresh) toRefresh.set(JSON.stringify(queryKey), queryKey);
      // This one is still counted until it has settled.
      if (changesWaiting(queryClient) > 1) return;
      const keys = [...toRefresh.values()];
      toRefresh.clear();
      return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
  });
}

/** Registers every kind of change in `all`, each with its own variables' type. */
function registerAll<M>(queryClient: QueryClient, all: Specs<M>) {
  for (const kind in all) register(queryClient, kind, all[kind]);
}

/** Registers how each change is sent, shown and refreshed; once, before anything is rendered or read back. */
export function registerChanges(queryClient: QueryClient) {
  queryClient.getMutationCache().subscribe((event) => {
    if (event.type !== "updated" || !isChange(event.mutation) || !event.mutation.state.variables) return;
    // A pause online is only its turn coming after the change before it.
    const offline = event.action.type === "pause" && !onlineManager.isOnline();
    if (offline || event.action.type === "failed") waited.add(event.mutation.state.variables);
  });
  registerAll(queryClient, specs);
}
