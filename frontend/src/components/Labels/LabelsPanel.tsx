import { useState, type FormEvent } from "react";

interface Props {
  title: string;
  /** Singular, lower case: "goal" or "tag". */
  noun: string;
  items: { id: string; name: string }[];
  /** How many tasks carry each item. */
  counts: Map<string, number>;
  /** Items currently used as a filter. */
  selected: string[];
  onToggle: (id: string) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
  isBusy: boolean;
  error: Error | null;
}

/**
 * A box of the user's goals (or tags), separate from the lists. Empty until
 * they add some. Clicking one filters the lists below to tasks carrying it;
 * it is put on a task from that task's "⋯" menu.
 */
export function LabelsPanel({ title, noun, items, counts, selected, onToggle, onCreate, onDelete, isBusy, error }: Props) {
  const [name, setName] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || isBusy) return;
    onCreate(name.trim());
    setName("");
  }

  return (
    <section className="card space-y-3" aria-label={title}>
      <h2 className="font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-stone-500">
          No {noun}s yet. Add one, put it on tasks from their ⋯ menu, then click it here to filter.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => {
            const isSelected = selected.includes(item.id);
            return (
              <li
                key={item.id}
                className={`flex items-center rounded-full text-sm ${isSelected ? "bg-emerald-700 text-white" : "bg-stone-200 dark:bg-stone-700"}`}
              >
                <button
                  type="button"
                  className="flex items-center gap-1.5 py-1 pr-1 pl-3"
                  aria-pressed={isSelected}
                  title={isSelected ? "Stop filtering by this" : `Show only tasks with this ${noun}`}
                  onClick={() => onToggle(item.id)}
                >
                  <span className="max-w-48 truncate">{item.name}</span>
                  <span className="text-xs tabular-nums opacity-70">{counts.get(item.id) ?? 0}</span>
                </button>
                <button
                  type="button"
                  className="rounded-full px-2 py-1 leading-none opacity-60 hover:opacity-100"
                  aria-label={`Delete ${noun} "${item.name}"`}
                  title={`Delete this ${noun} (its tasks stay)`}
                  disabled={isBusy}
                  onClick={() => onDelete(item.id)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={submit}>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`New ${noun}, then press Enter`}
          aria-label={`New ${noun} name`}
          enterKeyHint="done"
          maxLength={100}
        />
      </form>
      {error && <p className="text-xs text-red-600">{error.message}</p>}
    </section>
  );
}
