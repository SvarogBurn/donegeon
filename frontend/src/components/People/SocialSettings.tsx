import { useQueryClient } from "@tanstack/react-query";
import type { ShareKey, User } from "../../types";
import { useBlocks, useUnblock } from "../../hooks/people";
import { PEOPLE } from "../../hooks/queryKeys";
import { useMe, useUpdateMe } from "../../hooks/useAuth";
import { PixelCheckbox } from "../PixelCheckbox";

const SHARES: [ShareKey, string, string][] = [
  ["activity", "Streak and tasks this week", "Your streak, how much you did this week, and when you were last here."],
  ["stats", "Stats", "The stats you picked for your character. Stats of your own stay private."],
  ["skills", "Skills", "Your skills, by their names: a skill with no name of its own shows its list's, goal's or tag's name."],
  ["hearts", "Hearts", "Your health. What cost it stays private."],
];

/** Those you blocked, and the way back. Shown only when there are any. */
function Blocked() {
  const { data: blocks = [] } = useBlocks();
  const unblock = useUnblock();
  if (blocks.length === 0) return null;
  return (
    <div className="space-y-1" data-blocked>
      <p className="text-xs">Blocked</p>
      <ul className="space-y-1">
        {blocks.map(({ id, username }) => (
          <li key={id} className="flex items-center gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate">{username}</span>
            <button type="button" className="btn-quiet underline" onClick={() => unblock.mutate(id)} data-unblock={username}>
              Unblock
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Whether friends see the character and it sees them, what is on its card besides the character, title and level, and the cheers. */
export function SocialSettings() {
  const { user } = useMe();
  const update = useUpdateMe();
  const queryClient = useQueryClient();
  if (!user) return null;
  const shares = user.shares ?? [];
  // Every card can change with these.
  const change = (changes: Partial<Pick<User, "peopleOff" | "shares" | "cheersOff">>) => update.mutate(changes, { onSettled: () => queryClient.invalidateQueries({ queryKey: PEOPLE }) });
  const setShare = (key: ShareKey, on: boolean) => change({ shares: on ? [...shares, key] : shares.filter((other) => other !== key) });

  return (
    <>
      <label className="flex items-center gap-2 text-xs">
        <PixelCheckbox small checked={!user.peopleOff} onChange={(e) => change({ peopleOff: !e.target.checked })} data-people-on />
        People
      </label>
      <p className="text-xs text-stone-500">
        {user.peopleOff
          ? "You see nobody and nobody sees you. Nobody can add you. Your friends wait for when you're back."
          : "Only people you added by their exact username, and who said yes, see your card, and you see only theirs."}
      </p>
      {!user.peopleOff && (
        <>
          <p className="text-xs text-stone-500">Your card always has your character, username, title and level. Whatever you add here you see on other people's cards too, where they show it. What you don't show, you don't see.</p>
          {SHARES.map(([key, label, note]) => (
            <div key={key} className="space-y-1">
              <label className="flex items-center gap-2 text-xs">
                <PixelCheckbox small checked={shares.includes(key)} disabled={key === "hearts" && user.healthOff} onChange={(e) => setShare(key, e.target.checked)} data-share={key} />
                {label}
              </label>
              <p className="text-xs text-stone-500">{key === "hearts" && user.healthOff ? "Health is off, in Gamification." : note}</p>
            </div>
          ))}
          <label className="flex items-center gap-2 text-xs">
            <PixelCheckbox small checked={!user.cheersOff} onChange={(e) => change({ cheersOff: !e.target.checked })} data-cheers-on />
            Cheers
          </label>
          <p className="text-xs text-stone-500">{user.cheersOff ? "You don't get cheers, and you can't send any." : "A tap on someone's card sends them a cheer, once a day. Nobody sees how many you get."}</p>
        </>
      )}
      <Blocked />
    </>
  );
}
