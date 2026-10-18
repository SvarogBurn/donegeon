import { useEffect } from "react";
import { Navigate, Outlet } from "react-router";
import { useMe } from "../../hooks/useAuth";
import { useOnline } from "../../lib/offline/online";
import { useStandalone } from "../../lib/standalone";
import { BreakReminder } from "../BreakReminder";
import { RefusalPopup } from "../RefusalPopup";
import { Tutorial } from "../Tutorial/Tutorial";
import { NavBar } from "./NavBar";

/** Wraps every logged-in page; sends anonymous visitors to /login. */
export function AppShell() {
  const { user, isLoading, error } = useMe();
  const online = useOnline();
  const isStandalone = useStandalone();
  // The account's theme, on the page itself so that popups drawn outside the shell follow it too (see index.css).
  const plainFont = user?.plainFont ?? false;
  useEffect(() => {
    if (!plainFont) return;
    document.documentElement.dataset.font = "plain";
    return () => void delete document.documentElement.dataset.font;
  }, [plainFont]);

  if (isLoading && !online) return <p className="p-8 text-center text-sm text-stone-500">You're offline, and nothing was kept on this device yet.</p>;
  if (isLoading) return <p className="p-8 text-center text-sm text-stone-500">Loading…</p>;
  // An account kept on the phone still shows when the server can't be asked about it.
  if (error && !user) return <p className="p-8 text-center text-sm text-red-600">Can't reach the server: {error.message}</p>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <>
      {/* The bottom padding is the room the task bar covers (--bar-h, set by NavBar); installed, the top strip's too (--top-h). */}
      <main className={`px-4 pb-[calc(var(--bar-h,5rem)+1.5rem)] ${isStandalone ? "pt-[calc(var(--top-h,4rem)+1rem)]" : "pt-6"}`}>
        <Outlet />
      </main>
      <NavBar user={user} />
      <Tutorial user={user} />
      <RefusalPopup />
      <BreakReminder />
    </>
  );
}
