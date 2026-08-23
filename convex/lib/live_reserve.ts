import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getEffectiveTimeZone } from "../households";
import { getLocalDateKey } from "./want_reserve";

type DatabaseCtx = MutationCtx | QueryCtx;

export type CurrentReserveProjection = {
  availableCents: bigint;
  recoveryCents: bigint;
  todayOverageAdjustmentCents: bigint;
  projectedEndOfDayContributionCents: bigint;
};

export type CurrentReserveSnapshot = CurrentReserveProjection & {
  state: Doc<"goalReserveStates"> | null;
  timeZone: string;
  localDate: string;
  dailyAllowanceCents: bigint;
  positionCents: bigint;
  budgetImpactExpenseCents: bigint;
};

export function projectCurrentReserve(
  positionCents: bigint,
  allowanceCents: bigint,
  budgetImpactExpenseCents: bigint,
): CurrentReserveProjection {
  // Today's overspending consumes accumulated reserve immediately, but unused
  // allowance is not added until the day closes.
  const todayOverageAdjustmentCents =
    budgetImpactExpenseCents > allowanceCents ? allowanceCents - budgetImpactExpenseCents : 0n;
  const projectedEndOfDayContributionCents =
    budgetImpactExpenseCents <= allowanceCents ? allowanceCents - budgetImpactExpenseCents : 0n;
  const currentAdjustedBalanceCents = positionCents + todayOverageAdjustmentCents;

  return {
    availableCents: currentAdjustedBalanceCents > 0n ? currentAdjustedBalanceCents : 0n,
    recoveryCents: currentAdjustedBalanceCents < 0n ? -currentAdjustedBalanceCents : 0n,
    todayOverageAdjustmentCents,
    projectedEndOfDayContributionCents,
  };
}

export async function getCurrentReserveSnapshot(
  ctx: DatabaseCtx,
  household: Doc<"households">,
  now: number,
): Promise<CurrentReserveSnapshot> {
  if (household.allowanceCents === undefined) {
    throw new Error("Household money migration is still in progress");
  }

  const timeZone = getEffectiveTimeZone(household, now);
  const localDate = getLocalDateKey(now, timeZone);
  const [state, currentDayRollup] = await Promise.all([
    ctx.db
      .query("goalReserveStates")
      .withIndex("by_household", (q) => q.eq("householdId", household._id))
      .unique(),
    ctx.db
      .query("dailyBudgetRollups")
      .withIndex("by_household_and_local_date", (q) =>
        q.eq("householdId", household._id).eq("localDate", localDate),
      )
      .unique(),
  ]);
  const positionCents = state?.positionCents ?? 0n;
  const budgetImpactExpenseCents = currentDayRollup?.budgetImpactExpenseCents ?? 0n;

  return {
    state,
    timeZone,
    localDate,
    dailyAllowanceCents: household.allowanceCents,
    positionCents,
    budgetImpactExpenseCents,
    ...projectCurrentReserve(positionCents, household.allowanceCents, budgetImpactExpenseCents),
  };
}
