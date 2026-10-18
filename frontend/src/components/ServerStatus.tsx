import { useIsMutating } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CHANGES_SCOPE } from "../lib/offline/changes";
import { useOnline } from "../lib/offline/online";
import { dismissFailure, getServerStatus, onServerStatus, tryAgain } from "../lib/serverStatus";

const NOTICE = "pointer-events-auto flex max-w-[min(26rem,100%)] items-center gap-2 border-2 bg-white px-2 py-1.5 text-xs shadow-[2px_2px_0_rgb(0_0_0/0.35)] dark:bg-stone-900";
const RED = "border-red-600 text-red-700 dark:border-red-500 dark:text-red-300";

/** Saving shows only when it takes this long: an ordinary click is saved before anyone could read it. */
const SAVING_NOTICE_MS = 1500;

const changes = (n: number) => (n === 1 ? "1 change" : `${n} changes`);

/**
 * Says so at the top of the page while offline (changes made meanwhile wait on the device and are saved once
 * it's back, even if the app is closed in between), while the server is being woken, when it can't be reached
 * at all, while the waiting changes are being saved, and when a change was lost on the way or couldn't be saved.
 * The last stays until it is dismissed: whoever made the change may have looked away since.
 */
export function ServerStatus() {
  const { state, failure } = useSyncExternalStore(onServerStatus, getServerStatus);
  const online = useOnline();
  const waiting = useIsMutating({ predicate: (mutation) => mutation.options.scope?.id === CHANGES_SCOPE });

  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (waiting === 0) return setSlow(false);
    const timer = setTimeout(() => setSlow(true), SAVING_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [waiting === 0]);

  const offline = !navigator.onLine;
  if (!offline && state === "up" && !failure && !(slow && waiting > 0)) return null;
  return createPortal(
    // Over everything, the tutorial too.
    <div data-server-status={state} className="pointer-events-none fixed inset-x-0 top-2 z-[80] flex flex-col items-center gap-1 px-2">
      {offline && (
        <p role="status" data-offline className={`${NOTICE} border-amber-500 text-amber-800 dark:text-amber-300`}>
          {waiting > 0 ? `Offline · ${changes(waiting)} waiting, saved when you're back.` : "Offline · your changes are saved when you're back."}
        </p>
      )}
      {!offline && online && state === "up" && slow && waiting > 0 && (
        <p role="status" data-saving className={`${NOTICE} border-stone-400 text-stone-700 dark:text-stone-300`}>
          Saving {changes(waiting)}…
        </p>
      )}
      {!offline && state === "waking" && (
        <p role="status" className={`${NOTICE} border-amber-500 text-amber-800 dark:text-amber-300`}>
          Waking the server up… your changes will be saved as soon as it answers.
        </p>
      )}
      {!offline && state === "down" && (
        <p role="alert" className={`${NOTICE} ${RED}`}>
          {waiting > 0 ? `Can't reach the server. ${changes(waiting)} waiting on this device.` : "Can't reach the server."}
          <button type="button" className="underline" onClick={tryAgain}>
            Try again
          </button>
        </p>
      )}
      {failure && (
        <p role="alert" data-save-failure className={`${NOTICE} ${RED}`}>
          {failure}.
          <button type="button" aria-label="Dismiss" onClick={dismissFailure}>
            ×
          </button>
        </p>
      )}
    </div>,
    document.body,
  );
}
