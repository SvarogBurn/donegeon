import { daysBetween } from "../../../../shared/dates";
import { useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useAddTask, useSyntaxContext } from "../../hooks/tasks";
import type { DoneItem, PlanItem } from "../../lib/calendar";
import { formatDay, formatFullDay } from "../../lib/dates";
import { parseShortSyntax } from "../../lib/shortSyntax";
import { readStored, writeStored } from "../../lib/storage";
import type { List } from "../../types";
import { ShortSyntaxEditor, SyntaxChips } from "../TaskTree/ShortSyntaxEditor";
import { TaskTree } from "../TaskTree/TaskNode";
import { DraftScope, useTree } from "../TaskTree/TreeContext";
import { TileControlsContext, TileFrame } from "../Tiles/TileFrame";
import { isOpen, LIST_KEY, type Info } from "./calendarData";
import { DoneList } from "./DaysBox";

/** A task with a deadline on the day: its row as in its list, subtasks under it. Above it, the tasks it sits under. */
function DeadlineDayRow({ item }: { item: PlanItem }) {
  const { node, kind, path } = item;
  return (
    <li data-plan-item={node.id} data-plan-kind={kind}>
      {(path.length > 0 || kind === "overdue") && (
        <p className="flex flex-wrap items-center gap-x-2 px-1 pt-1 text-xs text-stone-500">
          {path.length > 0 && <span className="min-w-0 truncate">{path.join(" › ")}</span>}
          {kind === "overdue" && <span className="text-red-600">overdue</span>}
        </p>
      )}
      <TaskTree nodes={[node]} parentId={node.parentId} listId={node.parentId ? null : node.listId} depth={path.length} />
    </li>
  );
}

/**
 * The field at the bottom, as a list's: Enter adds a task to `listId` with a hard deadline on the day and stays ready
 * for the next; Ctrl+Enter adds it and opens a row for its first subtask (`onSubtasks` with its id). Shortcuts typed
 * into it are set on the task. Esc clears it, or on an empty field closes the popup (`onClose`).
 */
function AddDeadline({ day, listId, onSubtasks, onClose }: { day: string; listId: string; onSubtasks: (taskId: string) => void; onClose: () => void }) {
  const createTask = useAddTask();
  const ctx = useSyntaxContext();
  const { newTaskLabels } = useTree();
  const [title, setTitle] = useState("");

  async function submit(withSubtasks: boolean) {
    const submitted = title.trim();
    setTitle("");
    writeStored(LIST_KEY, listId);
    try {
      const id = await createTask.add({ text: submitted, listId, deadlineDate: day, deadlineType: "hard", ...newTaskLabels });
      if (withSubtasks) onSubtasks(id);
    } catch {
      setTitle(submitted);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      if (title) setTitle("");
      else onClose();
    } else if (e.key === "Enter" && !e.shiftKey && title.trim()) {
      void submit(e.ctrlKey || e.metaKey);
    }
  }

  return (
    <div data-add-on={day}>
      <ShortSyntaxEditor
        autoFocus
        editorId={`add-${day}`}
        value={title}
        onChange={setTitle}
        onKeyDown={onKeyDown}
        placeholder="Add a task, then press Enter (Ctrl+Enter: its subtasks)"
        aria-label={`New task for ${formatDay(day, true)}`}
        className="border border-dashed border-stone-300 !py-2 dark:border-stone-700"
      />
      <SyntaxChips tokens={parseShortSyntax(title, ctx).tokens} className="mt-1" />
      {createTask.error && <p className="mt-1 text-xs text-red-600">{createTask.error.message}</p>}
    </div>
  );
}

/**
 * A day of the Deadlines tab opened up, as a box like a list's with the day on its band. Its tasks (a hard deadline on
 * the day, or overdue on today) are rows as in their lists, with their subtasks, written in with the lists' keys
 * (Enter, Ctrl+Enter, ↑ ↓, Alt+↑ ↓, Delete, Esc, shortcuts typed into a title). A row opened from them is the popup's
 * own (`DraftScope`); one opened below a task gets a hard deadline that day too. The field at the bottom adds to the
 * list picked on the band. Esc in a row is the row's; elsewhere it closes the popup, and a row being written in is
 * saved on closing, as it would be on leaving it in a list. A day gone by shows what was ticked off on it.
 */
export function DeadlineDayPopup({ day, today, plan, done, lists, onInfo, onClose }: {
  day: string;
  today: string;
  plan: PlanItem[];
  done: DoneItem[];
  lists: List[];
  onInfo: (info: Info) => void;
  onClose: () => void;
}) {
  const tree = useTree();
  const createTask = useAddTask();
  const scope = `day:${day}`;
  const deadlines = new Map(plan.map((item) => [item.node.id, { date: day, type: "hard" as const }]));
  const isPast = day < today;
  const taskLists = lists.filter((list) => list.kind === "task");
  const [listId, setListId] = useState(() => {
    const last = readStored(LIST_KEY);
    return last && taskLists.some((list) => list.id === last) ? last : taskLists[0]?.id;
  });
  const away = daysBetween(today, day);
  const canAdd = !isPast && listId !== undefined;

  function close() {
    if (tree.draft?.scope === scope) {
      const text = tree.draftText.trim();
      if (text) createTask.mutate({ text, ...tree.draftPlacement(), ...tree.newTaskLabels });
      tree.setDraft(null);
      tree.setDraftText("");
    }
    onClose();
  }

  const title = (
    <>
      {formatDay(day, true)}
      {day.slice(0, 4) !== today.slice(0, 4) && `/${day.slice(0, 4)}`}
      <span className="text-[0.8em]" data-day-summary>
        {" · "}
        {away === 0 ? "Today · " : away === 1 ? "Tomorrow · " : away === -1 ? "Yesterday · " : ""}
        {isPast ? `${done.length} done` : `${plan.filter(isOpen).length} to do`}
      </span>
    </>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && close()}
      onKeyDown={(e) => e.key === "Escape" && !e.defaultPrevented && !(e.target as Element).closest("textarea") && close()}
    >
      <div className="max-h-full w-[36rem] max-w-full overflow-y-auto" role="dialog" aria-modal="true" aria-label={formatFullDay(day)} data-day-popup={day}>
        {/* The Month box's pin and tab button are not this box's. */}
        <TileControlsContext.Provider value={null}>
          <TileFrame
            title={title}
            actions={
              <>
                {canAdd && (
                  <label className="band-pick" title="The list a new task goes in">
                    in
                    <select value={listId} onChange={(e) => setListId(e.target.value)} aria-label="The list a new task goes in">
                      {taskLists.map((list) => (
                        <option key={list.id} value={list.id}>
                          {list.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button type="button" className="tile-button tile-button-x" aria-label="Close" title="Close (Esc)" onClick={close} autoFocus={!canAdd} />
              </>
            }
          >
            {isPast ? (
              done.length === 0 ? <p className="text-xs text-stone-500">Nothing ticked off</p> : <DoneList day={day} done={done} isWhole onInfo={onInfo} />
            ) : (
              <DraftScope.Provider value={{ scope, deadlines }}>
                {plan.length > 0 && (
                  <ul>
                    {plan.map((item) => (
                      <DeadlineDayRow key={item.node.id} item={item} />
                    ))}
                  </ul>
                )}
                {canAdd && <AddDeadline day={day} listId={listId} onSubtasks={(taskId) => tree.setDraft({ parentId: taskId, listId: null, afterId: null, scope })} onClose={close} />}
              </DraftScope.Provider>
            )}
          </TileFrame>
        </TileControlsContext.Provider>
      </div>
    </div>,
    document.body,
  );
}
