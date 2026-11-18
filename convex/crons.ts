import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "close household goal savings days",
  { hours: 1 },
  internal.savingsMaintenance.closeEligibleDays,
  { cursor: null },
);

export default crons;
