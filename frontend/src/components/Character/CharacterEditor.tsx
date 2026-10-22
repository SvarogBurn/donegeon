import { useState } from "react";
import { createPortal } from "react-dom";
import { useMe } from "../../hooks/useAuth";
import { useOnline } from "../../lib/offline/online";
import type { Look } from "../../lib/character/bodies";
import { normalizeLook, type Profile } from "../../lib/character/profile";
import { earnedTitles } from "../../lib/character/titles";
import { withoutLocked } from "../../lib/character/unlocks";
import { LookSection, useEscape } from "./LookSection";
import { SkillsSection, StatsSection } from "./StatsEditor";
import { useProfile } from "./useProfile";
import { useCharacterProgress } from "./useUnlocks";

const SECTIONS = [
  ["look", "Look"],
  ["stats", "Stats"],
  ["skills", "Skills"],
] as const;
type Section = (typeof SECTIONS)[number][0];

/**
 * Everything about the character, over the page, in three sections: its look (and title), the stats the
 * sheet shows, and its skills. Save keeps all of it but what is only tried on (locked); Cancel (or Esc) leaves the
 * character as it was. `trying` opens it with something new on.
 */
export function CharacterEditor({ onClose, trying }: { onClose: () => void; trying?: Look }) {
  const { profile, look: savedLook, save } = useProfile();
  const { progress, unlocks } = useCharacterProgress();
  const { user } = useMe();
  const online = useOnline();
  const [draft, setDraft] = useState<Profile>(profile);
  const [look, setLook] = useState<Look>(trying ?? savedLook);
  const [section, setSection] = useState<Section>("look");
  useEscape(onClose);
  const set = (changes: Partial<Profile>) => setDraft((d) => ({ ...d, ...changes }));

  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-stone-100 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] dark:bg-stone-950"
      role="dialog"
      aria-modal="true"
      aria-label="Edit the character"
      data-character-editor
    >
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="btn-quiet font-pixel text-[10px] whitespace-nowrap" onClick={onClose}>
            ‹ Cancel
          </button>
          <div className="flex" role="tablist" aria-label="Sections">
            {SECTIONS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={section === id}
                className={`border-b-4 px-2 py-1 font-pixel text-[10px] ${section === id ? "border-stone-900 dark:border-stone-100" : "border-transparent text-stone-500 hover:text-stone-900 dark:hover:text-stone-100"}`}
                onClick={() => setSection(id)}
                data-editor-tab={id}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="nes-btn is-primary btn-small"
            disabled={!online}
            title={online ? undefined : "Needs a connection"}
            onClick={() => {
              // A title no longer earned is let go (the highest rank shows); before the tasks are in, it is kept.
              const title = progress && !earnedTitles(progress).some((t) => t.id === draft.title) ? undefined : draft.title;
              save({ ...draft, title, look: normalizeLook(withoutLocked(look, unlocks)), custom: draft.custom.filter((c) => c.name.trim()) });
              onClose();
            }}
            data-editor-save
          >
            Save
          </button>
        </div>
        {section === "look" && <LookSection look={look} setLook={setLook} draft={draft} set={set} username={user?.username ?? ""} unlocks={unlocks} />}
        {section === "stats" && <StatsSection draft={draft} set={set} />}
        {section === "skills" && <SkillsSection draft={draft} set={set} />}
      </div>
    </div>,
    document.body,
  );
}
