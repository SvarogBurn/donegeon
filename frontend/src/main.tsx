import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { defaultShouldDehydrateQuery, MutationCache, QueryClient, type Mutation } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { isUnreachable } from "./api/client";
import { ServerStatus } from "./components/ServerStatus";
import { installFrameTones } from "./lib/frameTones";
import { changesWaiting, CHANGES_SCOPE, registerChanges } from "./lib/offline/changes";
import { installOnlineManager } from "./lib/offline/online";
import { reportFailure } from "./lib/serverStatus";
import { installStandalone } from "./lib/standalone";
import "@fontsource/press-start-2p";
// index.css first: it declares the cascade-layer order that styles/nes.scss slots into.
import "./index.css";
import "./styles/nes.scss";
import { registerSW } from "virtual:pwa-register";

installFrameTones();
installOnlineManager();
installStandalone();
// The app's files are kept on the device by a service worker (vite.config.ts); a new deploy reloads into itself.
registerSW({
  immediate: true,
  // The browser only asks for a new deploy when the page is opened, and an installed app is mostly brought back from
  // the background instead: ask again whenever it comes back into view.
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && navigator.onLine) registration.update().catch(() => {});
    });
  },
});

/** How long what was fetched is kept on the device, to show when there is no connection. */
const KEEP_MS = 7 * 24 * 60 * 60_000;

const queryClient = new QueryClient({
  // No change is lost to the connection without a word, whichever part of the page made it.
  mutationCache: new MutationCache({ onError: (error) => isUnreachable(error) && reportFailure(error.message) }),
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
      gcTime: KEEP_MS,
      // While changes wait to be sent, what the server has is behind the page: asking would undo them on screen.
      // The last one to be saved asks for everything it touched (lib/offline/changes).
      refetchOnMount: () => changesWaiting(queryClient) === 0,
      refetchOnWindowFocus: () => changesWaiting(queryClient) === 0,
      refetchOnReconnect: () => changesWaiting(queryClient) === 0,
    },
  },
});
registerChanges(queryClient);

// What the queries fetched, kept in IndexedDB. Logging out or in empties the cache (hooks/useAuth), and with it this copy.
const persister = createAsyncStoragePersister({
  storage: { getItem: get<string>, setItem: set, removeItem: del },
  key: "donegeon.cache",
  // Soon after each change, so a reload (or the app closed) a moment later still finds it.
  throttleTime: 250,
});
const persistOptions = {
  persister,
  maxAge: KEEP_MS,
  // Raise when what is kept changes shape: an older copy is thrown away.
  buster: "1",
  dehydrateOptions: {
    // Search answers aren't worth keeping.
    shouldDehydrateQuery: (query: Parameters<typeof defaultShouldDehydrateQuery>[0]) =>
      defaultShouldDehydrateQuery(query) && query.queryKey[1] !== "search",
    // The changes not saved yet, the one being sent too: if the app closes before the answer, it is sent again.
    shouldDehydrateMutation: (mutation: Mutation<unknown, Error, unknown, unknown>) =>
      mutation.state.status === "pending" && mutation.options.scope?.id === CHANGES_SCOPE,
  },
};

/**
 * Once the kept copy is read back: everything in it is from before, so it is shown and asked for again (the account
 * too: it may have logged out on another device). The changes that were waiting go out first, in their order (paused
 * ones, and one that was on its way when the app closed); everything is asked for again once they're through.
 */
function resumeChanges() {
  queryClient.invalidateQueries({ refetchType: "none" });
  const waiting = queryClient.getMutationCache().getAll().filter((mutation) => mutation.state.status === "pending");
  if (waiting.length === 0) return;
  void Promise.allSettled(waiting.map((mutation) => mutation.continue())).then(() => queryClient.invalidateQueries());
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      // The account may have changed or logged out on another device since this copy was kept.
      onSuccess={resumeChanges}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
      <ServerStatus />
    </PersistQueryClientProvider>
  </StrictMode>,
);
