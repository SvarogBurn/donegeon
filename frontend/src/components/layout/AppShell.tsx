import { Navigate, Outlet } from "react-router";
import { useMe } from "../../hooks/useAuth";
import { NavBar } from "./NavBar";

/** Wraps every logged-in page; sends anonymous visitors to /login. */
export function AppShell() {
  const { user, isLoading, error } = useMe();

  if (isLoading) return <p className="p-8 text-center text-sm text-stone-500">Loading…</p>;
  if (error) return <p className="p-8 text-center text-sm text-red-600">Can't reach the server: {error.message}</p>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <>
      <NavBar user={user} />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </>
  );
}
