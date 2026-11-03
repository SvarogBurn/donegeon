import { useState } from "react";
import type { CheerLine } from "../../../../shared/constants";
import { linesToOffer } from "../../lib/people";

/** A few of the lines a cheer can say, to pick one: for a friend in their ⋯, and for everyone. They change each time it opens, and not under a poll. */
export function CheerLines({ onPick }: { onPick: (line: CheerLine) => void }) {
  const [lines] = useState(() => linesToOffer());
  return (
    <ul data-cheer-lines>
      {lines.map((line) => (
        <li key={line}>
          <button type="button" className="btn-quiet w-full text-left" onClick={() => onPick(line)} data-cheer-line={line}>
            {line}
          </button>
        </li>
      ))}
    </ul>
  );
}
