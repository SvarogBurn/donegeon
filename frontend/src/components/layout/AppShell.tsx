import { Navigate, Outlet } from "react-router";
import { useMe } from "../../hooks/useAuth";
import { BreakReminder } from "../BreakReminder";
import { RefusalPopup } from "../RefusalPopup";
import { Tutorial } from "../Tutorial/Tutorial";
import { NavBar } from "./NavBar";

/** Wraps every logged-in page; sends anonymous visitors to /login. */
export function AppShell() {
  const { user, isLoading, error } = useMe();

  if (isLoading) return <p className="p-8 text-center text-sm text-stone-500">Loading…</p>;
  if (error) return <p className="p-8 text-center text-sm text-red-600">Can't reach the server: {error.message}</p>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <>
      {/* The bottom padding is the room the task bar covers (--bar-h, set by NavBar). */}
      <main className="px-4 pt-6 pb-[calc(var(--bar-h,5rem)+1.5rem)]">
        <Outlet />
      </main>
      <NavBar user={user} />
      <Tutorial user={user} />
      <RefusalPopup />
      <BreakReminder />
    </>
  );
}
