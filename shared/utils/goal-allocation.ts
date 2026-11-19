import { assertNonNegativeCents, assertPositiveCents, type Cents } from "./money-cents";

export interface GoalCost {
  _id: string;
  estimatedCostCents: Cents;
}

export interface GoalAllocation<G extends GoalCost> {
  goal: G;
  allocatedCents: Cents;
  remainingCents: Cents;
  progressBasisPoints: number;
}

/** Funds goals in the order given. Negative or zero available savings funds nothing. */
export function allocateSavings<G extends GoalCost>(
  availableCents: Cents,
  goals: readonly G[],
): GoalAllocation<G>[] {
  let remainingSavingsCents = availableCents > 0n ? availableCents : 0n;

  return goals.map((goal) => {
    assertPositiveCents(goal.estimatedCostCents, "Estimated cost");

    const allocatedCents =
      remainingSavingsCents < goal.estimatedCostCents
        ? remainingSavingsCents
        : goal.estimatedCostCents;

    remainingSavingsCents -= allocatedCents;

    return {
      goal,
      allocatedCents,
      remainingCents: goal.estimatedCostCents - allocatedCents,
      progressBasisPoints: Number((allocatedCents * 10_000n) / goal.estimatedCostCents),
    };
  });
}

export interface PurchaseFunding {
  fromSavingsCents: Cents;
  fromDailyBudgetCents: Cents;
}

/** Savings pay first; whatever is left counts against the daily budget. */
export function calculatePurchaseFunding(
  amountPaidCents: Cents,
  availableSavingsCents: Cents,
): PurchaseFunding {
  assertPositiveCents(amountPaidCents, "Amount paid");
  assertNonNegativeCents(availableSavingsCents, "Available savings");

  const fromSavingsCents =
    amountPaidCents < availableSavingsCents ? amountPaidCents : availableSavingsCents;

  return { fromSavingsCents, fromDailyBudgetCents: amountPaidCents - fromSavingsCents };
}

export interface GoalLoss<G extends GoalCost> {
  goal: G;
  lostCents: Cents;
  allocatedCentsAfter: Cents;
}

/**
 * What buying `purchasedGoalId` for `amountPaidCents` does to the remaining goals.
 * Goals are compared by `_id`, so removing a goal from the middle of the plan
 * never pairs one goal's old funding with another's new funding.
 */
export function previewPurchase<G extends GoalCost>(
  availableSavingsCents: Cents,
  goals: readonly G[],
  purchasedGoalId: string,
  amountPaidCents: Cents,
): { funding: PurchaseFunding; losses: GoalLoss<G>[] } {
  if (!goals.some((goal) => goal._id === purchasedGoalId)) {
    throw new Error("Goal is not in the plan");
  }

  const funding = calculatePurchaseFunding(
    amountPaidCents,
    availableSavingsCents > 0n ? availableSavingsCents : 0n,
  );
  const before = new Map(
    allocateSavings(availableSavingsCents, goals).map((a) => [a.goal._id, a.allocatedCents]),
  );
  const after = allocateSavings(
    availableSavingsCents - funding.fromSavingsCents,
    goals.filter((goal) => goal._id !== purchasedGoalId),
  );

  const losses: GoalLoss<G>[] = [];

  for (const { goal, allocatedCents } of after) {
    const lostCents = (before.get(goal._id) ?? 0n) - allocatedCents;

    if (lostCents > 0n) {
      losses.push({ goal, lostCents, allocatedCentsAfter: allocatedCents });
    }
  }

  return { funding, losses };
}
