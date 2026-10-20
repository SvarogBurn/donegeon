import { useEffect, useState } from "react";
import { usePoints, useSetTodayPoints } from "../../hooks/points";
import { pointsFieldWidth, typedPoints } from "../../lib/points";

/** What a task typed into Today or Week is worth unless it has its own amount: the same field as a list's "N each". */
export function TodayPoints() {
  const { data } = usePoints();
  const save = useSetTodayPoints();
  const current = data?.todayPoints;
  const [text, setText] = useState("");
  useEffect(() => setText(current === undefined ? "" : String(current)), [current]);
  if (current === undefined) return null;

  function done() {
    const next = text.trim() === "" ? null : Number(text);
    if (next === null) setText(String(current));
    else if (next !== current) save.mutate(next);
  }

  return (
    <label className="flex items-center gap-1">
      <input
        className="points-field tabular-nums"
        style={pointsFieldWidth(text)}
        type="text"
        inputMode="numeric"
        value={text}
        onChange={(e) => setText(typedPoints(e.target.value))}
        onBlur={done}
        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
        aria-label="Points per task added in Today"
        title="What a task typed into Today or Week is worth unless it has its own amount"
      />
      each
      {save.error && <span className="text-red-600">{save.error.message}</span>}
    </label>
  );
}
