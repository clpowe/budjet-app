import { format, tzDate } from "@formkit/tempo";
import type { Cents } from "../../shared/utils/money-cents";

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

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function assertPositiveCents(value: Cents, label: string): void {
  if (value <= 0n) {
    throw new RangeError(`${label} must be greater than zero`);
  }
}

function assertNonNegativeCents(value: Cents, label: string): void {
  if (value < 0n) {
    throw new RangeError(`${label} must not be negative`);
  }
}

function assertUniqueIds<Id extends string>(ids: readonly Id[], label: string): void {
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${label} must not contain duplicate IDs`);
  }
}

function assertValidTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
  } catch {
    throw new Error("Invalid time zone");
  }
}

function parseLocalDate(localDate: string): Date {
  const match = LOCAL_DATE_PATTERN.exec(localDate);

  if (!match) {
    throw new Error("Local date must use YYYY-MM-DD format");
  }

  const date = new Date(`${localDate}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== localDate) {
    throw new Error("Local date is invalid");
  }

  return date;
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

export function getLocalDateKey(timestamp: number, timeZone: string): string {
  if (!Number.isFinite(timestamp)) {
    throw new Error("Timestamp must be finite");
  }

  assertValidTimeZone(timeZone);

  return format({
    date: new Date(timestamp),
    format: "YYYY-MM-DD",
    tz: timeZone,
  });
}

export function getNextLocalDate(localDate: string, timeZone: string): string {
  assertValidTimeZone(timeZone);

  const date = parseLocalDate(localDate);
  date.setUTCDate(date.getUTCDate() + 1);

  return date.toISOString().slice(0, 10);
}

export function getNextMonthStart(localDate: string): string {
  const date = parseLocalDate(localDate);
  date.setUTCMonth(date.getUTCMonth() + 1, 1);
  return date.toISOString().slice(0, 10);
}

export interface LocalMonthPeriod {
  localMonth: string;
  startLocalDate: string;
  toDateEndExclusiveLocalDate: string;
  currentLocalDate: string;
  elapsedDays: number;
}

export function getLocalMonthPeriod(asOfTimestamp: number, timeZone: string): LocalMonthPeriod {
  const currentLocalDate = getLocalDateKey(asOfTimestamp, timeZone);
  const localMonth = currentLocalDate.slice(0, 7);

  return {
    localMonth,
    startLocalDate: `${localMonth}-01`,
    toDateEndExclusiveLocalDate: getNextLocalDate(currentLocalDate, timeZone),
    currentLocalDate,
    elapsedDays: Number(currentLocalDate.slice(8, 10)),
  };
}

export function getLocalDayBounds(
  localDate: string,
  timeZone: string,
): { startTimestamp: number; endExclusiveTimestamp: number } {
  assertValidTimeZone(timeZone);

  const startLocalDate = parseLocalDate(localDate).toISOString().slice(0, 10);
  const endLocalDate = getNextLocalDate(startLocalDate, timeZone);

  return {
    startTimestamp: tzDate(`${startLocalDate}T00:00:00`, timeZone).getTime(),
    endExclusiveTimestamp: tzDate(`${endLocalDate}T00:00:00`, timeZone).getTime(),
  };
}
