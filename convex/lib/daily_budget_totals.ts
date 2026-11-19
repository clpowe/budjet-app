import { assertPositiveCents } from "../../shared/utils/money-cents";
import { budgetImpact } from "../../shared/utils/savings";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type ExpenseFacts = {
  /** Household-local day the expense counts against, fixed when it was written. */
  localDate: string;
  amountCents: bigint;
  fromSavingsCents: bigint;
};

export function toExpenseFacts(
  expense: Pick<Doc<"expenses">, "amountCents" | "localDate" | "fromSavingsCents">,
): ExpenseFacts {
  return {
    localDate: expense.localDate,
    amountCents: expense.amountCents,
    fromSavingsCents: expense.fromSavingsCents ?? 0n,
  };
}

type ApplyExpenseDeltaArgs = {
  householdId: Id<"households">;
  before?: ExpenseFacts;
  after?: ExpenseFacts;
  now: number;
};

type TotalsDelta = {
  totalSpentCents: bigint;
  spentFromSavingsCents: bigint;
};

function addDelta(
  deltas: Map<string, TotalsDelta>,
  expense: ExpenseFacts,
  direction: bigint,
): void {
  assertPositiveCents(expense.amountCents, "Expense amount");
  // Throws unless the savings part is between zero and the amount.
  budgetImpact(expense.amountCents, expense.fromSavingsCents);

  const delta = deltas.get(expense.localDate) ?? { totalSpentCents: 0n, spentFromSavingsCents: 0n };

  delta.totalSpentCents += direction * expense.amountCents;
  delta.spentFromSavingsCents += direction * expense.fromSavingsCents;

  deltas.set(expense.localDate, delta);
}

/**
 * Moves an expense's money between the daily budget totals: subtracts `before`
 * from its day and adds `after` to its day.
 */
export async function applyExpenseDelta(
  ctx: MutationCtx,
  { householdId, before, after, now }: ApplyExpenseDeltaArgs,
): Promise<void> {
  const deltas = new Map<string, TotalsDelta>();

  if (before) {
    addDelta(deltas, before, -1n);
  }

  if (after) {
    addDelta(deltas, after, 1n);
  }

  for (const [localDate, delta] of deltas) {
    if (delta.totalSpentCents === 0n && delta.spentFromSavingsCents === 0n) {
      continue;
    }

    const totals = await ctx.db
      .query("dailyBudgetTotals")
      .withIndex("by_household_and_local_date", (q) =>
        q.eq("householdId", householdId).eq("localDate", localDate),
      )
      .unique();

    const next = {
      totalSpentCents: (totals?.totalSpentCents ?? 0n) + delta.totalSpentCents,
      spentFromSavingsCents: (totals?.spentFromSavingsCents ?? 0n) + delta.spentFromSavingsCents,
    };

    if (
      next.totalSpentCents < 0n ||
      next.spentFromSavingsCents < 0n ||
      next.spentFromSavingsCents > next.totalSpentCents
    ) {
      throw new Error("Daily budget totals cannot go below zero");
    }

    if (totals) {
      await ctx.db.patch("dailyBudgetTotals", totals._id, { ...next, updatedAt: now });
    } else {
      await ctx.db.insert("dailyBudgetTotals", { householdId, localDate, ...next, updatedAt: now });
    }
  }
}
