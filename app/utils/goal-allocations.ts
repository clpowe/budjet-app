import type { Doc, Id } from "../../convex/_generated/dataModel";
import { allocateSavings, previewPurchase } from "../../shared/utils/goal-allocation.ts";

export type PurchasePreview = {
  actualAmountCents: bigint;
  fromSavingsCents: bigint;
  budgetImpactCents: bigint;
  progressLosses: Array<{
    goalId: Id<"goals">;
    name: string;
    lostCents: bigint;
    allocatedCentsAfter: bigint;
  }>;
};

export type ActiveAllocation = {
  goalId: Id<"goals">;
  allocatedCents: bigint;
  remainingCents: bigint;
  progressBasisPoints: number;
};

export function projectAllocations(
  availableCents: bigint,
  activeGoals: readonly Doc<"goals">[],
): ActiveAllocation[] {
  return allocateSavings(availableCents, activeGoals).map(
    ({ goal, allocatedCents, remainingCents, progressBasisPoints }) => ({
      goalId: goal._id,
      allocatedCents,
      remainingCents,
      progressBasisPoints,
    }),
  );
}

export function previewGoalPurchase(
  availableCents: bigint,
  activeGoals: readonly Doc<"goals">[],
  goalId: Id<"goals">,
  actualAmountCents: bigint,
): PurchasePreview | null {
  if (!activeGoals.some((goal) => goal._id === goalId)) return null;

  const { funding, losses } = previewPurchase(
    availableCents,
    activeGoals,
    goalId,
    actualAmountCents,
  );

  return {
    actualAmountCents,
    fromSavingsCents: funding.fromSavingsCents,
    budgetImpactCents: funding.fromDailyBudgetCents,
    progressLosses: losses.map(({ goal, lostCents, allocatedCentsAfter }) => ({
      goalId: goal._id,
      name: goal.name,
      lostCents,
      allocatedCentsAfter,
    })),
  };
}
