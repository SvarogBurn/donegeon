import { useEffect, useState, type FormEvent } from "react";
import { useCreateList, useRenameList } from "../../hooks/useTasks";
import { filterTree, isFiltering, type LabelFilter } from "../../lib/labels";
import type { List, TaskTreeNode } from "../../types";
import { TaskForm } from "../TaskTree/TaskForm";
import { TaskTree } from "../TaskTree/TaskNode";
import { TreeProvider, useTree } from "../TaskTree/TreeContext";
import { TreeError, UndoBar } from "../TaskTree/TreeStatus";

/**
 * One of the user's lists: a renameable folder of main tasks, and a drop zone
 * for dragged tasks. Deleting it (× or the Delete key in its name) takes its
 * tasks along; Ctrl+Z brings everything back.
 */
function ListCard({ list, tasks }: { list: List; tasks: TaskTreeNode[] }) {
  const rename = useRenameList();
  const { dropTarget, deleteList } = useTree();
  const [name, setName] = useState(list.name);
  useEffect(() => setName(list.name), [list.name]);
  const isDropTarget = dropTarget?.kind === "list" && dropTarget.listId === list.id;

  function saveName() {
    const next = name.trim();
    if (!next) setName(list.name);
    else if (next !== list.name) rename.mutate({ id: list.id, name: next });
  }

  return (
    <section data-drop-list={list.id} className={`card space-y-3 ${isDropTarget ? "ring-2 ring-emerald-600" : ""}`}>
      <header className="flex items-center justify-between gap-2">
        <input
          className="min-w-0 flex-1 rounded bg-transparent px-1 font-semibold outline-none focus:ring-2 focus:ring-emerald-600/30"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setName(list.name);
            // Same rule as tasks: with the caret at the end, Delete removes the whole thing.
            const el = e.currentTarget;
            const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
            if (e.key === "Delete" && atEnd && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
              e.preventDefault();
              deleteList(list);
            }
          }}
          aria-label="List name"
          maxLength={200}
        />
        <button
          type="button"
          className="btn-quiet shrink-0 text-lg leading-none"
          aria-label={`Delete list "${list.name}"`}
          title="Delete this list and its tasks (Ctrl+Z to undo)"
          onClick={() => deleteList(list)}
        >
          ×
        </button>
      </header>
      {rename.error && <p className="text-xs text-red-600">{rename.error.message}</p>}
      <TaskTree nodes={tasks} parentId={null} listId={list.id} />
      <TaskForm listId={list.id} placeholder="Add a task, then press Enter" />
    </section>
  );
}

function ListForm() {
  const [name, setName] = useState("");
  const createList = useCreateList();

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || createList.isPending) return;
    createList.mutate(name, { onSuccess: () => setName("") });
  }

  return (
    <form onSubmit={submit}>
      <input
        className="input border-dashed"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New list, then press Enter"
        aria-label="New list name"
        enterKeyHint="done"
        maxLength={200}
      />
      {createList.error && <p className="mt-1 text-xs text-red-600">{createList.error.message}</p>}
    </form>
  );
}

interface Props {
  lists: List[];
  /** Top-level task trees; each is shown in its list. */
  tasks: TaskTreeNode[];
  /** Goals/tags picked above. While active, only matching tasks and the lists holding them are shown. */
  filter: LabelFilter;
}

export function ListBoard({ lists, tasks, filter }: Props) {
  const filtering = isFiltering(filter);
  const cards = lists
    .map((list) => ({ list, tasks: filterTree(tasks.filter((t) => t.listId === list.id), filter) }))
    .filter((card) => !filtering || card.tasks.length > 0);

  return (
    <TreeProvider tasks={tasks} newTaskLabels={filter}>
      <div className="space-y-4">
        <TreeError />
        {cards.map((card) => (
          <ListCard key={card.list.id} list={card.list} tasks={card.tasks} />
        ))}
        {filtering && cards.length === 0 && <p className="text-sm text-stone-500">No tasks match this filter.</p>}
        {!filtering && <ListForm />}
        <UndoBar />
      </div>
    </TreeProvider>
  );
}
