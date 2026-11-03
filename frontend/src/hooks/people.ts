import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import * as peopleApi from "../api/people";
import { popCheer } from "../lib/bigMoment";
import { useOnline } from "../lib/offline/online";
import { refuse } from "../lib/refusal";
import { newCheers, type Card } from "../lib/people";
import { readStored, writeStored } from "../lib/storage";
import { PEOPLE } from "./queryKeys";
import { useInvalidating } from "./mutations";
import { useMe } from "./useAuth";

// What other people do reaches nobody by itself, so these are asked for again as long as they are on the screen: a
// friend saying yes or changing their character shows without a reload. Not in a hidden tab, or offline: refetchInterval
// waits then. The server sleeps on the free plan, which rules out a connection kept open. staleTime 0: coming back to
// the tab asks at once.
const BOX_EVERY_MS = 10_000;
const BELL_EVERY_MS = 30_000;

/** The People box's cards. */
export const useFriends = (enabled: boolean) => useQuery({ queryKey: PEOPLE, queryFn: peopleApi.getFriends, enabled, staleTime: 0, refetchInterval: BOX_EVERY_MS });
/** What waits in the bell, on every page: more often while the box is open (`inBox`). Nothing to ask for while Off. */
export const useInbox = (enabled: boolean, inBox = false) =>
  useQuery({ queryKey: [...PEOPLE, "inbox"], queryFn: peopleApi.getInbox, enabled, staleTime: 0, refetchInterval: inBox ? BOX_EVERY_MS : BELL_EVERY_MS });
export const useBlocks = () => useQuery({ queryKey: [...PEOPLE, "blocks"], queryFn: peopleApi.getBlocks });

// Every change here can change every card on the page, and what is in the bell. A refusal shows next to the click.
const usePeopleChange = <TArgs, TResult>(change: (args: TArgs) => Promise<TResult>) => useInvalidating(change, [PEOPLE], refuse);

/** The add field shows its own answer, so it has no popup. */
export const useAskFriend = () => useInvalidating(peopleApi.askFriend, [PEOPLE]);
export const useAcceptFriend = () => usePeopleChange(peopleApi.acceptFriend);
export const useIgnoreFriend = () => usePeopleChange(peopleApi.ignoreFriend);
export const useRemoveFriend = () => usePeopleChange(peopleApi.removeFriend);
// Confetti once the server has taken it: a refused cheer pops nothing.
const popping = <TArgs,>(send: (args: TArgs) => Promise<unknown>) => (args: TArgs) => send(args).then(() => popCheer());
export const useSendCheer = () => usePeopleChange(popping(peopleApi.sendCheer));
export const useCheerEveryone = () => usePeopleChange(popping(peopleApi.cheerEveryone));
export const useMarkCheersSeen = () => usePeopleChange(peopleApi.markCheersSeen);
export const useBlock = () => usePeopleChange(peopleApi.block);
export const useUnblock = () => usePeopleChange(peopleApi.unblock);

const POPPED_KEY = "donegeon.cheersPopped";

/** One pop of confetti saying the cheers that came in, however many: those waiting since you were away too, and none again after a reload. */
export function useCheerPops() {
  const { data } = useInbox(!useMe().user?.peopleOff);
  const cheers = data?.cheers;
  useEffect(() => {
    if (!cheers) return;
    const fresh = newCheers(cheers, (readStored(POPPED_KEY) ?? "").split(" "));
    writeStored(POPPED_KEY, cheers.map(({ id }) => id).join(" "));
    if (fresh.length) popCheer(fresh);
  }, [cheers]);
}

/** How long a card waits after it last changed before it is sent: ticks often come in a row. */
const PUBLISH_AFTER_MS = 2000;

/** What was last sent of each part, so that a sheet opened again sends nothing new. Not kept: a new session sends once, which says when the owner was last here. */
const lastSent = new Map<string, string>();

/**
 * Sends a part of the card once it has changed and stopped changing; the server adds it to what is there. Nothing
 * while Off, and a failure is only forgotten: the next change, or the next start, sends it again. Your own card in the
 * People box is what the server holds, so it is asked for again. `part` tells the two publishers apart (see lib/people).
 */
export function usePublishCard(part: string, card: Card | null) {
  const { user } = useMe();
  const online = useOnline();
  const queryClient = useQueryClient();
  const json = card && JSON.stringify(card);
  const isOff = !user || user.peopleOff === true;
  // The account and its settings too: back from Off, or a new share, the same card has to go again.
  const key = `${user?.id} ${user?.peopleOff} ${user?.shares} ${json}`;
  useEffect(() => {
    // Off clears the card on the server, so it has to go again when back, unchanged or not.
    if (isOff) lastSent.delete(part);
    if (!json || isOff || !online || lastSent.get(part) === key) return;
    const timer = setTimeout(() => {
      peopleApi.putCard(JSON.parse(json) as Card).then(
        () => {
          lastSent.set(part, key);
          void queryClient.invalidateQueries({ queryKey: PEOPLE, exact: true });
        },
        () => {},
      );
    }, PUBLISH_AFTER_MS);
    return () => clearTimeout(timer);
  }, [part, key, json, isOff, online, queryClient]);
}
