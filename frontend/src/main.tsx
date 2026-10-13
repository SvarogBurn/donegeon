import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { isUnreachable } from "./api/client";
import { ServerStatus } from "./components/ServerStatus";
import { installFrameTones } from "./lib/frameTones";
import { reportFailure } from "./lib/serverStatus";
import "@fontsource/press-start-2p";
// index.css first: it declares the cascade-layer order that styles/nes.scss slots into.
import "./index.css";
import "./styles/nes.scss";

installFrameTones();

const queryClient = new QueryClient({
  // No change is lost to the connection without a word, whichever part of the page made it.
  mutationCache: new MutationCache({ onError: (error) => isUnreachable(error) && reportFailure(error.message) }),
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      <ServerStatus />
    </QueryClientProvider>
  </StrictMode>,
);
