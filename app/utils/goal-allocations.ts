import type { Doc, Id } from "../../convex/_generated/dataModel";
import { allocateSavings } from "../../shared/utils/goal-allocation.ts";

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
