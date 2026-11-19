import type { Doc } from "../../convex/_generated/dataModel";

export type WantStatus = Doc<"goals">["status"];

export type WantStatusStrategy = {
  label: string;
  description: string;
  badgeClass: string;
  allowedActions: readonly WantStatus[];
};

export const WANT_STATUS_STRATEGIES = {
  idea: {
    label: "Considering",
    description: "Ideas the household is still deciding on.",
    badgeClass: "badge-info badge-outline",
    allowedActions: ["saving", "on_hold"],
  },
  saving: {
    label: "Plan for it",
    description: "Active Wants funded in this queue order.",
    badgeClass: "badge-primary",
    allowedActions: ["idea", "on_hold"],
  },
  on_hold: {
    label: "Not now",
    description: "Wants saved for another time.",
    badgeClass: "badge-neutral badge-outline",
    allowedActions: ["idea", "saving"],
  },
  purchased: {
    label: "Bought",
    description: "Completed Wants with linked purchase history.",
    badgeClass: "badge-success",
    allowedActions: [],
  },
} as const satisfies Record<WantStatus, WantStatusStrategy>;

export function getWantStatusStrategy(status: WantStatus): WantStatusStrategy {
  return WANT_STATUS_STRATEGIES[status];
}
