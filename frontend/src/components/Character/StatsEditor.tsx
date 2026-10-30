import { useState } from "react";
import { useGoals, useTags } from "../../hooks/labels";
import { useLists } from "../../hooks/lists";
import { usePointsOff } from "../../hooks/useAuth";
import { LIST_COLORS, listColor } from "../../lib/frameTones";
import { newId, RANGES, SKILL_NAME_MAX, STAT_KEYS, STAT_NAME_MAX, type CustomStat, type Profile, type Skill, type StatKey } from "../../lib/character/profile";
import { STAT_NAMES } from "../../lib/character/profileStats";
import type { RangeKey } from "../../lib/stats";
import { PixelCheckbox } from "../PixelCheckbox";

export const field = "border-2 border-stone-300 bg-white px-1 py-1 text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100";
export const heading = "border-t-2 border-stone-300 pt-3 font-pixel text-xs text-stone-500 dark:border-stone-700";

const move = <T,>(items: T[], from: number, to: number) => {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
};

/** What a section of the editor gets: the profile being edited, and the way to change it. Nothing is saved until Save. */
export interface SectionProps {
  draft: Profile;
  set: (changes: Partial<Profile>) => void;
}

/** ↑ ↓ for the item at `i` of `count`. */
function MoveButtons({ i, count, name, onMove }: { i: number; count: number; name: string; onMove: (to: number) => void }) {
  return (
    <>
      <button type="button" className="btn-quiet glyph" aria-label={`Move ${name} up`} disabled={i === 0} onClick={() => onMove(i - 1)}>
        ↑
      </button>
      <button type="button" className="btn-quiet glyph" aria-label={`Move ${name} down`} disabled={i === count - 1} onClick={() => onMove(i + 1)}>
        ↓
      </button>
    </>
  );
}

type SourceKind = "lists" | "goals" | "tags";

const REWARD_NOTE = "A reward list counts what was bought from it, and earns no unlocks or titles.";

/** What a stat of the user's own counts: hidden behind "Change" once it counts something, open while it counts nothing. */
function Sources({ stat, onChange }: { stat: CustomStat; onChange: (changes: Partial<CustomStat>) => void }) {
  const { data: allLists = [] } = useLists();
  const { data: goals = [] } = useGoals();
  const { data: tags = [] } = useTags();
  const count = stat.lists.length + stat.goals.length + stat.tags.length;
  const [open, setOpen] = useState(count === 0);
  const rewardLists = allLists.filter((list) => list.kind === "reward");
  const sources: [SourceKind, string, { id: string; name: string }[]][] = [
    ["lists", "Lists", allLists.filter((list) => list.kind === "task")],
    ...(rewardLists.length > 0 ? [["lists", "Reward lists", rewardLists] satisfies [SourceKind, string, { id: string; name: string }[]]] : []),
    ["goals", "Goals", goals],
    ["tags", "Tags", tags],
  ];
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-stone-500">
        <span>{count === 0 ? "Counts nothing yet: pick what it counts" : `Counts ${count} ${count === 1 ? "thing" : "things"}`}</span>
        {count > 0 && (
          <button type="button" className="btn-quiet !py-0" aria-expanded={open} onClick={() => setOpen(!open)} data-custom-stat-sources>
            {open ? "Done" : "Change"}
          </button>
        )}
      </div>
      {open && (
        <div className="grid gap-2 sm:grid-cols-3">
          {sources.map(([kind, label, items]) => (
            <div key={label} className="space-y-1">
              <p className="text-stone-500">{label}</p>
              {items.length === 0 && <p className="text-stone-400">None</p>}
              {items.map((item) => (
                <label key={item.id} className="flex items-center gap-2">
                  <PixelCheckbox
                    small
                    checked={stat[kind].includes(item.id)}
                    onChange={(e) => onChange({ [kind]: e.target.checked ? [...stat[kind], item.id] : stat[kind].filter((id) => id !== item.id) })}
                    data-custom-stat-source={item.name}
                  />
                  <span className="truncate">{item.name}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
      {open && rewardLists.length > 0 && <p className="text-stone-500">{REWARD_NOTE}</p>}
    </div>
  );
}

/**
 * The built-in stats (on or off, in the user's order) and stats of the user's own (tasks done in some lists, goals and tags over a period, toward a target if given).
 * While the points system is off the points stat isn't offered; one that is on keeps its place for when they are back.
 */
export function StatsSection({ draft, set }: SectionProps) {
  const pointsOff = usePointsOff();
  const offered = (key: StatKey) => !(pointsOff && key === "points");
  const shown = draft.stats.filter(offered);
  const hidden = STAT_KEYS.filter((key) => !draft.stats.includes(key) && offered(key));
  // Moving among the shown ones; the points stat, if on, stays at its own place.
  const moveShown = (i: number, to: number) => {
    const next = move(shown, i, to);
    const at = draft.stats.indexOf("points");
    if (pointsOff && at !== -1) next.splice(at, 0, "points");
    set({ stats: next });
  };
  const setCustom = (id: string, changes: Partial<CustomStat>) => set({ custom: draft.custom.map((c) => (c.id === id ? { ...c, ...changes } : c)) });

  return (
    <div className="space-y-3 text-xs" data-editor-section="stats">
      <ul className="space-y-1">
        {shown.map((key, i) => (
          <li key={key} className="flex items-center gap-2">
            <label className="flex flex-1 items-center gap-2">
              <PixelCheckbox small checked onChange={() => set({ stats: draft.stats.filter((k) => k !== key) })} data-stat-switch={key} />
              {STAT_NAMES[key]}
            </label>
            <MoveButtons i={i} count={shown.length} name={STAT_NAMES[key]} onMove={(to) => moveShown(i, to)} />
          </li>
        ))}
        {hidden.map((key: StatKey) => (
          <li key={key}>
            <label className="flex items-center gap-2 text-stone-500">
              <PixelCheckbox small checked={false} onChange={() => set({ stats: [...draft.stats, key] })} data-stat-switch={key} />
              {STAT_NAMES[key]}
            </label>
          </li>
        ))}
      </ul>

      <h3 className={heading}>Your stats</h3>
      <p className="text-stone-500">Tasks done in any of its lists, goals and tags (a task in two of them counts once), over a period. With a target it is a bar that fills up.</p>
      {draft.custom.map((stat, i) => (
        <fieldset key={stat.id} className="space-y-2 border-2 border-stone-200 p-2 dark:border-stone-800" data-custom-stat-editor>
          <div className="flex flex-wrap items-center gap-2">
            <input className={`${field} w-28`} value={stat.name} maxLength={STAT_NAME_MAX} placeholder="Name (STR)" aria-label="Stat name" onChange={(e) => setCustom(stat.id, { name: e.target.value })} data-custom-stat-name />
            <select className={field} value={stat.range} aria-label="Over" onChange={(e) => setCustom(stat.id, { range: e.target.value as RangeKey })} data-custom-stat-range>
              {RANGES.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <input
              className={`${field} w-20`}
              inputMode="numeric"
              placeholder="Target"
              aria-label="Target"
              value={stat.target ?? ""}
              onChange={(e) => setCustom(stat.id, { target: Number(e.target.value.replace(/\D/g, "").slice(0, 7)) || null })}
              data-custom-stat-target
            />
            <span className="ml-auto flex items-center">
              <MoveButtons i={i} count={draft.custom.length} name={stat.name || "this stat"} onMove={(to) => set({ custom: move(draft.custom, i, to) })} />
              <button type="button" className="btn-quiet" onClick={() => set({ custom: draft.custom.filter((c) => c.id !== stat.id) })}>
                Remove
              </button>
            </span>
          </div>
          <Sources stat={stat} onChange={(changes) => setCustom(stat.id, changes)} />
        </fieldset>
      ))}
      <button type="button" className="nes-btn btn-small" disabled={draft.custom.length >= 20} onClick={() => set({ custom: [...draft.custom, { id: newId(), name: "", lists: [], goals: [], tags: [], range: "30", target: null }] })} data-add-stat>
        + Stat
      </button>
    </div>
  );
}

/** A skill's bar colour: the swatch opens the colours, the browser's picker for any other, and the way back to its list's (or yellow). */
function SkillColor({ color, fallback, onPick }: { color?: string; fallback: string; onPick: (hex: string | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const current = color ?? fallback;
  return (
    <div className="relative">
      <button
        type="button"
        className="block h-6 w-8 cursor-pointer border-2 border-stone-300 dark:border-stone-700"
        style={{ backgroundColor: current }}
        aria-label="Bar colour"
        aria-expanded={open}
        title="The colour of its bar"
        onClick={() => setOpen(!open)}
        data-skill-color
      />
      {open && (
        <div className="card absolute top-full left-0 z-10 mt-1 w-44 space-y-2 !p-2" data-skill-colors>
          <div className="grid grid-cols-5 gap-1">
            {LIST_COLORS.map(([colorName, hex]) => (
              <button
                key={hex}
                type="button"
                className={`size-6 cursor-pointer border-2 ${current === hex ? "border-stone-900 dark:border-white" : "border-transparent"}`}
                style={{ backgroundColor: hex }}
                aria-label={colorName}
                aria-pressed={current === hex}
                title={colorName}
                onClick={() => {
                  onPick(hex);
                  setOpen(false);
                }}
              />
            ))}
            <input type="color" className="size-6 cursor-pointer" value={current} aria-label="Any other colour" onChange={(e) => onPick(e.target.value)} />
          </div>
          {color && (
            <button
              type="button"
              className="btn-quiet"
              onClick={() => {
                onPick(undefined);
                setOpen(false);
              }}
            >
              Back to its own
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** The exp bar's yellow, for a skill with no colour of its own and no list. */
export const EXP_YELLOW = "#fbf236";

/** Skills: a list, goal or tag to level up in, with a name and a bar colour of its own if wanted. */
export function SkillsSection({ draft, set }: SectionProps) {
  const { data: allLists = [] } = useLists();
  const { data: goals = [] } = useGoals();
  const { data: tags = [] } = useTags();
  const lists = allLists.filter((list) => list.kind === "task");
  const rewardLists = allLists.filter((list) => list.kind === "reward");
  const skillSources: [Skill["kind"], string, { id: string; name: string }[]][] = [
    ["list", "Lists", lists],
    ...(rewardLists.length > 0 ? [["list", "Reward lists", rewardLists] satisfies [Skill["kind"], string, { id: string; name: string }[]]] : []),
    ["goal", "Goals", goals],
    ["tag", "Tags", tags],
  ];
  const unusedSkill = skillSources.flatMap(([kind, , items]) => items.map((item) => ({ kind, id: item.id }))).find((s) => !draft.skills.some((k) => k.kind === s.kind && k.id === s.id));
  const setSkill = (i: number, changes: Partial<Skill>) =>
    set({ skills: draft.skills.map((s, j) => (j === i ? (Object.fromEntries(Object.entries({ ...s, ...changes }).filter(([, v]) => v !== undefined && v !== "")) as unknown as Skill) : s)) });
  const ownColor = (skill: Skill) => {
    const list = skill.kind === "list" ? allLists.find((l) => l.id === skill.id) : undefined;
    return list ? listColor(list) : EXP_YELLOW;
  };

  return (
    <div className="space-y-3 text-xs" data-editor-section="skills">
      <p className="text-stone-500">A list, goal or tag to level up in: every task done in it is 1 exp. Its bar is in its list's colour unless you pick one.</p>
      {draft.skills.map((skill, i) => (
        <div key={skill.kind + skill.id} className="flex flex-wrap items-center gap-2" data-skill-editor>
          <select
            className={`${field} max-w-[12rem]`}
            aria-label="Skill"
            value={`${skill.kind}:${skill.id}`}
            onChange={(e) => {
              const [kind, id] = e.target.value.split(/:(.*)/) as [Skill["kind"], string];
              setSkill(i, { kind, id });
            }}
            data-skill-source
          >
            {skillSources.map(([kind, label, items]) => (
              <optgroup key={label} label={label}>
                {items.map((item) => (
                  <option key={item.id} value={`${kind}:${item.id}`} disabled={draft.skills.some((s, j) => j !== i && s.kind === kind && s.id === item.id)}>
                    {item.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <input
            className={`${field} w-32`}
            value={skill.name ?? ""}
            maxLength={SKILL_NAME_MAX}
            placeholder="Its own name"
            aria-label="Skill name"
            onChange={(e) => setSkill(i, { name: e.target.value })}
            data-skill-name
          />
          <SkillColor color={skill.color} fallback={ownColor(skill)} onPick={(color) => setSkill(i, { color })} />
          <span className="ml-auto flex items-center">
            <MoveButtons i={i} count={draft.skills.length} name="this skill" onMove={(to) => set({ skills: move(draft.skills, i, to) })} />
            <button type="button" className="btn-quiet" onClick={() => set({ skills: draft.skills.filter((_, j) => j !== i) })}>
              Remove
            </button>
          </span>
        </div>
      ))}
      <button type="button" className="nes-btn btn-small" disabled={!unusedSkill || draft.skills.length >= 30} onClick={() => unusedSkill && set({ skills: [...draft.skills, unusedSkill] })} data-add-skill>
        + Skill
      </button>
      {rewardLists.length > 0 && <p className="text-xs text-stone-500">{REWARD_NOTE}</p>}
    </div>
  );
}
