import type { Doc } from "../../convex/_generated/dataModel";

export type WantStatus = Doc<"wantItems">["status"];

export type WantStatusStrategy = {
  label: string;
  description: string;
  badgeClass: string;
  allowedActions: readonly WantStatus[];
};

export const WANT_STATUS_STRATEGIES = {
  considering: {
    label: "Considering",
    description: "Ideas the household is still deciding on.",
    badgeClass: "badge-info badge-outline",
    allowedActions: ["plan_for_it", "not_now"],
  },
  plan_for_it: {
    label: "Plan for it",
    description: "Active Wants funded in this queue order.",
    badgeClass: "badge-primary",
    allowedActions: ["considering", "not_now"],
  },
  not_now: {
    label: "Not now",
    description: "Wants saved for another time.",
    badgeClass: "badge-neutral badge-outline",
    allowedActions: ["considering", "plan_for_it"],
  },
  bought: {
    label: "Bought",
    description: "Completed Wants with linked purchase history.",
    badgeClass: "badge-success",
    allowedActions: [],
  },
} as const satisfies Record<WantStatus, WantStatusStrategy>;

export function getWantStatusStrategy(status: WantStatus): WantStatusStrategy {
  return WANT_STATUS_STRATEGIES[status];
}
