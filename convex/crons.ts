import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "close household goal reserve days",
  { hours: 1 },
  internal.reserveMaintenance.closeEligibleDays,
  { cursor: null },
);

export default crons;
