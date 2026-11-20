import { addLocalDays, countLocalDays } from "./local-date";
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
/** Spending charged to the daily budget: everything not paid from savings. */
export function budgetImpact(totalSpentCents: Cents, fromSavingsCents: Cents): Cents {
  assertNonNegativeCents(totalSpentCents, "Amount spent");
  assertNonNegativeCents(fromSavingsCents, "Paid from savings");

  if (fromSavingsCents > totalSpentCents) {
    throw new RangeError("Paid from savings cannot exceed the amount spent");
  }

  return totalSpentCents - fromSavingsCents;
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

  const eligibleClosedDays =
    firstEligibleLocalDate === undefined
      ? 0
      : countLocalDays(firstEligibleLocalDate, todayLocalDate);
  const closedPositionCents =
    BigInt(eligibleClosedDays) * allowanceCents -
    (eligibleClosedDays === 0 ? 0n : closedSpentCents);

  const positionCents = closedPositionCents - today.spentFromSavingsCents;

  const budgetImpactTodayCents = budgetImpact(today.totalSpentCents, today.spentFromSavingsCents);

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

export interface SavingsHistoryInputs {
  allowanceCents: Cents;
  firstEligibleLocalDate: string | undefined;
  todayLocalDate: string;
  /** First day to report. Days before savings started are skipped. */
  startLocalDate: string;
  /** Spending charged to eligible days before the first reported day. */
  spentBeforeStartCents: Cents;
  /** Total spending per local date for the reported days; missing days spent nothing. */
  dailySpentCents: ReadonlyMap<string, Cents>;
}

export interface SavingsHistoryPoint {
  localDate: string;
  /** Savings position once this day has closed. */
  balanceCents: Cents;
}

/**
 * Savings balance at the end of each closed day from `startLocalDate` to
 * yesterday, using `calculateSavings` as if each following day were today.
 */
export function calculateSavingsHistory({
  allowanceCents,
  firstEligibleLocalDate,
  todayLocalDate,
  startLocalDate,
  spentBeforeStartCents,
  dailySpentCents,
}: SavingsHistoryInputs): SavingsHistoryPoint[] {
  assertNonNegativeCents(spentBeforeStartCents, "Spending before start");

  if (firstEligibleLocalDate === undefined) return [];

  const points: SavingsHistoryPoint[] = [];
  let closedSpentCents = spentBeforeStartCents;
  let localDate = startLocalDate > firstEligibleLocalDate ? startLocalDate : firstEligibleLocalDate;

  while (localDate < todayLocalDate) {
    closedSpentCents += dailySpentCents.get(localDate) ?? 0n;
    const nextLocalDate = addLocalDays(localDate, 1);

    const { positionCents } = calculateSavings({
      allowanceCents,
      firstEligibleLocalDate,
      todayLocalDate: nextLocalDate,
      closedSpentCents,
      today: { totalSpentCents: 0n, spentFromSavingsCents: 0n },
    });

    points.push({ localDate, balanceCents: positionCents });
    localDate = nextLocalDate;
  }

  return points;
}
