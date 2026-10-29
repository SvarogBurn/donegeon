import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import * as notificationsApi from "../api/notifications";
import { clockNow, localDate } from "../lib/clock";
import { readDismissed, saveDismissed } from "../lib/notifications";
import { buildSchedule } from "../lib/notifySchedule";
import { changesWaiting } from "../lib/offline/changes";
import { useOnline } from "../lib/offline/online";
import { pushState, subscribe, unsubscribe, type PushState } from "../lib/pushDevice";
import { readStored, writeStored } from "../lib/storage";
import { useTaskTrees } from "./tasks";
import { useDeadlineToday, useMe, useNotifySettings, useTickedTasks } from "./useAuth";

const PUSH_KEY = ["pushKey"];

/** This device's push notifications: where they stand, and turning them on and off. `state` is null while it is found out. */
export function usePushDevice() {
  const key = useQuery({ queryKey: PUSH_KEY, queryFn: notificationsApi.getPushKey, staleTime: Infinity });
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void pushState().then((found) => live && setState(found));
    return () => {
      live = false;
    };
  }, []);

  const turnOn = useCallback(async () => {
    if (!key.data) return;
    setBusy(true);
    try {
      const result = await subscribe(key.data);
      if (typeof result === "string") return setState(result);
      await notificationsApi.addDevice(result.toJSON());
      setState("on");
    } finally {
      setBusy(false);
    }
  }, [key.data]);

  const turnOff = useCallback(async () => {
    setBusy(true);
    try {
      await unsubscribe();
      setState("off");
    } finally {
      setBusy(false);
    }
  }, []);

  /** null: push isn't set up on the server; undefined: not known yet. */
  return { state, serverKey: key.data, busy, turnOn, turnOff };
}

// The dismissed notifications, one set for the page: both bells and the deadlines box read it, so a passed deadline
// dismissed in one is gone from the others at once.
let dismissedNow: Set<string> | null = null;
const dismissListeners = new Set<() => void>();
const dismissedSnapshot = () => (dismissedNow ??= readDismissed());
function onDismissed(listener: () => void) {
  dismissListeners.add(listener);
  return () => void dismissListeners.delete(listener);
}

function dismissKeys(keys: string[]) {
  dismissedNow = new Set([...dismissedSnapshot(), ...keys]);
  saveDismissed(dismissedNow, [...dismissedNow]);
  for (const listener of dismissListeners) listener();
}

/** This device's dismissed notifications (keys as in lib/notifications), and dismissing more. */
export function useDismissed(): [Set<string>, (keys: string[]) => void] {
  return [useSyncExternalStore(onDismissed, dismissedSnapshot), dismissKeys];
}

// The plan last sent from this device, as a hash: the same plan isn't sent again.
const SENT_KEY = "donegeon.notifyPlan";

/** A short hash of a text (53-bit cyrb53): enough to tell one plan from the next. */
function hashOf(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Plans the notifications again whenever the tasks come from the server, or the settings change, and sends the plan
 * when it differs from the last one sent. Not while changes wait to be sent: the trees are then ahead of the server
 * and could still be refused. Mounted once, in AppShell.
 */
export function useScheduleUpload() {
  const queryClient = useQueryClient();
  const { user } = useMe();
  const trees = useTaskTrees();
  const [settings] = useNotifySettings();
  const ticked = useTickedTasks();
  const deadlines = useDeadlineToday();
  const online = useOnline();
  const ready = online && trees.isFetchedAfterMount && !trees.isFetching && trees.data !== undefined;

  useEffect(() => {
    if (!ready || !user || changesWaiting(queryClient) > 0) return;
    const items = buildSchedule(trees.data!, localDate(), clockNow(), settings, ticked, deadlines);
    const hash = hashOf(user.id + JSON.stringify(items));
    if (readStored(SENT_KEY) === hash) return;
    // Not sent: tried again with the next change, or the next time the tasks come.
    notificationsApi.saveSchedule(items).then(() => writeStored(SENT_KEY, hash), () => {});
  }, [ready, user, trees.data, trees.dataUpdatedAt, settings, ticked, deadlines, queryClient]);
}
