import { useIsMutating } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { dismissFailure, getServerStatus, onServerStatus, tryAgain } from "../lib/serverStatus";

const NOTICE = "pointer-events-auto flex max-w-[min(26rem,100%)] items-center gap-2 border-2 bg-white px-2 py-1.5 text-xs shadow-[2px_2px_0_rgb(0_0_0/0.35)] dark:bg-stone-900";
const RED = "border-red-600 text-red-700 dark:border-red-500 dark:text-red-300";

/**
 * Says so at the top of the page while the server is being woken (changes made meanwhile wait and are
 * saved once it answers), when it can't be reached at all, and when a change was lost on the way. The
 * last stays until it is dismissed: whoever made the change may have looked away since.
 */
export function ServerStatus() {
  const { state, failure } = useSyncExternalStore(onServerStatus, getServerStatus);
  const saving = useIsMutating() > 0;

  // Leaving now would lose what is still waiting for the server.
  const waiting = state !== "up" && saving;
  useEffect(() => {
    if (!waiting) return;
    const ask = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [waiting]);

  if (state === "up" && !failure) return null;
  return createPortal(
    // Over everything, the tutorial too.
    <div data-server-status={state} className="pointer-events-none fixed inset-x-0 top-2 z-[80] flex flex-col items-center gap-1 px-2">
      {state === "waking" && (
        <p role="status" className={`${NOTICE} border-amber-500 text-amber-800 dark:text-amber-300`}>
          Waking the server up… your changes will be saved as soon as it answers.
        </p>
      )}
      {state === "down" && (
        <p role="alert" className={`${NOTICE} ${RED}`}>
          {navigator.onLine ? "Can't reach the server." : "You're offline."}
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
