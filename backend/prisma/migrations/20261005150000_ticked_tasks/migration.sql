-- Where a ticked task goes in its list: under the open ones, nowhere (it stays put), or out of sight.
CREATE TYPE "TickedTasks" AS ENUM ('bottom', 'stay', 'hide');
ALTER TABLE "User" ADD COLUMN "tickedTasks" "TickedTasks" NOT NULL DEFAULT 'bottom';
