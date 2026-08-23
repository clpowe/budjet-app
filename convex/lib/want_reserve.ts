import { format, tzDate } from "@formkit/tempo";
import type { Cents } from "../../shared/utils/money-cents";

export interface ReserveItem<Id extends string = string> {
  id: Id;
  estimatedCostCents: Cents;
}

export interface ReserveAllocation<Id extends string = string> {
  id: Id;
  allocatedCents: Cents;
  remainingCents: Cents;
}

export interface LowerItemImpact<Id extends string = string> {
  id: Id;
  lostCents: Cents;
  allocatedCentsAfter: Cents;
}

export interface RecentPace {
  positiveDayCount: number;
  totalPositiveCents: Cents;
  averageDailyCents: Cents;
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

function getLocalDateDistance(fromLocalDate: string, toLocalDate: string): number {
  const from = parseLocalDate(fromLocalDate).getTime();
  const to = parseLocalDate(toLocalDate).getTime();

  return Math.round((to - from) / (24 * 60 * 60 * 1_000));
}

function ceilDivide(dividend: Cents, divisor: Cents): Cents {
  return (dividend + divisor - 1n) / divisor;
}

export function allocateReserve<Id extends string>(
  positionCents: Cents,
  items: readonly ReserveItem<Id>[],
): ReserveAllocation<Id>[] {
  assertUniqueIds(
    items.map((item) => item.id),
    "Active reserve items",
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

export function getReorderUpdates<Id extends string>(
  currentIds: readonly Id[],
  requestedIds: readonly Id[],
): Array<{ id: Id; order: number }> {
  assertUniqueIds(currentIds, "Current active item IDs");
  assertUniqueIds(requestedIds, "Requested active item IDs");

  if (currentIds.length !== requestedIds.length) {
    throw new Error("Reorder must include every active item exactly once");
  }

  const currentIdSet = new Set(currentIds);

  if (requestedIds.some((id) => !currentIdSet.has(id))) {
    throw new Error("Reorder contains an item that is not active");
  }

  return requestedIds.map((id, order) => ({ id, order }));
}

export function calculatePurchaseFunding(
  actualAmountCents: Cents,
  availableReserveCents: Cents,
): { reserveUsedCents: Cents; budgetImpactCents: Cents } {
  assertPositiveCents(actualAmountCents, "Actual amount");
  assertNonNegativeCents(availableReserveCents, "Available reserve");

  const reserveUsedCents =
    actualAmountCents < availableReserveCents ? actualAmountCents : availableReserveCents;

  return {
    reserveUsedCents,
    budgetImpactCents: actualAmountCents - reserveUsedCents,
  };
}

export function getBudgetImpact(amountCents: Cents, reserveUsedCents: Cents): Cents {
  assertPositiveCents(amountCents, "Amount");
  assertNonNegativeCents(reserveUsedCents, "Reserve used");

  if (reserveUsedCents > amountCents) {
    throw new RangeError("Reserve used cannot exceed the amount");
  }

  return amountCents - reserveUsedCents;
}

export function calculateLowerItemImpact<Id extends string>(
  allocationsBefore: readonly ReserveAllocation<Id>[],
  reserveUsedCents: Cents,
): LowerItemImpact<Id>[] {
  assertNonNegativeCents(reserveUsedCents, "Reserve used");

  let remainingReserveUseCents = reserveUsedCents;
  const impacts: LowerItemImpact<Id>[] = [];

  for (const allocation of allocationsBefore) {
    assertNonNegativeCents(allocation.allocatedCents, "Allocated amount");
    assertNonNegativeCents(allocation.remainingCents, "Remaining amount");

    const lostCents =
      allocation.allocatedCents < remainingReserveUseCents
        ? allocation.allocatedCents
        : remainingReserveUseCents;

    remainingReserveUseCents -= lostCents;

    if (lostCents > 0n) {
      impacts.push({
        id: allocation.id,
        lostCents,
        allocatedCentsAfter: allocation.allocatedCents - lostCents,
      });
    }
  }

  return impacts;
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

export function calculateTargetDailyAmount(
  remainingCents: Cents,
  targetDate: number,
  today: number,
  timeZone: string,
): Cents {
  if (remainingCents <= 0n) {
    return 0n;
  }

  const todayLocalDate = getLocalDateKey(today, timeZone);
  const targetLocalDate = getLocalDateKey(targetDate, timeZone);
  const daysUntilTarget = getLocalDateDistance(todayLocalDate, targetLocalDate);

  if (daysUntilTarget <= 0) {
    return remainingCents;
  }

  return ceilDivide(remainingCents, BigInt(daysUntilTarget));
}

export function calculateRecentPace(contributions: readonly Cents[]): RecentPace | null {
  const positiveContributions = contributions.filter((contribution) => contribution > 0n);

  if (positiveContributions.length === 0) {
    return null;
  }

  const totalPositiveCents = positiveContributions.reduce(
    (sum, contribution) => sum + contribution,
    0n,
  );

  return {
    positiveDayCount: positiveContributions.length,
    totalPositiveCents,
    averageDailyCents: totalPositiveCents / BigInt(positiveContributions.length),
  };
}
