import { useOnline } from "../../lib/offline/online";
import type { Profile } from "../../lib/character/profile";
import { unseenOf } from "../../lib/character/titles";
import { requirementOf, type Progress, type Reward } from "../../lib/character/unlocks";
import { CharacterSprite } from "./CharacterSprite";

/**
 * At the top of the character sheet while something earned hasn't been seen: "LEVEL UP!" when a level brought it,
 * the new bodies drawn, the new pieces and titles named. A tap on a body or a piece opens the editor with it on; OK
 * puts them all among the seen (Profile.seen), and the dot on the task bar's face goes.
 */
export function Unlocked({ progress, profile, onTry, onSeen }: { progress: Progress; profile: Profile; onTry: (reward: Reward) => void; onSeen: (seen: string[]) => void }) {
  const online = useOnline();
  const { rewards, titles, levelUp } = unseenOf(progress, profile.seen ?? []);
  if (rewards.length + titles.length === 0) return null;
  const bodies = rewards.filter((r) => r.body);
  const pieces = rewards.filter((r) => !r.body);
  const count = rewards.length + titles.length;

  return (
    <section className="space-y-3 border-2 border-amber-500 bg-amber-50 p-3 dark:bg-amber-950/40" aria-label="Unlocked" data-unlocked={count}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-pixel text-xs text-amber-700 dark:text-amber-400">{levelUp ? `LEVEL UP! Lv ${progress.level}` : "New!"}</h3>
        {count > 6 && <span className="text-xs text-stone-500">You've unlocked {count} things</span>}
      </div>
      {bodies.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {bodies.map((reward) => (
            <li key={reward.id}>
              <button type="button" className="flex flex-col items-center gap-1 text-xs" title={`Try the ${reward.name.toLowerCase()} on`} onClick={() => onTry(reward)} data-unlocked-item={reward.id}>
                <CharacterSprite look={{ v: 2, body: reward.body!, options: {}, colors: {} }} scale={1} label={reward.name} />
                <span>{reward.name}</span>
                <span className="text-xs text-stone-500">{requirementOf(reward)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {pieces.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {pieces.map((reward) => (
            <li key={reward.id}>
              <button type="button" className="pixel-chip text-xs" title={`Try it on (${requirementOf(reward)})`} onClick={() => onTry(reward)} data-unlocked-item={reward.id}>
                {reward.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {titles.length > 0 && (
        <p className="text-xs" data-unlocked-titles>
          {titles.length === 1 ? "New title: " : "New titles: "}
          <b>{titles.map((t) => t.name).join(", ")}</b>
          <span className="text-stone-500"> (pick one under Edit)</span>
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-stone-500">{rewards.length > 0 && "Tap one to try it on."}</span>
        <button
          type="button"
          className="nes-btn btn-small"
          disabled={!online}
          title={online ? undefined : "Needs a connection"}
          onClick={() => onSeen([...(profile.seen ?? []), ...rewards.map((r) => r.id), ...titles.map((t) => t.id)])}
          data-unlocked-ok
        >
          OK
        </button>
      </div>
    </section>
  );
}
