import { useState, type KeyboardEvent } from "react";
import { useCreateTask } from "../../hooks/useTasks";
import { TitleEditor } from "./TitleEditor";
import { useTree } from "./TreeContext";

interface Props {
  /** Where new tasks go: the top level of a list, or under a task (on its own page). */
  listId?: string;
  parentId?: string;
  placeholder: string;
}

/** The always-present field at the bottom of a list or task page: Enter adds a task and stays ready for the next. */
export function TaskForm({ listId, parentId, placeholder }: Props) {
  const [title, setTitle] = useState("");
  const createTask = useCreateTask();
  const { newTaskLabels } = useTree();

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") setTitle("");
    if (e.key !== "Enter" || e.shiftKey || !title.trim() || createTask.isPending) return;
    const submitted = title;
    setTitle("");
    createTask.mutate({ title: submitted, listId, parentId, ...newTaskLabels }, { onError: () => setTitle(submitted) });
  }

  return (
    <div>
      <TitleEditor
        editorId={`add:${listId ?? parentId}`}
        value={title}
        onChange={setTitle}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        className="border border-dashed border-stone-300 !py-2 dark:border-stone-700"
      />
      {createTask.error && <p className="mt-1 text-xs text-red-600">{createTask.error.message}</p>}
    </div>
  );
}
