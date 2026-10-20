import { useMemo, useState, useSyncExternalStore } from "react";
import { localDate } from "../../api/client";
import { useGoals, useLists, usePoints, useStatRows, useTags } from "../../hooks/useTasks";
import { listColor } from "../../lib/frameTones";
import { useOnline } from "../../lib/offline/online";
import { bodyOf } from "../../lib/character/bodies";
import { DEFAULT_TITLE, RANGES, type Skill } from "../../lib/character/profile";
import { builtInStats, characterLevel, customStatValue, skillExp } from "../../lib/character/profileStats";
import { levelOf } from "../../lib/character/levels";
import { collectStats } from "../../lib/stats";
import { TileFrame } from "../Tiles/TileFrame";
import { CellBar, ExpBar } from "./Bars";
import { CharacterEditor } from "./CharacterEditor";
import { CharacterSprite } from "./CharacterSprite";
import { useProfile } from "./useProfile";

// What the old Account box called its numbers, kept for the browser checks that read them.
const STAT_DATA: Record<string, string> = { streak: "data-streak", longest: "data-streak-longest", year: "data-done-year" };

/** A skill's name and bar colour: its own if given, else its list's, goal's or tag's name and its list's colour (none: the exp bar's yellow). */
export function useSkillNames() {
  const { data: lists = [] } = useLists();
  const { data: goals = [] } = useGoals();
  const { data: tags = [] } = useTags();
  return (skill: Skill): { name: string; color?: string } => {
    if (skill.kind === "list") {
      const list = lists.find((l) => l.id === skill.id);
      return { name: skill.name ?? list?.name ?? "", color: skill.color ?? (list ? listColor(list) : undefined) };
    }
    const pool = skill.kind === "goal" ? goals : tags;
    return { name: skill.name ?? pool.find((x) => x.id === skill.id)?.name ?? "", color: skill.color };
  };
}

const PHONE = "(max-width: 639.98px)";
const subscribePhone = (onChange: () => void) => {
  const query = matchMedia(PHONE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
/** One column: the stats go under the character, and the character is as wide as the box. */
const useIsPhone = () => useSyncExternalStore(subscribePhone, () => matchMedia(PHONE).matches);

/**
 * The top of the user's page, as a game's character sheet, the character's name on its band: the character, its
 * title, level and exp, and beside it (under it on a phone, the character as wide as the box) the stats and skills the
 * user picked. Every task done (a tick at any depth, a press) is one exp. "Edit" opens all of it in the editor.
 */
export function CharacterSheet() {
  const { profile, look, name } = useProfile();
  const rows = useStatRows();
  const lists = useLists();
  const points = usePoints();
  const online = useOnline();
  const skillName = useSkillNames();
  const [editing, setEditing] = useState(false);
  const isPhone = useIsPhone();

  const today = localDate();
  const collected = useMemo(() => (rows.data && lists.data ? collectStats(rows.data, lists.data) : null), [rows.data, lists.data]);
  const level = characterLevel(collected?.completions ?? []);
  const values = collected && builtInStats({ ...collected, today, balance: points.data?.balance ?? null });

  return (
    <TileFrame
      title={<span data-character-name>{name}</span>}
      aria-label="Character"
      data-character
      actions={
        <button type="button" className="band-button" disabled={!online} title={online ? "The character's look, name, stats and skills" : "Needs a connection"} onClick={() => setEditing(true)} data-character-edit>
          Edit
        </button>
      }
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex flex-none flex-col items-center gap-2 sm:w-[calc(var(--u)*76)]">
          <div className="character-stage max-sm:w-full max-sm:!px-0" data-edge={bodyOf(look).toEdge || undefined}>
            <CharacterSprite look={look} scale={2} fit={isPhone} label={`${name}, the character`} />
          </div>
          <p className="text-xs text-stone-500" data-character-title>
            {profile.title ?? DEFAULT_TITLE}
          </p>
          <div className="flex w-full flex-col items-center gap-1">
            <p className="font-pixel text-xs" data-character-level={level.level}>
              Lv. {level.level}
            </p>
            <ExpBar into={level.into} span={level.span} label="Exp to the next level" />
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          {values && profile.stats.length > 0 && (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-2" data-character-stats>
              {profile.stats.map((key) => {
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
      <p className="text-xs text-stone-500">Every task done is 1 exp. Do at least one task a day to keep the streak going.</p>
      {editing && <CharacterEditor onClose={() => setEditing(false)} />}
    </TileFrame>
  );
}
