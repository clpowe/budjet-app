import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { applyReserveEvent } from "../reserve";
import { getLocalDateKey } from "./want_reserve";

export type ExpenseFacts = {
  date: number;
  amountCents: bigint;
  reserveUsedCents: bigint;
};

type ApplyExpenseDeltaArgs = {
  householdId: Id<"households">;
  timeZone: string;
  before?: ExpenseFacts;
  after?: ExpenseFacts;
  now: number;
  actorId: Id<"users">;
  sourceExpenseId: Id<"expenses">;
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

export function getBudgetImpactCents(expense: ExpenseFacts): bigint {
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

export async function applyExpenseDelta(
  ctx: MutationCtx,
  { householdId, timeZone, before, after, now, actorId, sourceExpenseId }: ApplyExpenseDeltaArgs,
): Promise<void> {
  const deltas = new Map<string, RollupDelta>();

  if (before) {
    addDelta(deltas, getLocalDateKey(before.date, timeZone), before, -1n);
  }

  if (after) {
    addDelta(deltas, getLocalDateKey(after.date, timeZone), after, 1n);
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

    if (rollup) {
      await ctx.db.patch(rollup._id, {
        expenseCents: rollup.expenseCents + delta.expenseCents,
        reserveFundedExpenseCents:
          rollup.reserveFundedExpenseCents + delta.reserveFundedExpenseCents,
        budgetImpactExpenseCents: rollup.budgetImpactExpenseCents + delta.budgetImpactExpenseCents,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("dailyBudgetRollups", {
        householdId,
        localDate,
        expenseCents: delta.expenseCents,
        reserveFundedExpenseCents: delta.reserveFundedExpenseCents,
        budgetImpactExpenseCents: delta.budgetImpactExpenseCents,
        updatedAt: now,
      });
    }

    if (delta.budgetImpactExpenseCents === 0n) {
      continue;
    }

    const closedDay = await ctx.db
      .query("goalReserveDays")
      .withIndex("by_household_and_local_date", (q) =>
        q.eq("householdId", householdId).eq("localDate", localDate),
      )
      .unique();

    if (!closedDay) {
      continue;
    }

    const reserveState = await ctx.db
      .query("goalReserveStates")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .unique();

    if (!reserveState) {
      throw new Error("Closed reserve day is missing its reserve state");
    }

    await applyReserveEvent(
      ctx,
      reserveState,
      {
        kind: "closed_day_correction",
        localDate,
        budgetImpactDeltaCents: delta.budgetImpactExpenseCents,
        expenseId: sourceExpenseId,
        actorId,
      },
      now,
    );
  }
}
