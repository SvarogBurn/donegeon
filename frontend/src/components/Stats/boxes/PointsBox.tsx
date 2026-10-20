import { balanceSeries, pointsFlow } from "../../../lib/stats";
import { SummaryCells } from "../../Countdown/sheet";
import { BalanceChart, Empty, Note } from "../charts";
import { StatFrame, type StatBox } from "./common";

/** Points earned and spent in the dates, and the balance day by day. */
export const PointsBox: StatBox = ({ stats: { view, points } }) => {
  const balance = balanceSeries(points, view.from, view.today);
  const flow = pointsFlow(points, view.from);
  return (
    <StatFrame title="Points" color="#e0b000" chart="#c98500" aria-label="Points over time">
      {balance.length === 0 ? (
        <Empty>No points booked yet.</Empty>
      ) : (
        <>
          <SummaryCells
            cells={[
              ["Earned", flow.earned],
              ["Spent", flow.spent],
            ]}
          />
          <BalanceChart series={balance} />
        </>
      )}
      <Note>
        Earned and spent in these dates, and the balance at the end of each day, from the newest bookings (300 at most). Only the
        Dates filter applies here.
      </Note>
    </StatFrame>
  );
};
