import { useEffect, useRef } from "react";
import { useSevenTaps } from "../../hooks/useSevenTaps";
import { BODIES, bodyOf, choiceOf, materialsOf, materialsWorn, type Look } from "../../lib/character/bodies";
import { CLOTH_COLORS, FUR_COLORS } from "../../lib/character/ramps";
import { earnedTitles, shownTitle } from "../../lib/character/titles";
import { bodyLock, choiceLock, lockedIn, requirementOf, type Reward, type Unlocks } from "../../lib/character/unlocks";
import { CharacterSprite } from "./CharacterSprite";
import { type SectionProps } from "./StatsEditor";

/** Esc closes it wherever the focus is (a pressed button that goes away leaves it on the page). */
export function useEscape(onEscape: () => void) {
  const latest = useRef(onEscape);
  latest.current = onEscape;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && latest.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

// Materials that are a body's own colouring, offered the fur colours; the rest are clothes and the like.
const BODY_COLORED = new Set(["fur", "skin", "wool", "hair"]);

/** A padlock, drawn in pixels (the font has none). */
function LockGlyph() {
  const rows = [".###.", "#...#", "#####", "##.##", "#####"];
  return (
    <svg viewBox="0 0 5 5" className="inline-block size-[calc(var(--u)*3)] flex-none align-[-1px]" shapeRendering="crispEdges" fill="currentColor" aria-hidden>
      {rows.flatMap((row, y) => [...row].map((c, x) => (c === "#" ? <rect key={`${x},${y}`} x={x} y={y} width={1} height={1} /> : null)))}
    </svg>
  );
}

/** ◀ name ▶: steps through `options`, round. A locked one can be tried on: it shows a padlock and what it waits for. */
function Stepper({ label, options, value, onChange, name }: { label: string; options: { id: string; name: string; locked?: string }[]; value: string; onChange: (id: string) => void; name: string }) {
  const at = Math.max(0, options.findIndex((o) => o.id === value));
  const step = (by: number) => onChange(options[(at + by + options.length) % options.length].id);
  const locked = options[at]?.locked;
  return (
    <div className="flex items-center gap-2" data-stepper={name} data-locked={locked}>
      <span className="w-16 flex-none font-pixel text-[10px] text-stone-500">{label}</span>
      <button type="button" className="stepper-arrow" aria-label={`Previous ${label.toLowerCase()}`} onClick={() => step(-1)}>
        ◀
      </button>
      <span className="min-w-0 flex-1 text-center text-xs">
        <span className={`block truncate ${locked ? "text-stone-500" : ""}`} data-stepper-value>
          {options[at]?.name}
        </span>
        {locked !== undefined && (
          <span className="block truncate text-xs text-amber-700 dark:text-amber-400" title={`Unlocks at ${locked}`} data-stepper-lock>
            <LockGlyph /> {locked}
          </span>
        )}
      </span>
      <button type="button" className="stepper-arrow" aria-label={`Next ${label.toLowerCase()}`} onClick={() => step(1)}>
        ▶
      </button>
    </div>
  );
}

/** A material's colour: swatches, the browser's picker for any other, and back to as drawn. */
function ColorRow({ label, current, isPicked, colors, onPick, onReset, name }: { label: string; current: string; isPicked: boolean; colors: [string, string][]; onPick: (hex: string) => void; onReset: () => void; name: string }) {
  const other = useRef<HTMLInputElement>(null);
  const latestPick = useRef(onPick);
  latestPick.current = onPick;
  // The picker reports every colour passed over, and the character follows it; the row keeps the last one.
  useEffect(() => {
    const input = other.current;
    if (!input) return;
    const onInput = () => latestPick.current(input.value);
    input.addEventListener("input", onInput);
    return () => input.removeEventListener("input", onInput);
  }, []);
  useEffect(() => {
    if (other.current && document.activeElement !== other.current) other.current.value = current.toLowerCase();
  }, [current]);

  return (
    <div className="space-y-1" data-color-row={name}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate font-pixel text-[10px] text-stone-500" title={label}>
          {label}
        </span>
        {isPicked && (
          <button type="button" className="btn-quiet ml-auto flex-none !py-0 whitespace-nowrap" onClick={onReset}>
            As drawn
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {colors.map(([colorName, hex]) => (
          <button
            key={hex}
            type="button"
            className={`size-5 cursor-pointer border-2 ${current.toUpperCase() === hex ? "border-stone-900 dark:border-white" : "border-transparent"}`}
            style={{ backgroundColor: hex }}
            aria-label={colorName}
            aria-pressed={current.toUpperCase() === hex}
            title={colorName}
            onClick={() => onPick(hex)}
          />
        ))}
        <input ref={other} type="color" className="h-5 w-8 cursor-pointer" defaultValue={current.toLowerCase()} aria-label={`Any other colour for ${label.toLowerCase()}`} />
      </div>
    </div>
  );
}

/**
 * A random look: any body unlocked, any of its choices unlocked, and new colours for most of its materials. An extra
 * that is off until picked (a tail, horns, a hat) stays off half the time, so a random human isn't everything at once.
 */
function randomLook(unlocks: Unlocks): Look {
  const body = pick(BODIES.filter((b) => !bodyLock(unlocks, b.id)));
  const look: Look = { v: 2, body: body.id, options: {}, colors: {} };
  for (const option of body.options ?? []) {
    const extra = option.choices[0].id === "none";
    const open = option.choices.filter((c) => !choiceLock(unlocks, body.id, option.id, c.id));
    look.options[option.id] = extra && Math.random() < 0.5 ? "none" : pick(open).id;
  }
  for (const material of materialsOf(body)) {
    if (material.id !== "eyes" && Math.random() < 0.7) look.colors[material.id] = pick(BODY_COLORED.has(material.id) ? FUR_COLORS : CLOTH_COLORS)[1];
  }
  return look;
}

/**
 * The Look section of the character editor: the title (picked among the earned ones; the name is the username), the
 * character big, changing as things are picked (in sight while colours further down are picked); a row for the body
 * (each one of the user's drawings, whole), a row for each piece that body can change, and a colour row for each
 * material of what it has on, and under the title how it was earned. Locked pieces can be tried on, with what they wait for; a body not yet discovered is
 * only a grey silhouette called "???" with what unlocks it, without its rows and colours (their names would give it away). Save leaves
 * whatever is locked off. Seven quick taps on the character switch the hidden dev mode (everything unlocked) on or off.
 */
export function LookSection({ look, setLook, draft, set, username, unlocks, toggleDevMode }: SectionProps & { look: Look; setLook: (update: (look: Look) => Look) => void; username: string; unlocks: Unlocks; toggleDevMode: () => void }) {
  const body = bodyOf(look);
  const titles = earnedTitles(unlocks.progress);
  const title = shownTitle(draft.title, unlocks.progress);
  const locked = lockedIn(look, unlocks);
  const lockText = (reward: Reward | null) => (reward ? requirementOf(reward) : undefined);
  const undiscovered = Boolean(bodyLock(unlocks, body.id));
  const tap = useSevenTaps(toggleDevMode);

  // A colour picked on one body stays for the next where it has the same material ("fur", "eyes"), and choices stay
  // for going back; what the body doesn't have is dropped when saved.
  const setBody = (id: string) => setLook((l) => ({ ...l, body: id }));
  const setOption = (option: string, choice: string) => setLook((l) => ({ ...l, options: { ...l.options, [option]: choice } }));
  const setColor = (material: string, hex: string | null) =>
    setLook((l) => {
      const colors = { ...l.colors };
      if (hex) colors[material] = hex.toUpperCase();
      else delete colors[material];
      return { ...l, colors };
    });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start" data-editor-section="look">
      <div className="sticky top-0 z-10 flex w-full flex-none flex-col items-center gap-2 bg-stone-100 pb-2 sm:top-3 sm:w-auto sm:bg-transparent sm:pb-0 dark:bg-stone-950 sm:dark:bg-transparent">
        <div className="character-stage" onClick={tap}>
          <CharacterSprite look={look} scale={3} cover={body.toEdge} silhouette={undiscovered} label={undiscovered ? "A body not yet discovered" : `${username}, as customized`} />
        </div>
        <button type="button" className="nes-btn btn-small" onClick={() => setLook(() => randomLook(unlocks))} data-creator-random>
          Random
        </button>
        {unlocks.devMode && (
          <p className="text-xs text-stone-500" data-dev-mode>
            dev mode
          </p>
        )}
      </div>
      <div className="w-full min-w-0 flex-1 space-y-4">
        <div className="space-y-1">
          <Stepper label="Title" name="title" options={titles} value={title.id} onChange={(id) => set({ title: id })} />
          <p className="text-xs text-stone-500" data-title-how>
            {title.how}
          </p>
          <p className="text-xs text-stone-500" data-title-count={titles.length}>
            {titles.length === 1 ? "1 title earned" : `${titles.length} titles earned`}
          </p>
        </div>
        <div className="space-y-2 border-t-2 border-stone-300 pt-3 dark:border-stone-700">
          <Stepper
            label="Body"
            name="body"
            options={BODIES.map((b) => ({ id: b.id, name: bodyLock(unlocks, b.id) ? "???" : b.name, locked: lockText(bodyLock(unlocks, b.id)) }))}
            value={body.id}
            onChange={setBody}
          />
          {!undiscovered &&
            (body.options ?? []).map((option) => (
              <Stepper
                key={option.id}
                label={option.name}
                name={option.id}
                options={option.choices.map((c) => ({ ...c, locked: lockText(choiceLock(unlocks, body.id, option.id, c.id)) }))}
                value={choiceOf(look, option).id}
                onChange={(id) => setOption(option.id, id)}
              />
            ))}
          {locked.length > 0 && !undiscovered && (
            <p className="text-xs text-amber-700 dark:text-amber-400" data-locked-note>
              <LockGlyph /> Only tried on, not kept when saved: {locked.map((r) => `${r.name} (${requirementOf(r)})`).join(", ")}
            </p>
          )}
        </div>
        <div className="grid gap-3 border-t-2 border-stone-300 pt-3 sm:grid-cols-2 dark:border-stone-700">
          {!undiscovered &&
            materialsWorn(body, look).map((material) => (
              <ColorRow
                key={material.id}
                name={material.id}
                label={material.name}
                current={look.colors[material.id] ?? material.hexes[0]}
                isPicked={Boolean(look.colors[material.id])}
                colors={BODY_COLORED.has(material.id) ? FUR_COLORS : CLOTH_COLORS}
                onPick={(hex) => setColor(material.id, hex)}
                onReset={() => setColor(material.id, null)}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
