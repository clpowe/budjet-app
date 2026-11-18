import { legacyDollarsToCents } from "../../shared/utils/money-cents";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getLocalDateKey } from "./want_reserve";

export type ExpenseFacts = {
  /** Household-local day the expense counts against, fixed when it was written. */
  localDate: string;
  amountCents: bigint;
  reserveUsedCents: bigint;
};

/**
 * The household-local day an expense belongs to. Uses the day stored on the
 * expense; legacy rows written before `localDate` existed fall back to the
 * given zone until the backfill has run.
 */
export function getExpenseLocalDate(
  expense: Pick<Doc<"expenses">, "date" | "localDate">,
  fallbackTimeZone: string,
): string {
  return expense.localDate ?? getLocalDateKey(expense.date, fallbackTimeZone);
}

export function toExpenseFacts(
  expense: Pick<
    Doc<"expenses">,
    "amount" | "amountCents" | "date" | "localDate" | "reserveUsedCents"
  >,
  fallbackTimeZone: string,
): ExpenseFacts {
  return {
    localDate: getExpenseLocalDate(expense, fallbackTimeZone),
    amountCents: expense.amountCents ?? legacyDollarsToCents(expense.amount),
    reserveUsedCents: expense.reserveUsedCents ?? 0n,
  };
}

type ApplyExpenseDeltaArgs = {
  householdId: Id<"households">;
  before?: ExpenseFacts;
  after?: ExpenseFacts;
  now: number;
};

type DailyBudgetRollupValues = {
  expenseCents: bigint;
  reserveFundedExpenseCents: bigint;
  budgetImpactExpenseCents: bigint;
};

type DailyBudgetRollupArgs = {
  householdId: Id<"households">;
  localDate: string;
  now: number;
};

export async function ensureDailyBudgetRollup(
  ctx: MutationCtx,
  { householdId, localDate, now }: DailyBudgetRollupArgs,
): Promise<void> {
  const existing = await ctx.db
    .query("dailyBudgetRollups")
    .withIndex("by_household_and_local_date", (q) =>
      q.eq("householdId", householdId).eq("localDate", localDate),
    )
    .unique();

  if (existing) {
    return;
  }

  await ctx.db.insert("dailyBudgetRollups", {
    householdId,
    localDate,
    expenseCents: 0n,
    reserveFundedExpenseCents: 0n,
    budgetImpactExpenseCents: 0n,
    updatedAt: now,
  });
}

export async function replaceDailyBudgetRollup(
  ctx: MutationCtx,
  {
    householdId,
    localDate,
    now,
    expenseCents,
    reserveFundedExpenseCents,
    budgetImpactExpenseCents,
  }: DailyBudgetRollupArgs & DailyBudgetRollupValues,
): Promise<void> {
  const existing = await ctx.db
    .query("dailyBudgetRollups")
    .withIndex("by_household_and_local_date", (q) =>
      q.eq("householdId", householdId).eq("localDate", localDate),
    )
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      expenseCents,
      reserveFundedExpenseCents,
      budgetImpactExpenseCents,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert("dailyBudgetRollups", {
    householdId,
    localDate,
    expenseCents,
    reserveFundedExpenseCents,
    budgetImpactExpenseCents,
    updatedAt: now,
  });
}

type RollupDelta = {
  expenseCents: bigint;
  reserveFundedExpenseCents: bigint;
  budgetImpactExpenseCents: bigint;
};

export function getBudgetImpactCents(
  expense: Pick<ExpenseFacts, "amountCents" | "reserveUsedCents">,
): bigint {
  if (expense.amountCents <= 0n) {
    throw new Error("Expense amount must be greater than zero");
  }

  if (expense.reserveUsedCents < 0n || expense.reserveUsedCents > expense.amountCents) {
    throw new Error("Reserve used must be between zero and the expense amount");
  }

  return expense.amountCents - expense.reserveUsedCents;
}

function addDelta(
  deltas: Map<string, RollupDelta>,
  localDate: string,
  expense: ExpenseFacts,
  direction: bigint,
) {
  const delta = deltas.get(localDate) ?? {
    expenseCents: 0n,
    reserveFundedExpenseCents: 0n,
    budgetImpactExpenseCents: 0n,
  };

  delta.expenseCents += direction * expense.amountCents;
  delta.reserveFundedExpenseCents += direction * expense.reserveUsedCents;
  delta.budgetImpactExpenseCents += direction * getBudgetImpactCents(expense);

  deltas.set(localDate, delta);
}

export type BudgetImpactChange = {
  localDate: string;
  budgetImpactDeltaCents: bigint;
};

/**
 * Moves an expense's money between daily budget rollups. Pure rollup
 * bookkeeping: returns the days whose budget impact changed so the Reserve
 * account can correct any of them that are already closed.
 */
export async function applyExpenseDelta(
  ctx: MutationCtx,
  { householdId, before, after, now }: ApplyExpenseDeltaArgs,
): Promise<BudgetImpactChange[]> {
  const deltas = new Map<string, RollupDelta>();
  const changes: BudgetImpactChange[] = [];

  if (before) {
    addDelta(deltas, before.localDate, before, -1n);
  }

  if (after) {
    addDelta(deltas, after.localDate, after, 1n);
  }

  for (const [localDate, delta] of deltas) {
    if (
      delta.expenseCents === 0n &&
      delta.reserveFundedExpenseCents === 0n &&
      delta.budgetImpactExpenseCents === 0n
    ) {
      continue;
    }

    const rollup = await ctx.db
      .query("dailyBudgetRollups")
      .withIndex("by_household_and_local_date", (q) =>
        q.eq("householdId", householdId).eq("localDate", localDate),
      )
      .unique();

    const next = {
      expenseCents: (rollup?.expenseCents ?? 0n) + delta.expenseCents,
      reserveFundedExpenseCents:
        (rollup?.reserveFundedExpenseCents ?? 0n) + delta.reserveFundedExpenseCents,
      budgetImpactExpenseCents:
        (rollup?.budgetImpactExpenseCents ?? 0n) + delta.budgetImpactExpenseCents,
    };

    if (
      next.expenseCents < 0n ||
      next.reserveFundedExpenseCents < 0n ||
      next.budgetImpactExpenseCents < 0n
    ) {
      throw new Error("Daily budget rollup cannot go below zero");
    }

    if (rollup) {
      await ctx.db.patch("dailyBudgetRollups", rollup._id, { ...next, updatedAt: now });
    } else {
      await ctx.db.insert("dailyBudgetRollups", {
        householdId,
        localDate,
        ...next,
        updatedAt: now,
      });
    }

    if (delta.budgetImpactExpenseCents !== 0n) {
      changes.push({ localDate, budgetImpactDeltaCents: delta.budgetImpactExpenseCents });
    }
  }

  return changes;
}
