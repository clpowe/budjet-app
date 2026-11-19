import {
  assertNonNegativeCents,
  assertPositiveCents,
  type Cents,
} from "../../shared/utils/money-cents";

export interface SavingsItem<Id extends string = string> {
  id: Id;
  estimatedCostCents: Cents;
}

export interface SavingsAllocation<Id extends string = string> {
  id: Id;
  allocatedCents: Cents;
  remainingCents: Cents;
}

export interface ProgressLoss<Id extends string = string> {
  id: Id;
  lostCents: Cents;
  allocatedCentsAfter: Cents;
}

function assertUniqueIds<Id extends string>(ids: readonly Id[], label: string): void {
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${label} must not contain duplicate IDs`);
  }
}

export function allocateSavings<Id extends string>(
  positionCents: Cents,
  items: readonly SavingsItem<Id>[],
): SavingsAllocation<Id>[] {
  assertUniqueIds(
    items.map((item) => item.id),
    "Active savings items",
  );

  let remainingPositionCents = positionCents > 0n ? positionCents : 0n;

  return items.map((item) => {
    assertPositiveCents(item.estimatedCostCents, "Estimated cost");

    const allocatedCents =
      remainingPositionCents < item.estimatedCostCents
        ? remainingPositionCents
        : item.estimatedCostCents;

    remainingPositionCents -= allocatedCents;

    return {
      id: item.id,
      allocatedCents,
      remainingCents: item.estimatedCostCents - allocatedCents,
    };
  });
}

export function calculatePurchaseFunding(
  actualAmountCents: Cents,
  availableSavingsCents: Cents,
): { savingsUsedCents: Cents; budgetImpactCents: Cents } {
  assertPositiveCents(actualAmountCents, "Actual amount");
  assertNonNegativeCents(availableSavingsCents, "Savings");

  const savingsUsedCents =
    actualAmountCents < availableSavingsCents ? actualAmountCents : availableSavingsCents;

  return {
    savingsUsedCents,
    budgetImpactCents: actualAmountCents - savingsUsedCents,
  };
}

export function getBudgetImpact(amountCents: Cents, savingsUsedCents: Cents): Cents {
  assertPositiveCents(amountCents, "Amount");
  assertNonNegativeCents(savingsUsedCents, "Paid from savings");

  if (savingsUsedCents > amountCents) {
    throw new RangeError("Paid from savings cannot exceed the amount");
  }

  return amountCents - savingsUsedCents;
}

export function calculateProgressLosses<Id extends string>(
  allocationsBefore: readonly SavingsAllocation<Id>[],
  allocationsAfter: readonly SavingsAllocation<Id>[],
): ProgressLoss<Id>[] {
  const allocatedCentsBeforeById = new Map(
    allocationsBefore.map((allocation) => [allocation.id, allocation.allocatedCents]),
  );
  const losses: ProgressLoss<Id>[] = [];

  for (const allocationAfter of allocationsAfter) {
    const allocatedCentsBefore = allocatedCentsBeforeById.get(allocationAfter.id);

    if (allocatedCentsBefore === undefined) {
      throw new Error("Remaining Want is missing its allocation from before the purchase");
    }

    const lostCents = allocatedCentsBefore - allocationAfter.allocatedCents;

    if (lostCents > 0n) {
      losses.push({
        id: allocationAfter.id,
        lostCents,
        allocatedCentsAfter: allocationAfter.allocatedCents,
      });
    }
  }

  return losses;
}
