import type { ReactNode } from "react";
import { useOnline } from "../lib/offline/online";

/** What only works with the server there: lists, folders, settings... Greyed out and switched off while offline. */
export function NeedsConnection({ children }: { children: ReactNode }) {
  const online = useOnline();
  return (
    // A disabled fieldset switches off every field and button in it; `contents` keeps it out of the layout.
    <fieldset disabled={!online} title={online ? undefined : "Needs a connection"} className="contents">
      {children}
    </fieldset>
  );
}
