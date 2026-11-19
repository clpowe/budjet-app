import {
  getLocalDateKey,
  getLocalDayBounds,
  getNextLocalDate,
} from "../../shared/utils/local-date.ts";
import { assertPositiveCents } from "../../shared/utils/money-cents";
import { calculateSavings, type Savings } from "../../shared/utils/savings";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getEffectiveTimeZone } from "../households";
import { applyExpenseDelta, toExpenseFacts } from "./daily_budget_rollups";
import { calculatePurchaseFunding } from "./want_savings";

/*
 * Savings are never stored. They are calculated on read from the household's
 * allowance, the day savings started, and the daily spending totals:
 *
 *   closed days  = savingsStartLocalDate .. yesterday (empty days earn the allowance)
 *   position     = closed days x allowance - spending on those days - savings used today
 *
 * Writes only record expenses and keep the daily totals in step.
 */

type DatabaseCtx = MutationCtx | QueryCtx;

export type PurchaseFunding = {
  savingsUsedCents: bigint;
  budgetImpactCents: bigint;
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type SavingsSnapshot = Savings & {
  timeZone: string;
  /** Household-local today. */
  localDate: string;
  dailyAllowanceCents: bigint;
  firstEligibleLocalDate: string | undefined;
  /** Spending charged to today's daily budget (not paid from savings). */
  budgetImpactExpenseCents: bigint;
};

async function loadRollup(ctx: DatabaseCtx, householdId: Id<"households">, localDate: string) {
  return await ctx.db
    .query("dailyBudgetRollups")
    .withIndex("by_household_and_local_date", (q) =>
      q.eq("householdId", householdId).eq("localDate", localDate),
    )
    .unique();
}

async function sumSpentCents(
  ctx: DatabaseCtx,
  householdId: Id<"households">,
  startInclusive: string,
  endExclusive: string,
): Promise<bigint> {
  let totalCents = 0n;

  for await (const rollup of ctx.db
    .query("dailyBudgetRollups")
    .withIndex("by_household_and_local_date", (q) =>
      q
        .eq("householdId", householdId)
        .gte("localDate", startInclusive)
        .lt("localDate", endExclusive),
    )) {
    totalCents += rollup.expenseCents;
  }

  return totalCents;
}

/**
 * Live view of the savings at `now`. Read-only. Pass `excluding` to see the
 * savings as if that expense had never been recorded.
 */
export async function getSavingsSnapshot(
  ctx: DatabaseCtx,
  household: Doc<"households">,
  now: number,
  {
    excluding,
  }: { excluding?: { localDate: string; amountCents: bigint; savingsUsedCents: bigint } } = {},
): Promise<SavingsSnapshot> {
  const dailyAllowanceCents = household.allowanceCents;
  const timeZone = getEffectiveTimeZone(household, now);
  const localDate = getLocalDateKey(now, timeZone);
  const firstEligibleLocalDate = household.savingsStartLocalDate;
  const hasClosedDays = firstEligibleLocalDate !== undefined && firstEligibleLocalDate < localDate;

  const [closedSpentCents, todayRollup] = await Promise.all([
    hasClosedDays
      ? sumSpentCents(ctx, household._id, firstEligibleLocalDate, localDate)
      : Promise.resolve(0n),
    loadRollup(ctx, household._id, localDate),
  ]);

  let closedSpent = closedSpentCents;
  let todaySpent = todayRollup?.expenseCents ?? 0n;
  let todayFromSavings =
    todayRollup?.savingsFundedExpenseCents ?? todayRollup?.reserveFundedExpenseCents ?? 0n;

  if (excluding) {
    if (excluding.localDate === localDate) {
      todaySpent -= excluding.amountCents;
      todayFromSavings -= excluding.savingsUsedCents;
    } else if (
      hasClosedDays &&
      excluding.localDate >= firstEligibleLocalDate &&
      excluding.localDate < localDate
    ) {
      closedSpent -= excluding.amountCents;
    }
  }

  return {
    ...calculateSavings({
      allowanceCents: dailyAllowanceCents,
      firstEligibleLocalDate,
      todayLocalDate: localDate,
      closedSpentCents: closedSpent,
      today: { totalSpentCents: todaySpent, spentFromSavingsCents: todayFromSavings },
    }),
    timeZone,
    localDate,
    dailyAllowanceCents,
    firstEligibleLocalDate,
    budgetImpactExpenseCents: todaySpent - todayFromSavings,
  };
}

/** Savings can only pay for a purchase dated on or after the day savings started. */
function fundableSavingsCents(snapshot: SavingsSnapshot, purchaseLocalDate: string): bigint {
  return snapshot.firstEligibleLocalDate !== undefined &&
    purchaseLocalDate >= snapshot.firstEligibleLocalDate
    ? snapshot.availableCents
    : 0n;
}

const MAX_RANGE_DAYS = 31;

function assertOneRowPerDay(rows: readonly { localDate: string }[], label: string): void {
  if (rows.length > MAX_RANGE_DAYS) {
    throw new Error(`${label} exceed the monthly invariant`);
  }

  const localDates = new Set<string>();

  for (const row of rows) {
    if (localDates.has(row.localDate)) {
      throw new Error(`${label} contain duplicate local dates`);
    }

    localDates.add(row.localDate);
  }
}

/** Daily budget rollups in a local-date range of at most 31 days (a month to date). */
export async function listSavingsActivity(
  ctx: DatabaseCtx,
  householdId: Id<"households">,
  {
    startLocalDate,
    endExclusiveLocalDate,
  }: { startLocalDate: string; endExclusiveLocalDate: string },
): Promise<{ rollups: Doc<"dailyBudgetRollups">[] }> {
  const rollups = await ctx.db
    .query("dailyBudgetRollups")
    .withIndex("by_household_and_local_date", (q) =>
      q
        .eq("householdId", householdId)
        .gte("localDate", startLocalDate)
        .lt("localDate", endExclusiveLocalDate),
    )
    .take(MAX_RANGE_DAYS + 1);

  assertOneRowPerDay(rollups, "Daily budget rollups");

  return { rollups };
}

/**
 * Sum of the positive daily contributions for the closed eligible days in a
 * local-date range: each adds `max(0, allowance - budget impact)`. A closed
 * day without a rollup had no spending and adds the full allowance.
 */
export function sumClosedPositiveContributions({
  rollups,
  allowanceCents,
  firstEligibleLocalDate,
  todayLocalDate,
  startLocalDate,
  endExclusiveLocalDate,
  timeZone,
}: {
  rollups: readonly Pick<Doc<"dailyBudgetRollups">, "localDate" | "budgetImpactExpenseCents">[];
  allowanceCents: bigint;
  firstEligibleLocalDate: string | undefined;
  todayLocalDate: string;
  startLocalDate: string;
  endExclusiveLocalDate: string;
  timeZone: string;
}): bigint {
  if (firstEligibleLocalDate === undefined) {
    return 0n;
  }

  const budgetImpactByDate = new Map(
    rollups.map((rollup) => [rollup.localDate, rollup.budgetImpactExpenseCents]),
  );
  const endLocalDate =
    endExclusiveLocalDate < todayLocalDate ? endExclusiveLocalDate : todayLocalDate;
  let localDate = startLocalDate > firstEligibleLocalDate ? startLocalDate : firstEligibleLocalDate;
  let totalCents = 0n;
  let dayCount = 0;

  while (localDate < endLocalDate) {
    if (dayCount >= MAX_RANGE_DAYS) {
      throw new Error("Closed contribution range exceeds the monthly invariant");
    }

    const contributionCents = allowanceCents - (budgetImpactByDate.get(localDate) ?? 0n);

    if (contributionCents > 0n) {
      totalCents += contributionCents;
    }

    localDate = getNextLocalDate(localDate, timeZone);
    dayCount += 1;
  }

  return totalCents;
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

/** Starts the household's savings the day after the first goal is planned. Idempotent. */
export async function activateSavings(
  ctx: MutationCtx,
  { household, now }: { household: Doc<"households">; now: number },
): Promise<void> {
  if (household.savingsStartLocalDate !== undefined) {
    return;
  }

  const timeZone = getEffectiveTimeZone(household, now);

  await ctx.db.patch(household._id, {
    savingsStartLocalDate: getNextLocalDate(getLocalDateKey(now, timeZone), timeZone),
  });
}

// ---------------------------------------------------------------------------
// Want purchases
// ---------------------------------------------------------------------------

/**
 * Records a purchase of a planned Want: inserts the linked expense, funds it
 * from savings first, and books it against `localDate`.
 */
export async function recordPurchase(
  ctx: MutationCtx,
  {
    household,
    want,
    amountCents,
    localDate,
    now,
  }: {
    household: Doc<"households">;
    want: Doc<"wantItems">;
    amountCents: bigint;
    localDate: string;
    now: number;
  },
): Promise<PurchaseFunding & { expenseId: Id<"expenses"> }> {
  assertPositiveCents(amountCents, "Actual amount");

  const timeZone = getEffectiveTimeZone(household, now);
  // Validation only: throws on a malformed date or an invalid time zone.
  const { startTimestamp } = getLocalDayBounds(localDate, timeZone);

  if (localDate > getLocalDateKey(now, timeZone)) {
    throw new Error("Purchase date cannot be in the future");
  }

  const snapshot = await getSavingsSnapshot(ctx, household, now);
  const funding = calculatePurchaseFunding(amountCents, fundableSavingsCents(snapshot, localDate));

  const expenseId = await ctx.db.insert("expenses", {
    householdId: household._id,
    name: want.name,
    notes: want.notes,
    amount: centsToLegacyDollars(amountCents),
    amountCents,
    date: startTimestamp,
    localDate,
    wantItemId: want._id,
    savingsUsedCents: funding.savingsUsedCents,
    reserveUsedCents: funding.savingsUsedCents,
  });

  await applyExpenseDelta(ctx, {
    householdId: household._id,
    after: { localDate, amountCents, savingsUsedCents: funding.savingsUsedCents },
    now,
  });

  return { expenseId, ...funding };
}

/**
 * Changes a purchase's amount. Funding is recomputed from the savings that
 * would be available now had the original purchase never happened.
 */
export async function correctPurchase(
  ctx: MutationCtx,
  {
    household,
    expense,
    amountCents,
    now,
  }: {
    household: Doc<"households">;
    expense: Doc<"expenses">;
    amountCents: bigint;
    now: number;
  },
): Promise<PurchaseFunding> {
  assertPositiveCents(amountCents, "Actual amount");
  assertLinkedPurchase(expense);

  const before = toExpenseFacts(expense, getEffectiveTimeZone(household, now));
  const withoutPurchase = await getSavingsSnapshot(ctx, household, now, { excluding: before });
  const funding = calculatePurchaseFunding(
    amountCents,
    fundableSavingsCents(withoutPurchase, before.localDate),
  );

  await ctx.db.patch("expenses", expense._id, {
    amount: centsToLegacyDollars(amountCents),
    amountCents,
    savingsUsedCents: funding.savingsUsedCents,
    reserveUsedCents: funding.savingsUsedCents,
    localDate: before.localDate,
  });
  await applyExpenseDelta(ctx, {
    householdId: household._id,
    before,
    after: {
      localDate: before.localDate,
      amountCents,
      savingsUsedCents: funding.savingsUsedCents,
    },
    now,
  });

  return funding;
}

/** Removes a purchase's expense; its savings funding returns automatically. */
export async function undoPurchase(
  ctx: MutationCtx,
  {
    household,
    expense,
    now,
  }: {
    household: Doc<"households">;
    expense: Doc<"expenses">;
    now: number;
  },
): Promise<void> {
  assertLinkedPurchase(expense);

  await applyExpenseDelta(ctx, {
    householdId: household._id,
    before: toExpenseFacts(expense, getEffectiveTimeZone(household, now)),
    now,
  });
  await ctx.db.delete("expenses", expense._id);
}

function assertLinkedPurchase(expense: Doc<"expenses">): void {
  if (!expense.wantItemId) {
    throw new Error("Expense is not a Want purchase");
  }

  if (expense.amountCents === undefined) {
    throw new Error("Linked purchase is missing its cent-valued amount");
  }
}

// ---------------------------------------------------------------------------
// Everyday expenses
// ---------------------------------------------------------------------------

export type ExpenseFields = {
  name: string;
  notes: string;
  amountCents: bigint;
  date: number;
};

function assertExpenseDayIsNotFuture(localDate: string, now: number, timeZone: string): void {
  if (localDate > getLocalDateKey(now, timeZone)) {
    throw new Error("Expense date cannot be in the future");
  }
}

function assertEverydayExpense(expense: Doc<"expenses">): void {
  if (expense.wantItemId) {
    throw new Error("Want purchases must be managed from the wants flow");
  }
}

export async function addExpense(
  ctx: MutationCtx,
  { household, fields, now }: { household: Doc<"households">; fields: ExpenseFields; now: number },
): Promise<{ expenseId: Id<"expenses"> }> {
  assertPositiveCents(fields.amountCents, "Expense amount");

  const timeZone = getEffectiveTimeZone(household, now);
  const localDate = getLocalDateKey(fields.date, timeZone);
  assertExpenseDayIsNotFuture(localDate, now, timeZone);

  const expenseId = await ctx.db.insert("expenses", {
    householdId: household._id,
    name: fields.name,
    notes: fields.notes,
    amount: centsToLegacyDollars(fields.amountCents),
    amountCents: fields.amountCents,
    date: fields.date,
    localDate,
  });

  await applyExpenseDelta(ctx, {
    householdId: household._id,
    after: { localDate, amountCents: fields.amountCents, savingsUsedCents: 0n },
    now,
  });

  return { expenseId };
}

export async function editExpense(
  ctx: MutationCtx,
  {
    household,
    expense,
    fields,
    now,
  }: {
    household: Doc<"households">;
    expense: Doc<"expenses">;
    fields: Omit<ExpenseFields, "date"> & { date?: number; localDate?: string };
    now: number;
  },
): Promise<void> {
  assertEverydayExpense(expense);
  assertPositiveCents(fields.amountCents, "Expense amount");
  const timeZone = getEffectiveTimeZone(household, now);
  const before = toExpenseFacts(expense, timeZone);

  // The local date identifies an intentional move even if its midnight
  // happens to equal the original timestamp. Older clients send a timestamp.
  let date = fields.date ?? expense.date;
  let localDate = before.localDate;
  if (fields.localDate !== undefined && fields.localDate !== before.localDate) {
    localDate = fields.localDate;
    date = getLocalDayBounds(localDate, timeZone).startTimestamp;
    if (getLocalDateKey(date, timeZone) !== localDate) {
      throw new Error("Expense date does not exist in the household time zone");
    }
    assertExpenseDayIsNotFuture(localDate, now, timeZone);
  } else if (date !== expense.date) {
    localDate = getLocalDateKey(date, timeZone);
    assertExpenseDayIsNotFuture(localDate, now, timeZone);
  }

  await ctx.db.patch("expenses", expense._id, {
    name: fields.name,
    notes: fields.notes,
    amount: centsToLegacyDollars(fields.amountCents),
    amountCents: fields.amountCents,
    date,
    localDate,
  });
  await applyExpenseDelta(ctx, {
    householdId: household._id,
    before,
    after: { localDate, amountCents: fields.amountCents, savingsUsedCents: 0n },
    now,
  });
}

export async function removeExpense(
  ctx: MutationCtx,
  {
    household,
    expense,
    now,
  }: {
    household: Doc<"households">;
    expense: Doc<"expenses">;
    now: number;
  },
): Promise<void> {
  assertEverydayExpense(expense);

  await applyExpenseDelta(ctx, {
    householdId: household._id,
    before: toExpenseFacts(expense, getEffectiveTimeZone(household, now)),
    now,
  });
  await ctx.db.delete("expenses", expense._id);
}

export function centsToLegacyDollars(amountCents: bigint): number {
  return Number(amountCents) / 100;
}
