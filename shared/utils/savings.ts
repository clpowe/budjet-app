import { countLocalDays } from "./local-date";
import { assertNonNegativeCents, type Cents } from "./money-cents";

export interface SavingsInputs {
  allowanceCents: Cents;
  firstEligibleLocalDate: string | undefined;
  todayLocalDate: string;
  closedSpentCents: Cents;
  today: { totalSpentCents: Cents; spentFromSavingsCents: Cents };
}

export interface Savings {
  eligibleClosedDays: number;
  closedPositionCents: Cents;
  positionCents: Cents;
  todayOverageAdjustmentCents: Cents;
  projectedEndOfDayContributionCents: Cents;
  availableCents: Cents;
  shortfallCents: Cents;
}

export function calculateSavings({
  allowanceCents,
  firstEligibleLocalDate,
  todayLocalDate,
  closedSpentCents,
  today,
}: SavingsInputs): Savings {
  assertNonNegativeCents(allowanceCents, "Allowance");
  assertNonNegativeCents(closedSpentCents, "Closed spending");
  assertNonNegativeCents(today.totalSpentCents, "Spending today");
  assertNonNegativeCents(today.spentFromSavingsCents, "Paid from savings today");

  if (today.spentFromSavingsCents > today.totalSpentCents) {
    throw new RangeError("Paid from savings cannot exceed the amount spent");
  }

  const eligibleClosedDays =
    firstEligibleLocalDate === undefined
      ? 0
      : countLocalDays(firstEligibleLocalDate, todayLocalDate);
  const closedPositionCents =
    BigInt(eligibleClosedDays) * allowanceCents -
    (eligibleClosedDays === 0 ? 0n : closedSpentCents);

  const positionCents = closedPositionCents - today.spentFromSavingsCents;
  const budgetImpactTodayCents = today.totalSpentCents - today.spentFromSavingsCents;

  const todayOverageAdjustmentCents =
    budgetImpactTodayCents > allowanceCents ? allowanceCents - budgetImpactTodayCents : 0n;
  const projectedEndOfDayContributionCents =
    budgetImpactTodayCents <= allowanceCents ? allowanceCents - budgetImpactTodayCents : 0n;

  const adjustedCents = positionCents + todayOverageAdjustmentCents;

  return {
    eligibleClosedDays,
    closedPositionCents,
    positionCents,
    todayOverageAdjustmentCents,
    projectedEndOfDayContributionCents,
    availableCents: adjustedCents > 0n ? adjustedCents : 0n,
    shortfallCents: adjustedCents < 0n ? -adjustedCents : 0n,
  };
}
