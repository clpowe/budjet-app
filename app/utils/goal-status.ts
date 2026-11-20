import type { Doc } from "../../convex/_generated/dataModel";

export type GoalStatus = Doc<"goals">["status"];

export type GoalStatusStrategy = {
  label: string;
  description: string;
  badgeClass: string;
  allowedActions: readonly GoalStatus[];
};

export const GOAL_STATUS_STRATEGIES = {
  idea: {
    label: "Considering",
    description: "Ideas the household is still deciding on.",
    badgeClass: "badge-info badge-outline",
    allowedActions: ["saving", "on_hold"],
  },
  saving: {
    label: "Plan for it",
    description: "Active goals funded in this queue order.",
    badgeClass: "badge-primary",
    allowedActions: ["idea", "on_hold"],
  },
  on_hold: {
    label: "Not now",
    description: "Goals saved for another time.",
    badgeClass: "badge-neutral badge-outline",
    allowedActions: ["idea", "saving"],
  },
  purchased: {
    label: "Bought",
    description: "Completed goals with linked purchase history.",
    badgeClass: "badge-success",
    allowedActions: [],
  },
} as const satisfies Record<GoalStatus, GoalStatusStrategy>;

export function getGoalStatusStrategy(status: GoalStatus): GoalStatusStrategy {
  return GOAL_STATUS_STRATEGIES[status];
}
