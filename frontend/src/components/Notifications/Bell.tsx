import { daysBetween } from "../../../../shared/dates";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { appNow, localDate } from "../../lib/clock";
import { usePressTask, useTaskTrees, useToggleTask } from "../../hooks/tasks";
import { useDeadlineToday, useNotifySettings, useTickedTasks } from "../../hooks/useAuth";
import { formatDay } from "../../lib/dates";
import { leftUndone, passedDeadlines, readDismissed, saveDismissed, type LeftUndone, type PassedDeadline } from "../../lib/notifications";
import { dueToday, findTask, type Planned } from "../../lib/notifySchedule";
import { markNewsSeen, useUnseenNews } from "../../lib/newsSeen";
import { newId } from "../../lib/offline/changes";
import { PretendNotice } from "../layout/Clock";
import { RichText } from "../RichText";
import { hasHome, LeftUndoneTask, useDropLeftUndone } from "./LeftUndoneTask";
import { PostponeDeadline } from "./PostponeDeadline";

const ago = (n: number) => (n === 1 ? "yesterday" : `${n} days ago`);

/** The colour of each of today's messages in the list: a deadline coming is amber, a reminder blue. */
const KIND_COLORS: Partial<Record<Planned["kind"], string>> = {
  reminder: "text-sky-700 dark:text-sky-400",
  deadline: "text-amber-700 dark:text-amber-400",
};
const timeOf = (at: Date) => `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;

/** The app's moment, again every minute: today's messages come into the bell at their hour. */
function useMinute() {
  const [now, setNow] = useState(appNow);
  useEffect(() => {
    const timer = setInterval(() => setNow(appNow()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * The bell: a count of what is in it, and under it the notifications. Unless the user chose only what needs an
 * answer (`bell: "actions"`), today's messages once their hour has come (the reminders and the deadline notices, the
 * ones pushed if push is on), a tap opening their page. Then tasks left undone in Today or Week on a day gone by
 * (nothing is carried on to the next day by itself), a tap asking when to do them, × dropping them (they stay in their
 * list); and deadlines whose day is over with the task still open, a tap asking for a new deadline. Dismissed
 * messages and deadlines stay away on this device (a deadline until it is moved and passes again). First, while the
 * setting is on, the News articles not yet read on this device (lib/newsSeen), a tap opening the paper. `inStrip` = the installed app's top strip (the list opens below);
 * otherwise the browser's task bar along the bottom (it opens above), where the bell is teeny and `children` places it
 * (the clock puts it beside the time), and a click anywhere on them opens the list.
 */
export function Bell({
  inStrip = false,
  side = "right",
  onOpenChange,
  children,
}: {
  inStrip?: boolean;
  /** Which side of the screen the bell is on, so its list opens there: the clock can be dragged to either side of the task bar. */
  side?: "left" | "right";
  onOpenChange?: (isOpen: boolean) => void;
  children?: (bell: ReactNode) => ReactNode;
}) {
  const { data: trees = [] } = useTaskTrees();
  const today = localDate();
  const passed = useMemo(() => passedDeadlines(trees, today), [trees, today]);
  const undone = useMemo(() => leftUndone(trees, today), [trees, today]);
  const [settings] = useNotifySettings();
  const ticked = useTickedTasks();
  const deadlines = useDeadlineToday();
  const now = useMinute();
  const showsAll = settings.bell === "all";
  // Worked out even when not shown, so their dismissals are kept for when they are again.
  const messages = useMemo(() => dueToday(trees, today, now, settings, ticked, deadlines), [trees, today, now, settings, ticked, deadlines]);
  const navigate = useNavigate();
  const { mutate: toggle } = useToggleTask();
  const { mutate: press } = usePressTask();
  const drop = useDropLeftUndone();
  const [params, setParams] = useSearchParams();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [isOpen, setIsOpen] = useState(false);
  const [asking, setAsking] = useState<PassedDeadline | null>(null);
  const [askingUndone, setAskingUndone] = useState<LeftUndone | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const shown = passed.filter((item) => !dismissed.has(item.key));
  const shownMessages = showsAll ? messages.filter((item) => !dismissed.has(item.key)) : [];
  // New articles in the News, while the setting is on (whatever the bell shows otherwise): read or dismissed, they are gone.
  const unseenNews = useUnseenNews();
  const news = settings.news.on ? unseenNews : [];
  const count = news.length + shownMessages.length + shown.length + undone.length;

  useEffect(() => onOpenChange?.(isOpen || asking !== null || askingUndone !== null), [isOpen, asking, askingUndone, onOpenChange]);
  // Only once the tasks are in: before that every dismissal would look out of date.
  useEffect(() => {
    if (trees.length) saveDismissed(dismissed, [...passed, ...messages].map((item) => item.key));
  }, [dismissed, passed, messages, trees.length]);

  // A tap on a pushed "deadline passed" or "left undone" opens the app on /?bell=1: the list opens, where its new day is picked.
  useEffect(() => {
    if (params.get("bell") !== "1") return;
    setIsOpen(true);
    setParams((old) => {
      old.delete("bell");
      return old;
    }, { replace: true });
  }, [params, setParams]);

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
  const label = count ? `Notifications: ${count} new` : "Notifications";
  // The strip's bell is small: the count sits off its corner rather than over it.
  const badge = count > 0 && (
    <span className="absolute -top-1 -right-2.5 min-w-3 bg-red-600 px-0.5 text-center font-pixel text-[8px] leading-3 text-white tabular-nums" aria-hidden>
      {count > 9 ? "9+" : count}
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
          title={label}
          onClick={() => setIsOpen(!isOpen)}
        >
          {children?.(
            // The teeny bell has no room for a number: a red dot says there is something new.
            <span className="relative flex-none">
              <span className="bar-glyph bar-glyph-bell-tiny" aria-hidden />
              {count > 0 && <span className="absolute -top-0.5 -right-1 size-1 bg-red-600" data-bell-dot aria-hidden />}
            </span>,
          )}
        </button>
      )}

      {isOpen && (
        <div
          ref={panel}
          className={`card fixed ${side === "left" ? "left-2" : "right-2"} z-50 w-80 max-w-[calc(100vw-1rem)] !p-0 shadow-lg ${inStrip ? "top-[calc(var(--top-h,3rem)+0.25rem)]" : "bottom-[calc(var(--bar-h,5rem)+0.25rem)]"}`}
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex items-center justify-between gap-2 border-b border-stone-200 px-3 py-2 dark:border-stone-700">
            <h2 className="font-pixel text-[10px]">Notifications</h2>
            {count > 1 && (
              <button
                type="button"
                className="btn-quiet text-xs"
                onClick={() => {
                  dismiss([...shownMessages, ...shown].map((item) => item.key));
                  undone.filter(hasHome).forEach(drop);
                  if (news.length) markNewsSeen(news.map((feature) => feature.slug));
                }}
              >
                Dismiss all
              </button>
            )}
          </div>
          {count === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-stone-500">Nothing new. {showsAll && "Today's reminders, "}Tasks left undone and deadlines whose day has passed show up here.</p>
          ) : (
            <ul className="max-h-[60svh] divide-y divide-stone-200 overflow-y-auto dark:divide-stone-700">
              {news.map((feature) => (
                <li key={feature.slug} className="flex items-start gap-1 hover:bg-stone-100 dark:hover:bg-stone-800">
                  <button
                    type="button"
                    className="min-w-0 flex-1 px-3 py-2 text-left"
                    data-notification-news={feature.slug}
                    onClick={() => {
                      setIsOpen(false);
                      void navigate(`/news/${feature.issue}`);
                    }}
                  >
                    <span className="flex items-center gap-1.5 font-pixel text-[8px] text-red-700 dark:text-red-400">
                      <span className="size-1.5 flex-none bg-current" aria-hidden />
                      News · The Donegeon Post
                    </span>
                    <span className="mt-1 block truncate text-sm">{feature.title}</span>
                    <span className="mt-0.5 block text-xs text-stone-500">Tap to read it</span>
                  </button>
                  <button type="button" className="btn-quiet px-2 py-2 text-base leading-none" aria-label="Dismiss" title="Dismiss" onClick={() => markNewsSeen([feature.slug])}>
                    ×
                  </button>
                </li>
              ))}
              {shownMessages.map((item) => {
                const color = KIND_COLORS[item.kind] ?? KIND_COLORS.reminder;
                // A reminder on a task can be done from here, as from the notification (it works offline too).
                const task = item.params?.taskId ? findTask(trees, item.params.taskId)?.node : undefined;
                const waits = task !== undefined && !task.isPersistent && task.descendantDoneCount < task.descendantCount;
                return (
                  <li key={item.key} className="flex items-start gap-1 hover:bg-stone-100 dark:hover:bg-stone-800">
                    <button
                      type="button"
                      className="min-w-0 flex-1 px-3 py-2 text-left"
                      data-notification-message={item.key}
                      onClick={() => {
                        setIsOpen(false);
                        void navigate(item.url);
                      }}
                    >
                      <span className={`flex items-center gap-1.5 font-pixel text-[8px] ${color}`}>
                        <span className="size-1.5 flex-none bg-current" aria-hidden />
                        {item.label ?? "Reminder"} · {timeOf(item.sendAt)}
                      </span>
                      <span className="mt-1 block truncate text-sm">{item.title}</span>
                      {item.body && <span className="mt-0.5 line-clamp-3 block whitespace-pre-line text-xs text-stone-500">{item.body}</span>}
                    </button>
                    {task && (
                      <button
                        type="button"
                        className="btn-quiet px-1 py-2 text-xs"
                        disabled={waits}
                        title={waits ? "Tick its subtasks first" : task.isPersistent ? "Done it (once more)" : "Tick it"}
                        onClick={() => {
                          if (task.isPersistent) press({ id: task.id, completionId: newId() });
                          else toggle({ id: task.id, done: true });
                          dismiss([item.key]);
                        }}
                        data-notification-done={item.key}
                      >
                        Done
                      </button>
                    )}
                    <button type="button" className="btn-quiet px-2 py-2 text-base leading-none" aria-label="Dismiss" title="Dismiss" onClick={() => dismiss([item.key])}>
                      ×
                    </button>
                  </li>
                );
              })}
              {undone.map((item) => (
                <li key={item.key} className="flex items-start gap-1 hover:bg-stone-100 dark:hover:bg-stone-800">
                  <button
                    type="button"
                    className="min-w-0 flex-1 px-3 py-2 text-left"
                    data-left-undone={item.node.id}
                    onClick={() => {
                      setIsOpen(false);
                      setAskingUndone(item);
                    }}
                  >
                    <span className="flex items-center gap-1.5 font-pixel text-[8px] text-amber-700 dark:text-amber-400">
                      <span className="size-1.5 flex-none bg-current" aria-hidden />
                      Left undone · {formatDay(item.day)}, {ago(daysBetween(item.day, today))}
                    </span>
                    <span className="mt-1 block truncate text-sm">
                      <RichText text={item.node.title.split("\n")[0]} />
                    </span>
                    {item.path.length > 0 && <span className="block truncate text-xs text-stone-500">in {item.path.join(" › ")}</span>}
                    <span className="mt-0.5 block text-xs text-stone-500">Tap to pick when to do it</span>
                  </button>
                  {/* One in no list lives only in Today or Week: it is answered, not dropped. */}
                  {hasHome(item) && (
                    <button
                      type="button"
                      className="btn-quiet px-2 py-2 text-base leading-none"
                      aria-label="Drop it"
                      title="Drop it: out of Today and the Week, it stays in its list"
                      onClick={() => drop(item)}
                      data-drop-undone={item.node.id}
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
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
      {askingUndone && <LeftUndoneTask item={askingUndone} onClose={() => setAskingUndone(null)} />}
    </>
  );
}
