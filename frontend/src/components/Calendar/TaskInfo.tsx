import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { localDate } from "../../api/client";
import { useLists, useTaskTrees } from "../../hooks/useTasks";
import { daysBetween, formatDay, formatFullDay, formatPace } from "../../lib/dates";
import { firstLine } from "../../lib/calendar";
import { repeatLabel } from "../../lib/repeat";
import { findTaskRow, pathIdsTo, showOnPage } from "../../lib/showOnPage";
import { ValueChip } from "../Points/ValueChip";
import type { Info } from "./calendarData";
import { RichText } from "../RichText";

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 flex-none text-stone-500">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
    </div>
  );
}

/**
 * What a click on a task in the calendar opens: more about it (where it is, its deadline or schedule, its
 * subtasks, what it is worth), and the way on: to the task's own page if it is a big one, and to its place
 * in its list. Something done on a day gone by leads to the Done page once the lists no longer show it.
 */
export function TaskInfo({ info, onClose }: { info: Info; onClose: () => void }) {
  const navigate = useNavigate();
  const { data: lists = [] } = useLists();
  const { data: trees = [] } = useTaskTrees();
  const today = localDate();
  const id = "plan" in info ? info.plan.node.id : info.done.id;
  // Null once the Tasks page no longer has it: ticked long enough ago to be on the Done page only.
  const pathIds = pathIdsTo(trees, id);

  function showInList() {
    navigate("/");
    showOnPage((isLast) => findTaskRow(id, pathIds ?? [], isLast));
  }

  let title: string;
  let rows: ReactNode;
  let pageId: string | null = null;
  let place = "list";
  if ("plan" in info) {
    const { node, path, listId, kind } = info.plan;
    const list = lists.find((other) => other.id === listId);
    const left = node.deadlineDate ? daysBetween(today, node.deadlineDate) : 0;
    title = node.title;
    pageId = info.plan.pageId;
    if (!listId) place = "Today";
    rows = (
      <>
        {path.length > 0 && <Row label="Part of">{path.join(" › ")}</Row>}
        <Row label="List">{list ? list.name : "None: it lives in Today"}</Row>
        {node.deadlineDate && (
          <Row label="Deadline">
            {formatFullDay(node.deadlineDate)} · {node.deadlineType === "soft" ? "soft" : "hard"} ·{" "}
            {node.isComplete ? "done" : left === 0 ? "today" : left > 0 ? `in ${days(left)}` : <span className="text-red-600">{days(-left)} overdue</span>}
          </Row>
        )}
        {node.pace && node.pace.remaining > 0 && node.descendantCount > 0 && (
          <Row label="Pace">
            {node.pace.remaining} left{node.pace.perDay !== null && ` · ${formatPace(node.pace.perDay)} per day`}
          </Row>
        )}
        {node.repeatEvery && node.nextDue && (
          <Row label="Repeats">
            {repeatLabel(node)} · {node.nextDue <= today ? (node.nextDue === today ? "due today" : `due since ${formatDay(node.nextDue)}`) : `next ${formatFullDay(node.nextDue)}`}
            {kind === "round" && ` · on ${formatDay(info.day)} if kept to`}
          </Row>
        )}
        {node.todaySince && <Row label="Today">marked for Today{node.todaySince < today && ` since ${formatDay(node.todaySince)}`}</Row>}
        {node.descendantCount > 0 && (
          <Row label="Subtasks">
            {node.descendantDoneCount}/{node.descendantCount} done
            <ul className="mt-1 space-y-0.5 text-stone-500">
              {node.children.map((child) => (
                <li key={child.id} className={child.isComplete ? "line-through" : ""}>
                  <span className="glyph !text-xs">{child.isComplete ? "✓" : "○"}</span> <RichText text={firstLine(child.title)} />
                </li>
              ))}
            </ul>
          </Row>
        )}
        {node.value > 0 && (
          <Row label="Worth">
            <ValueChip node={node} />
          </Row>
        )}
        {node.notes && <Row label="Notes">{node.notes}</Row>}
        {node.isComplete && node.completedOn && <Row label="Done">{formatFullDay(node.completedOn)}</Row>}
      </>
    );
  } else {
    const { done } = info;
    title = done.title;
    rows = (
      <>
        {done.path.length > 0 && <Row label="Part of">{done.path.join(" › ")}</Row>}
        <Row label="Done">
          {formatFullDay(info.day)}
          {done.times && done.times > 1 && ` · ${done.times} times`}
        </Row>
      </>
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="card max-h-full w-96 max-w-full space-y-3 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Task" data-task-info={id}>
        <h3 className="text-sm break-words whitespace-pre-line"><RichText text={title} /></h3>
        <dl className="space-y-1.5 text-xs">{rows}</dl>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="nes-btn btn-small" onClick={onClose}>
            Close
          </button>
          {pathIds ? (
            <button type="button" className={`nes-btn btn-small ${pageId ? "" : "is-primary"}`} onClick={showInList} autoFocus={!pageId}>
              Show in {place}
            </button>
          ) : (
            <button type="button" className="nes-btn is-primary btn-small" onClick={() => navigate("/done")} autoFocus>
              Open Done
            </button>
          )}
          {pageId && (
            <button type="button" className="nes-btn is-primary btn-small" onClick={() => navigate(`/tasks/${pageId}`)} autoFocus>
              Open task
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
