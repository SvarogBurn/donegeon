import { useTree } from "./TreeContext";

export function TreeError() {
  const { error } = useTree();
  return error && <p className="text-sm text-red-600">That didn't work: {error.message}</p>;
}

/** Shown for a few seconds after a delete; Ctrl+Z does the same as the button. */
export function UndoBar() {
  const { deleted, undoDelete } = useTree();
  const last = deleted.at(-1);
  if (!last) return null;
  const firstLine = last.title.split("\n")[0];

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-4 z-30 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-3 rounded-lg bg-stone-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-stone-100 dark:text-stone-900"
    >
      <span className="truncate">
        Deleted {last.kind === "list" && "list "}“{firstLine}”{deleted.length > 1 && ` and ${deleted.length - 1} more`}
      </span>
      <button type="button" className="shrink-0 font-semibold underline" onClick={undoDelete}>
        Undo (Ctrl+Z)
      </button>
    </div>
  );
}
