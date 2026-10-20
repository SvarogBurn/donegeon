import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useAddTask } from "../hooks/tasks";
import { ShortSyntaxEditor } from "./TaskTree/ShortSyntaxEditor";

/**
 * The installed app's "+": a field over the bottom bar for a task just for today. Enter adds it to the Today box (in
 * no list, as if typed there; offline too) and stays open for the next one. Shortcuts work as anywhere (#tag, @date,
 * /list puts it in a list instead). Escape, × or a tap outside closes it.
 */
export function QuickAdd({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [added, setAdded] = useState(0);
  const createTask = useAddTask();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      // The "+" itself toggles it.
      if (!ref.current?.contains(e.target as Node) && !(e.target as Element).closest?.("[data-quick-add]")) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") return title ? setTitle("") : onClose();
    if (e.key !== "Enter" || e.shiftKey || !title.trim()) return;
    const submitted = title;
    setTitle("");
    setAdded((n) => n + 1);
    createTask.mutate({ text: submitted }, { onError: () => setTitle(submitted) });
  }

  return (
    <div ref={ref} className="card fixed inset-x-2 bottom-[calc(var(--bar-h,5rem)+2rem)] z-50 mx-auto max-w-xl space-y-2 !p-3 shadow-lg" role="dialog" aria-label="New task for today">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-pixel text-[10px]">New task for today</h2>
        <button type="button" className="btn-quiet px-1 text-base leading-none" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <ShortSyntaxEditor
        editorId="quick-add"
        value={title}
        onChange={setTitle}
        onKeyDown={onKeyDown}
        placeholder="Type it, then press Enter"
        aria-label="New task for today"
        autoFocus
        className="border border-dashed border-stone-300 !py-2 dark:border-stone-700"
      />
      <p className="text-xs text-stone-500">{added > 0 ? `Added ${added} to Today. Enter adds another.` : "It goes in the Today box. #tag @date /list work too."}</p>
      {createTask.error && <p className="text-xs text-red-600">{createTask.error.message}</p>}
    </div>
  );
}
