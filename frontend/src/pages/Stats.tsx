import { StatsPanel } from "../components/Stats/StatsPanel";

/** The Stats page, opened from its icon in the task bar: the stats filter and every box of the stats. */
export function StatsPage() {
  return (
    <div className="space-y-4">
      <StatsPanel />
    </div>
  );
}
