import { useState, useSyncExternalStore } from "react";
import { usePoints } from "../../hooks/points";
import { useFreezeOff, useHealthOff, usePointsOff } from "../../hooks/useAuth";
import { addDays, daysBetween } from "../../../../shared/dates";
import { formatDay } from "../../lib/dates";
import { useOnline } from "../../lib/offline/online";
import { bodyOf, type Look } from "../../lib/character/bodies";
import { RANGES } from "../../lib/character/profile";
import { builtInStats, customStatValue, skillExp } from "../../lib/character/profileStats";
import { levelOf } from "../../lib/character/levels";
import { shownTitle } from "../../lib/character/titles";
import { shownLook, tryOn } from "../../lib/character/unlocks";
import { USER_BOX_COLORS } from "../../lib/frameTones";
import type { Health } from "../../types";
import { TileFrame } from "../Tiles/TileFrame";
import { CellBar, ExpBar, Hearts } from "./Bars";
import { CharacterEditor } from "./CharacterEditor";
import { CharacterSprite } from "./CharacterSprite";
import { Unlocked } from "./Unlocked";
import { useProfile } from "./useProfile";
import { useCharacterProgress, useSkillNames } from "./useUnlocks";

// What the old Account box called its numbers, kept for the browser checks that read them.
const STAT_DATA: Record<string, string> = { streak: "data-streak", longest: "data-streak-longest", year: "data-done-year" };

const PHONE = "(max-width: 639.98px)";
const subscribePhone = (onChange: () => void) => {
  const query = matchMedia(PHONE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
/** One column: the stats go under the character, and the character is as wide as the box. */
const useIsPhone = () => useSyncExternalStore(subscribePhone, () => matchMedia(PHONE).matches);

/** What cost the health lately, a line each, for the hearts' tooltip: "−2 Essay (deadline 27/10)". */
const hitsText = (health: Health) =>
  health.recent.length === 0 ? "Nothing missed yet" : health.recent.map((hit) => `−${hit.damage} ${hit.title} (${hit.kind} ${formatDay(addDays(hit.day, -1))})`).join("\n");

/** How long the sheet says the character was knocked out, or a day missed cost a level. */
const KNOCKOUT_SHOWN_DAYS = 7;

const levelsText = (drop: { from: number; to: number }) => (drop.from > drop.to ? `: lost ${drop.from - drop.to} ${drop.from - drop.to === 1 ? "level" : "levels"}` : "");

/**
 * The top of the user's page, as a game's character sheet, the character's name on its band: the character, its
 * title, level and exp, and beside it (under it on a phone, the character as wide as the box) the stats and skills the
 * user picked. Every task done (a tick at any depth, a press) is one exp, and so is every mail sent to the devs (the character's only; skills count tasks). "Edit", at the bottom right (the
 * bottom on a phone, as wide as the box), opens all of it in the editor.
 */
export function CharacterSheet() {
  const { profile, look, name, save } = useProfile();
  const { collected, level, progress, unlocks, today, health } = useCharacterProgress();
  const points = usePoints();
  const pointsOff = usePointsOff();
  const healthOff = useHealthOff();
  const freezeOff = useFreezeOff();
  // A knockout takes back what the lost levels earned, worn or not, until they are earned again.
  const shown = unlocks.knockedOut ? shownLook(look, unlocks) : look;
  const knockout = health?.knockouts.at(-1);
  const knockedOutLately = knockout && daysBetween(knockout.day, today) < KNOCKOUT_SHOWN_DAYS;
  // Each day missed that kept the streak cost a level.
  const freezes = health?.freezes.filter((f) => daysBetween(f.day, today) < KNOCKOUT_SHOWN_DAYS) ?? [];
  const online = useOnline();
  const skillName = useSkillNames();
  // Open, maybe with something new tried on.
  const [editing, setEditing] = useState<{ trying?: Look } | null>(null);
  const isPhone = useIsPhone();

  const values = collected && builtInStats({ ...collected, today, balance: points.data?.balance ?? null, frozen: health?.frozen });
  // No points stat while the points system is off; it stays picked for when they are back.
  const stats = profile.stats.filter((key) => !(pointsOff && key === "points"));

  return (
    <TileFrame
      title={<span data-character-name>{name}</span>}
      aria-label="Character"
      color={USER_BOX_COLORS.character}
      data-character
    >
      {progress && !profile.hideNews && <Unlocked progress={progress} profile={profile} onTry={(reward) => setEditing({ trying: tryOn(look, reward) })} onSeen={(seen) => save({ ...profile, seen })} />}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex flex-none flex-col items-center gap-2 sm:w-[calc(var(--u)*76)]">
          <div className="character-stage max-sm:w-full max-sm:!px-0">
            <CharacterSprite look={shown} scale={2} fit={isPhone} cover={bodyOf(shown).toEdge} label={`${name}, the character`} />
          </div>
          <p className="text-xs text-stone-500" data-character-title>
            {shownTitle(profile.title, unlocks.progress).name}
          </p>
          {health && !healthOff && (
            <div className="w-full" data-character-health>
              <Hearts hp={health.hp} max={health.max} title={hitsText(health)} />
              {knockedOutLately && (
                <p className="text-center text-xs text-red-700 dark:text-red-400" data-knockout>
                  Knocked out on {formatDay(knockout.day)}
                  {levelsText(knockout)}
                </p>
              )}
              {freezes.length > 0 && (
                <p className="text-center text-xs text-sky-700 dark:text-sky-400" data-freeze={freezes.length}>
                  {freezes.length === 1 ? `Streak kept on ${formatDay(freezes[0].day)}` : `Streak kept over ${freezes.length} days missed`}
                  {levelsText({ from: freezes.length, to: 0 })}
                </p>
              )}
            </div>
          )}
          <div className="flex w-full flex-col items-center gap-1">
            <p className="font-pixel text-xs" data-character-level={level.level}>
              Lv. {level.level}
            </p>
            <ExpBar into={level.into} span={level.span} label="Exp to the next level" />
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          {values && stats.length > 0 && (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2" data-character-stats>
              {stats.map((key) => {
                const stat = values[key];
                return (
                  <li key={key} data-stat={key}>
                    <span className="text-xl font-bold tabular-nums" {...(STAT_DATA[key] && { [STAT_DATA[key]]: stat.value })}>
                      {stat.value}
                    </span>
                    {stat.of !== undefined && <span className="text-xs text-stone-500 tabular-nums"> / {stat.of}</span>}{" "}
                    <span className="text-xs text-stone-500">{stat.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {collected && profile.custom.length > 0 && (
            <ul className="space-y-1.5" data-character-custom>
              {profile.custom.map((stat) => {
                const value = customStatValue(stat, collected.completions, today);
                const range = RANGES.find(([key]) => key === stat.range)?.[1];
                return (
                  <li key={stat.id} className="flex flex-wrap items-center gap-x-2 gap-y-1" data-custom-stat={stat.name} data-value={value}>
                    <span className="w-24 truncate font-pixel text-[10px]" title={`${stat.name}: tasks done in ${range}`}>
                      {stat.name}
                    </span>
                    {stat.target ? <CellBar value={value} max={stat.target} label={`${stat.name}: ${value} of ${stat.target}`} /> : null}
                    <span className="text-xs tabular-nums">
                      {value}
                      {stat.target ? <span className="text-stone-500"> / {stat.target}</span> : null}
                    </span>
                    <span className="text-[10px] text-stone-500">{range}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="space-y-2">
            <h3 className="border-t-2 border-stone-300 pt-2 font-pixel text-xs text-stone-500 dark:border-stone-700">Skills</h3>
            {profile.skills.length === 0 ? (
              <p className="text-xs text-stone-500">No skills yet. Edit to pick a list, goal or tag to level up in: every task done in it is 1 exp.</p>
            ) : (
              <ul className="space-y-2" data-character-skills>
                {profile.skills.map((skill) => {
                  const exp = skillExp(skill, collected?.completions ?? []);
                  const { level: lv, into, span } = levelOf(exp);
                  const { name: shown, color } = skillName(skill);
                  return (
                    <li key={skill.kind + skill.id} data-skill={shown} data-skill-level={lv} data-skill-exp={exp}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-xs">{shown}</span>
                        <span className="flex-none font-pixel text-[10px]">Lv. {lv}</span>
                      </div>
                      <ExpBar into={into} span={span} color={color} label={`Exp of ${shown} to its next level`} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <p className="flex-1 text-xs text-stone-500">Every task done is 1 exp, and so is every mail to the devs. Do at least one task a day to keep the streak going.{!healthOff && " A deadline or round missed costs health, as much as it was worth; only a new level heals it, and running out costs levels."}{!freezeOff && " A day with nothing done costs a level instead of the streak."}</p>
        <button type="button" className="band-button justify-center max-sm:h-8 max-sm:w-full" disabled={!online} title={online ? "The character's look, name, stats and skills" : "Needs a connection"} onClick={() => setEditing({})} data-character-edit>
          Edit
        </button>
      </div>
      {editing && <CharacterEditor trying={editing.trying} onClose={() => setEditing(null)} />}
    </TileFrame>
  );
}
