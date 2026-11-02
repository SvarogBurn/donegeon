import { CHEER_LINES, type CheerLine } from "../../../../shared/constants";

/** The lines a cheer can say, to pick one: for a friend in their ⋯, and for everyone. */
export function CheerLines({ onPick }: { onPick: (line: CheerLine) => void }) {
  return (
    <ul data-cheer-lines>
      {CHEER_LINES.map((line) => (
        <li key={line}>
          <button type="button" className="btn-quiet w-full text-left" onClick={() => onPick(line)} data-cheer-line={line}>
            {line}
          </button>
        </li>
      ))}
    </ul>
  );
}
