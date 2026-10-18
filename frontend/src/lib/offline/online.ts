import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { ensureAwake, getServerStatus, onServerStatus } from "../serverStatus";

/** While the server can't be reached on a connection that looks fine, it is asked again this often. */
const RECHECK_MS = 30_000;

/**
 * The app counts as offline when the phone has no connection or the server stayed away after waking it
 * (lib/serverStatus). Offline, queries stop asking and show what the phone kept, and changes wait their
 * turn; they go out once the server answers again.
 */
export function installOnlineManager() {
  onlineManager.setEventListener((setOnline) => {
    const update = () => setOnline(navigator.onLine && getServerStatus().state !== "down");
    // Nobody else asks the server while the app counts as offline, so this does, now and then.
    const recheck = setInterval(() => {
      if (navigator.onLine && getServerStatus().state === "down") void ensureAwake(true).catch(() => {});
    }, RECHECK_MS);
    update();
    const stop = onServerStatus(update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      clearInterval(recheck);
      stop();
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  });
}

/** Whether the server can be reached; what can't be done offline is greyed out by it. */
export const useOnline = () => useSyncExternalStore((listener) => onlineManager.subscribe(listener), () => onlineManager.isOnline());
