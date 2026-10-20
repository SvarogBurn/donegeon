import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { localDate } from "../../lib/clock";
import { useTaskTrees } from "../../hooks/tasks";
import { formatDay } from "../../lib/dates";
import { passedDeadlines, readDismissed, saveDismissed, type PassedDeadline } from "../../lib/notifications";
import { PretendNotice } from "../layout/Clock";
import { RichText } from "../RichText";
import { PostponeDeadline } from "./PostponeDeadline";

const ago = (n: number) => (n === 1 ? "yesterday" : `${n} days ago`);

/**
 * The bell: a count of what wants an answer, and under it the notifications. For now these are deadlines whose day
 * is over with the task still open; a tap on one asks for a new deadline. Dismissed ones stay away on this device
 * until that deadline is moved and passes again. `inStrip` = the installed app's top strip (the list opens below);
 * otherwise the browser's task bar along the bottom (it opens above), where the bell is teeny and `children` places it
 * (the clock puts it beside the time), and a click anywhere on them opens the list.
 */
export function Bell({
  inStrip = false,
  onOpenChange,
  children,
}: {
  inStrip?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  children?: (bell: ReactNode) => ReactNode;
}) {
  const { data: trees = [] } = useTaskTrees();
  const today = localDate();
  const passed = useMemo(() => passedDeadlines(trees, today), [trees, today]);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [isOpen, setIsOpen] = useState(false);
  const [asking, setAsking] = useState<PassedDeadline | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const shown = passed.filter((item) => !dismissed.has(item.key));

  useEffect(() => onOpenChange?.(isOpen || asking !== null), [isOpen, asking, onOpenChange]);
  // Only once the tasks are in: before that every dismissal would look out of date.
  useEffect(() => {
    if (trees.length) saveDismissed(dismissed, passed);
  }, [dismissed, passed, trees.length]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      // The bell itself toggles it.
      if (!panel.current?.contains(e.target as Node) && !(e.target as Element).closest?.("[data-bell]")) setIsOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && setIsOpen(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const dismiss = (keys: string[]) => setDismissed((old) => new Set([...old, ...keys]));
  const label = shown.length ? `Notifications: ${shown.length} new` : "Notifications";
  // The strip's bell is small: the count sits off its corner rather than over it.
  const badge = shown.length > 0 && (
    <span className="absolute -top-1 -right-2.5 min-w-3 bg-red-600 px-0.5 text-center font-pixel text-[8px] leading-3 text-white tabular-nums" aria-hidden>
      {shown.length > 9 ? "9+" : shown.length}
    </span>
  );

  return (
    <>
      {inStrip ? (
        <button type="button" className="relative mr-1.5 flex-none p-0.5" data-bell aria-label={label} aria-expanded={isOpen} title="Notifications" onClick={() => setIsOpen(!isOpen)}>
          <span className="bar-glyph bar-glyph-bell" aria-hidden />
          {badge}
        </button>
      ) : (
        <button
          type="button"
          className={`block cursor-pointer py-0.5 ${isOpen ? "bg-stone-200/80 dark:bg-stone-800/80" : "hover:bg-stone-200/50 dark:hover:bg-stone-800/50"}`}
          data-bell
          aria-label={label}
          aria-expanded={isOpen}
          title={shown.length ? `Notifications: ${shown.length} new` : "Notifications"}
          onClick={() => setIsOpen(!isOpen)}
        >
          {children?.(
            // The teeny bell has no room for a number: a red dot says there is something new.
            <span className="relative flex-none">
              <span className="bar-glyph bar-glyph-bell-tiny" aria-hidden />
              {shown.length > 0 && <span className="absolute -top-0.5 -right-1 size-1 bg-red-600" data-bell-dot aria-hidden />}
            </span>,
          )}
        </button>
      )}

      {isOpen && (
        <div
          ref={panel}
          className={`card fixed right-2 z-50 w-80 max-w-[calc(100vw-1rem)] !p-0 shadow-lg ${inStrip ? "top-[calc(var(--top-h,3rem)+0.25rem)]" : "bottom-[calc(var(--bar-h,5rem)+0.25rem)]"}`}
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex items-center justify-between gap-2 border-b border-stone-200 px-3 py-2 dark:border-stone-700">
            <h2 className="font-pixel text-[10px]">Notifications</h2>
            {shown.length > 1 && (
              <button type="button" className="btn-quiet text-xs" onClick={() => dismiss(shown.map((item) => item.key))}>
                Dismiss all
              </button>
            )}
          </div>
          {shown.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-stone-500">Nothing new. A deadline whose day has passed shows up here.</p>
          ) : (
            <ul className="max-h-[60svh] divide-y divide-stone-200 overflow-y-auto dark:divide-stone-700">
              {shown.map((item) => (
                <li key={item.key} className="flex items-start gap-1 hover:bg-stone-100 dark:hover:bg-stone-800">
                  <button
                    type="button"
                    className="min-w-0 flex-1 px-3 py-2 text-left"
                    data-notification={item.node.id}
                    onClick={() => {
                      setIsOpen(false);
                      setAsking(item);
                    }}
                  >
                    <span className="flex items-center gap-1.5 font-pixel text-[8px] text-red-600">
                      <span className="size-1.5 flex-none bg-red-600" aria-hidden />
                      Passed deadline · {formatDay(item.node.deadlineDate!)}, {ago(item.daysLate)}
                    </span>
                    <span className="mt-1 block truncate text-sm">
                      <RichText text={item.node.title.split("\n")[0]} />
                    </span>
                    {item.path.length > 0 && <span className="block truncate text-xs text-stone-500">in {item.path.join(" › ")}</span>}
                    <span className="mt-0.5 block text-xs text-stone-500">Tap to pick a new deadline</span>
                  </button>
                  <button type="button" className="btn-quiet px-2 py-2 text-base leading-none" aria-label="Dismiss" title="Dismiss" onClick={() => dismiss([item.key])}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <PretendNotice />
        </div>
      )}
      {asking && <PostponeDeadline item={asking} onDismiss={() => dismiss([asking.key])} onClose={() => setAsking(null)} />}
    </>
  );
}
