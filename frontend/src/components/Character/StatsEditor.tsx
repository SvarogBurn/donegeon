import { useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useGoals, useLists, useTags } from "../../hooks/useTasks";
import {
  NAME_MAX,
  newId,
  RANGES,
  SKILL_NAME_MAX,
  STAT_KEYS,
  STAT_NAME_MAX,
  TITLE_MAX,
  DEFAULT_TITLE,
  type CustomStat,
  type Profile,
  type Skill,
  type StatKey,
} from "../../lib/character/profile";
import { STAT_NAMES } from "../../lib/character/profileStats";
import type { RangeKey } from "../../lib/stats";
import { PixelCheckbox } from "../PixelCheckbox";
import { useEscape } from "./CharacterCreator";
import { useProfile } from "./useProfile";

const field = "border-2 border-stone-300 bg-white px-1 py-1 text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100";
const heading = "border-t-2 border-stone-300 pt-3 font-pixel text-xs text-stone-500 dark:border-stone-700";

const move = <T,>(items: T[], from: number, to: number) => {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
};

type SourceKind = "lists" | "goals" | "tags";

/** Open when the stat counts nothing yet; after that the user opens and closes it, also while picking. */
function SourcesDetails({ startOpen, children }: { startOpen: boolean; children: ReactNode }) {
  const [open] = useState(startOpen);
  return <details open={open}>{children}</details>;
}

/**
 * What the character sheet shows: its name and title, the built-in stats (on or off, in the user's order), stats of
 * the user's own (tasks done in some lists, goals and tags over a period, toward a target if given) and skills (a list,
 * goal or tag to level up in). Nothing is saved until Save.
 */
export function StatsEditor({ onClose }: { onClose: () => void }) {
  const { profile, save } = useProfile();
  const { data: allLists = [] } = useLists();
  const { data: goals = [] } = useGoals();
  const { data: tags = [] } = useTags();
  const lists = allLists.filter((list) => list.kind === "task");
  const [draft, setDraft] = useState<Profile>(profile);
  useEscape(onClose);
  const set = (changes: Partial<Profile>) => setDraft((d) => ({ ...d, ...changes }));

  const hidden = STAT_KEYS.filter((key) => !draft.stats.includes(key));
  const setCustom = (id: string, changes: Partial<CustomStat>) => set({ custom: draft.custom.map((c) => (c.id === id ? { ...c, ...changes } : c)) });
  const sources: [SourceKind, string, { id: string; name: string }[]][] = [
    ["lists", "Lists", lists],
    ["goals", "Goals", goals],
    ["tags", "Tags", tags],
  ];
  const skillSources: [Skill["kind"], string, { id: string; name: string }[]][] = [
    ["list", "Lists", lists],
    ["goal", "Goals", goals],
    ["tag", "Tags", tags],
  ];
  const unusedSkill = skillSources.flatMap(([kind, , items]) => items.map((item) => ({ kind, id: item.id }))).find((s) => !draft.skills.some((k) => k.kind === s.kind && k.id === s.id));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save({ ...draft, custom: draft.custom.filter((c) => c.name.trim()) });
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="card flex max-h-full w-[32rem] max-w-full flex-col gap-3 text-xs" role="dialog" aria-modal="true" aria-label="Character sheet" data-stats-editor>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <div className="grid grid-cols-[auto_1fr] items-center gap-2">
            <label htmlFor="character-name">Name</label>
            <input id="character-name" className={field} value={draft.name ?? ""} maxLength={NAME_MAX} placeholder="Your username" onChange={(e) => set({ name: e.target.value || undefined })} data-character-name-field />
            <label htmlFor="character-title">Title</label>
            <input id="character-title" className={field} value={draft.title ?? ""} maxLength={TITLE_MAX} placeholder={DEFAULT_TITLE} onChange={(e) => set({ title: e.target.value || undefined })} data-character-title-field />
          </div>

          <h3 className={heading}>Stats</h3>
          <ul className="space-y-1">
            {draft.stats.map((key, i) => (
              <li key={key} className="flex items-center gap-2">
                <label className="flex flex-1 items-center gap-2">
                  <PixelCheckbox small checked onChange={() => set({ stats: draft.stats.filter((k) => k !== key) })} data-stat-switch={key} />
                  {STAT_NAMES[key]}
                </label>
                <button type="button" className="btn-quiet glyph" aria-label={`Move ${STAT_NAMES[key]} up`} disabled={i === 0} onClick={() => set({ stats: move(draft.stats, i, i - 1) })}>
                  ↑
                </button>
                <button type="button" className="btn-quiet glyph" aria-label={`Move ${STAT_NAMES[key]} down`} disabled={i === draft.stats.length - 1} onClick={() => set({ stats: move(draft.stats, i, i + 1) })}>
                  ↓
                </button>
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
          {draft.custom.map((stat) => {
            const count = stat.lists.length + stat.goals.length + stat.tags.length;
            return (
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
                  <button type="button" className="btn-quiet ml-auto" onClick={() => set({ custom: draft.custom.filter((c) => c.id !== stat.id) })}>
                    Remove
                  </button>
                </div>
                <SourcesDetails startOpen={count === 0}>
                  <summary className="cursor-pointer text-stone-500">{count === 0 ? "Counts nothing yet: pick what it counts" : `Counts ${count} ${count === 1 ? "thing" : "things"}`}</summary>
                  <div className="mt-1 grid gap-2 sm:grid-cols-3">
                    {sources.map(([kind, label, items]) => (
                      <div key={kind} className="space-y-1">
                        <p className="text-stone-500">{label}</p>
                        {items.length === 0 && <p className="text-stone-400">None</p>}
                        {items.map((item) => (
                          <label key={item.id} className="flex items-center gap-2">
                            <PixelCheckbox
                              small
                              checked={stat[kind].includes(item.id)}
                              onChange={(e) => setCustom(stat.id, { [kind]: e.target.checked ? [...stat[kind], item.id] : stat[kind].filter((id) => id !== item.id) })}
                              data-custom-stat-source={item.name}
                            />
                            <span className="truncate">{item.name}</span>
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                </SourcesDetails>
              </fieldset>
            );
          })}
          <button type="button" className="nes-btn btn-small" disabled={draft.custom.length >= 20} onClick={() => set({ custom: [...draft.custom, { id: newId(), name: "", lists: [], goals: [], tags: [], range: "30", target: null }] })} data-add-stat>
            + Stat
          </button>

          <h3 className={heading}>Skills</h3>
          <p className="text-stone-500">A list, goal or tag to level up in: every task done in it is 1 exp.</p>
          {draft.skills.map((skill, i) => (
            <div key={skill.kind + skill.id} className="flex flex-wrap items-center gap-2" data-skill-editor>
              <select
                className={`${field} max-w-[12rem]`}
                aria-label="Skill"
                value={`${skill.kind}:${skill.id}`}
                onChange={(e) => {
                  const [kind, id] = e.target.value.split(/:(.*)/) as [Skill["kind"], string];
                  set({ skills: draft.skills.map((s, j) => (j === i ? { kind, id, ...(s.name && { name: s.name }) } : s)) });
                }}
                data-skill-source
              >
                {skillSources.map(([kind, label, items]) => (
                  <optgroup key={kind} label={label}>
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
                onChange={(e) => set({ skills: draft.skills.map((s, j) => (j === i ? { kind: s.kind, id: s.id, ...(e.target.value && { name: e.target.value }) } : s)) })}
                data-skill-name
              />
              <button type="button" className="btn-quiet glyph" aria-label="Move up" disabled={i === 0} onClick={() => set({ skills: move(draft.skills, i, i - 1) })}>
                ↑
              </button>
              <button type="button" className="btn-quiet ml-auto" onClick={() => set({ skills: draft.skills.filter((_, j) => j !== i) })}>
                Remove
              </button>
            </div>
          ))}
          <button type="button" className="nes-btn btn-small" disabled={!unusedSkill || draft.skills.length >= 30} onClick={() => unusedSkill && set({ skills: [...draft.skills, unusedSkill] })} data-add-skill>
            + Skill
          </button>
        </div>
        <div className="flex justify-end">
          <button type="button" className="nes-btn btn-small" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="nes-btn is-primary btn-small" data-stats-save>
            Save
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
