import type { Doc } from "../../convex/_generated/dataModel";

export type GoalStatus = Doc<"goals">["status"];

export type GoalStatusStrategy = {
  label: string;
  /** Button text for moving a goal into this status. */
  actionLabel: string;
  description: string;
  badgeClass: string;
  allowedActions: readonly GoalStatus[];
};

export const GOAL_STATUS_STRATEGIES = {
  idea: {
    label: "Ideas",
    actionLabel: "Move to Ideas",
    description: "Ideas the household is still deciding on.",
    badgeClass: "badge-info badge-outline",
    allowedActions: ["saving", "on_hold"],
  },
  saving: {
    label: "Saving for",
    actionLabel: "Start saving",
    description: "Active goals funded in this queue order.",
    badgeClass: "badge-primary",
    allowedActions: ["idea", "on_hold"],
  },
  on_hold: {
    label: "On hold",
    actionLabel: "Put on hold",
    description: "Goals saved for another time.",
    badgeClass: "badge-neutral badge-outline",
    allowedActions: ["idea", "saving"],
  },
  purchased: {
    label: "Purchased",
    actionLabel: "Mark purchased",
    description: "Completed goals with linked purchase history.",
    badgeClass: "badge-success",
    allowedActions: [],
  },
} as const satisfies Record<GoalStatus, GoalStatusStrategy>;

export function getGoalStatusStrategy(status: GoalStatus): GoalStatusStrategy {
  return GOAL_STATUS_STRATEGIES[status];
}
