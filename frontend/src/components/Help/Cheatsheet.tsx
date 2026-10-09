import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router";
import { DATE_HELP, SYNTAX_HELP } from "../../lib/shortSyntax";
import { RichText } from "../RichText";
import { TileFrame } from "../Tiles/TileFrame";

/** The keys that do something in a task: [key, what it does]. */
const KEYS: [key: string, does: string][] = [
  ["Enter", "New task below, at the same depth. On an empty new row: close it."],
  ["Ctrl+Enter", "New subtask."],
  ["Shift+Enter", "New line inside the title."],
  ["Ctrl+B / I / U", "Bold, italic, underline: around the selected words."],
  ["↑ / ↓", "Move between tasks."],
  ["Alt+↑ / Alt+↓", "Reorder among its siblings."],
  ["Delete", "At the end of a title: delete the task and its subtasks."],
  ["Ctrl+Z", "Within 10 seconds of a delete: bring it back."],
  ["Esc", "Discard the new row, or undo the edit in progress."],
];

/** The markup of a title: [what to type, how it looks, the key that puts it on]. */
const STYLES: [type: string, shows: string, key?: string][] = [
  ["**bold**", "**bold**", "Ctrl+B"],
  ["*italic*", "*italic*", "Ctrl+I"],
  ["__underline__", "__underline__", "Ctrl+U"],
  ["==highlight==", "==highlight=="],
  ["~~crossed out~~", "~~crossed out~~"],
];

const HEADING = "font-pixel text-xs text-stone-500";
const KEY = "border-2 border-stone-300 bg-stone-100 px-1.5 py-0.5 text-sm whitespace-nowrap text-stone-900 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100";

/** One line: what to type or press, and under it (beside it on a wide screen) what that does. */
function Line({ keys, does, example }: { keys: string; does: ReactNode; example?: string }) {
  return (
    <li className="grid gap-x-3 gap-y-1 py-1.5 sm:grid-cols-[9rem_1fr]">
      <span>
        <kbd className={KEY}>{keys}</kbd>
      </span>
      <span className="text-xs">
        {does}
        {example && <span className="mt-0.5 block text-stone-500">{example}</span>}
      </span>
    </li>
  );
}

/** The cheat sheet on the user's page: the shortcuts that can be typed into a new task, the markup of a title, and the keys that work in a task. */
export function Cheatsheet() {
  const { hash } = useLocation();
  // The "All shortcuts" link under an add field's dropdown comes straight here.
  useEffect(() => {
    if (hash === "#shortcuts") document.getElementById("shortcuts")?.scrollIntoView({ block: "start" });
  }, [hash]);

  return (
    <TileFrame id="shortcuts" title="Cheat sheet" aria-label="Cheat sheet" data-cheatsheet>
      <h3 className={HEADING}>While typing a new task</h3>
      <p className="text-xs text-stone-500">
        Type these anywhere in the title of a task you are adding. They are taken out of the title and set on the task; the chips under the
        field show what it will get.
      </p>
      <ul className="divide-y-2 divide-stone-200 dark:divide-stone-800" data-syntax-help>
        {SYNTAX_HELP.map(([type, does, example]) => (
          <Line key={type} keys={type} does={does} example={example} />
        ))}
      </ul>
      <p className="text-xs text-stone-500">Dates: {DATE_HELP}</p>
      <p className="text-xs text-stone-500">
        A shortcut counts at the start of a word only, so <i>bob@example.com</i> and <i>and/or</i> are left alone. Deadlines are for main
        tasks and their direct subtasks; lists and repeats for main tasks.
      </p>
      <h3 className={`border-t-2 border-stone-300 pt-3 dark:border-stone-700 ${HEADING}`}>Styling a title</h3>
      <p className="text-xs text-stone-500">
        In any task's title, new or old. The markers show while you type in the title and are hidden once you leave it. Styles can sit
        inside one another, and a backslash in front of a marker keeps it as text.
      </p>
      <ul className="divide-y-2 divide-stone-200 dark:divide-stone-800" data-markup-help>
        {STYLES.map(([type, shows, key]) => (
          <Line key={type} keys={type} does={<RichText text={shows} />} example={key && `or select the words and press ${key}`} />
        ))}
      </ul>
      <h3 className={`border-t-2 border-stone-300 pt-3 dark:border-stone-700 ${HEADING}`}>Keys in a task</h3>
      <ul className="divide-y-2 divide-stone-200 dark:divide-stone-800">
        {KEYS.map(([key, does]) => (
          <Line key={key} keys={key} does={does} />
        ))}
      </ul>
    </TileFrame>
  );
}
