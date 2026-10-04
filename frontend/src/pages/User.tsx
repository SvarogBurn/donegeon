import { TileFrame } from "../components/Tiles/TileFrame";
import { useLogout, useMe } from "../hooks/useAuth";

/** The user's own page, opened from their icon in the task bar: who is logged in, and logging out. */
export function UserPage() {
  const { user } = useMe();
  const logout = useLogout();
  if (!user) return null;

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <TileFrame title="Account" aria-label="Account">
        <div className="flex items-center gap-3">
          <span className="tab-icon tab-icon-user !size-[42px] flex-none" aria-hidden />
          <p className="min-w-0 text-base break-words" data-username>
            {user.username}
          </p>
        </div>
        <button type="button" className="nes-btn btn" disabled={logout.isPending} onClick={() => logout.mutate()}>
          Log out
        </button>
        {logout.error && <p className="text-xs text-red-600">{logout.error.message}</p>}
      </TileFrame>
    </div>
  );
}
