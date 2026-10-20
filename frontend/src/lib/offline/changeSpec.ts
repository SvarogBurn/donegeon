import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { When } from "../clock";

/** What every change carries besides its own fields: the app's day and the moment it was made. */
export type Change<V> = V & { when: When };

/** What the query cache held before a change, to put back if the server refuses it at once. */
export type Saved = [QueryKey, unknown][];

/** How one kind of change is sent, shown at once and refreshed (see registerChanges in ./changes). */
export interface Spec<V> {
  send: (change: Change<V>) => Promise<unknown>;
  /** Shows the change at once; returns what it changed, so a refusal can put it back. */
  show?: (queryClient: QueryClient, change: Change<V>) => Promise<Saved> | Saved;
  /** What may look different once the server has it. */
  refresh: QueryKey[];
  /** How the change is named when it couldn't be saved; `title` is its task's. */
  name: (change: Change<V>, title: string) => string;
  /** Its refusal shows next to the click, not only in the box that made it. */
  popup?: boolean;
  onSaved?: (queryClient: QueryClient, result: unknown, change: Change<V>) => void;
}

/** One Spec per kind of change: the change's variables by kind, `M`. */
export type Specs<M> = { [K in keyof M]: Spec<M[K]> };

export const quoted = (title: string) => `“${title}”`;
