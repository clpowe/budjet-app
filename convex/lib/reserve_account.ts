import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getEffectiveTimeZone, getStoredHouseholdTimeZone } from "../households";
import {
  applyExpenseDelta,
  getBudgetImpactCents,
  toExpenseFacts,
  type ExpenseFacts,
} from "./daily_budget_rollups";
import {
  calculatePurchaseFunding,
  getLocalDateKey,
  getLocalDayBounds,
  getNextLocalDate,
} from "./want_reserve";

/*
 * Reserve account: the one module that moves household money.
 *
 * Owns every write to goalReserveStates, goalReserveLedgerEntries,
 * goalReserveDays and dailyBudgetRollups, plus the money fields of expenses.
 * Every write first closes pending reserve days, so it always acts on a
 * current position. When the catch-up cannot finish in one transaction the
 * write does nothing, schedules the rest, and returns `reserve_syncing`.
 */

type DatabaseCtx = MutationCtx | QueryCtx;

export const CLOSE_DAYS_PER_TRANSACTION = 31;

export type ReserveSyncing = { status: "reserve_syncing" };
export type ReserveResult<T extends object = object> = ReserveSyncing | ({ status: "ok" } & T);

export type PurchaseFunding = {
  reserveUsedCents: bigint;
  budgetImpactCents: bigint;
};

// ---------------------------------------------------------------------------
// Pure core (internal seam, unit-tested directly)
// ---------------------------------------------------------------------------

export type ReserveEvent =
  | {
      kind: "daily_close";
      localDate: string;
      allowanceCents: bigint;
      spendingCents: bigint;
    }
  | {
      kind: "purchase";
      localDate: string;
      reserveUsedCents: bigint;
      expenseId: Id<"expenses">;
      wantItemId: Id<"wantItems">;
      actorId: Id<"users">;
    }
  | {
      kind: "purchase_undo";
      localDate: string;
      reserveUsedCents: bigint;
      expenseId: Id<"expenses">;
      wantItemId: Id<"wantItems">;
      actorId: Id<"users">;
    }
  | {
      kind: "purchase_correction";
      localDate: string;
      previousReserveUsedCents: bigint;
      nextReserveUsedCents: bigint;
      expenseId: Id<"expenses">;
      wantItemId: Id<"wantItems">;
      actorId: Id<"users">;
    }
  | {
      kind: "closed_day_correction";
      localDate: string;
      budgetImpactDeltaCents: bigint;
      expenseId: Id<"expenses">;
      actorId: Id<"users">;
    };

type ReserveTransition = {
  amountCents: bigint;
  positionCents: bigint;
  lastClosedLocalDate?: string;
};

function assertNonNegativeCents(value: bigint, label: string): void {
  if (value < 0n) {
    throw new Error(`${label} cannot be negative`);
  }
}

function assertPositiveCents(value: bigint, label: string): void {
  if (value <= 0n) {
    throw new Error(`${label} must be greater than zero`);
  }
}

export function reduceReserveEvent(
  state: Doc<"goalReserveStates">,
  event: ReserveEvent,
): ReserveTransition {
  let amountCents: bigint;

  switch (event.kind) {
    case "daily_close": {
      assertNonNegativeCents(event.allowanceCents, "Allowance");
      assertNonNegativeCents(event.spendingCents, "Spending");

      if (event.localDate < state.firstEligibleLocalDate) {
        throw new Error("Cannot close a reserve day before the first eligible date");
      }

      if (state.lastClosedLocalDate !== undefined && event.localDate <= state.lastClosedLocalDate) {
        throw new Error("Reserve days must close after the recorded close cursor");
      }

      amountCents = event.allowanceCents - event.spendingCents;
      break;
    }
    case "purchase": {
      assertNonNegativeCents(event.reserveUsedCents, "Reserve used");
      amountCents = -event.reserveUsedCents;
      break;
    }
    case "purchase_undo": {
      assertNonNegativeCents(event.reserveUsedCents, "Reserve used");
      amountCents = event.reserveUsedCents;
      break;
    }
    case "purchase_correction": {
      assertNonNegativeCents(event.previousReserveUsedCents, "Previous reserve used");
      assertNonNegativeCents(event.nextReserveUsedCents, "Next reserve used");
      amountCents = event.previousReserveUsedCents - event.nextReserveUsedCents;
      break;
    }
    case "closed_day_correction": {
      amountCents = -event.budgetImpactDeltaCents;
      break;
    }
  }

  return {
    amountCents,
    positionCents: state.positionCents + amountCents,
    ...(event.kind === "daily_close" ? { lastClosedLocalDate: event.localDate } : {}),
  };
}

export type CurrentReserveProjection = {
  availableCents: bigint;
  recoveryCents: bigint;
  todayOverageAdjustmentCents: bigint;
  projectedEndOfDayContributionCents: bigint;
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

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type ReserveSnapshot = CurrentReserveProjection & {
  state: Doc<"goalReserveStates"> | null;
  timeZone: string;
  localDate: string;
  dailyAllowanceCents: bigint;
  positionCents: bigint;
  budgetImpactExpenseCents: bigint;
};

async function loadState(
  ctx: DatabaseCtx,
  householdId: Id<"households">,
): Promise<Doc<"goalReserveStates"> | null> {
  return await ctx.db
    .query("goalReserveStates")
    .withIndex("by_household", (q) => q.eq("householdId", householdId))
    .unique();
}

async function loadRollup(ctx: DatabaseCtx, householdId: Id<"households">, localDate: string) {
  return await ctx.db
    .query("dailyBudgetRollups")
    .withIndex("by_household_and_local_date", (q) =>
      q.eq("householdId", householdId).eq("localDate", localDate),
    )
    .unique();
}

async function loadReserveDay(ctx: DatabaseCtx, householdId: Id<"households">, localDate: string) {
  return await ctx.db
    .query("goalReserveDays")
    .withIndex("by_household_and_local_date", (q) =>
      q.eq("householdId", householdId).eq("localDate", localDate),
    )
    .unique();
}

function requireAllowanceCents(household: Doc<"households">): bigint {
  if (household.allowanceCents === undefined) {
    throw new Error("Household money migration is still in progress");
  }

  return household.allowanceCents;
}

async function projectSnapshot(
  ctx: DatabaseCtx,
  household: Doc<"households">,
  state: Doc<"goalReserveStates"> | null,
  now: number,
): Promise<ReserveSnapshot> {
  const dailyAllowanceCents = requireAllowanceCents(household);
  const timeZone = getEffectiveTimeZone(household, now);
  const localDate = getLocalDateKey(now, timeZone);
  const currentDayRollup = await loadRollup(ctx, household._id, localDate);
  const positionCents = state?.positionCents ?? 0n;
  const budgetImpactExpenseCents = currentDayRollup?.budgetImpactExpenseCents ?? 0n;

  return {
    state,
    timeZone,
    localDate,
    dailyAllowanceCents,
    positionCents,
    budgetImpactExpenseCents,
    ...projectCurrentReserve(positionCents, dailyAllowanceCents, budgetImpactExpenseCents),
  };
}

/** Live view of the reserve at `now`. Read-only; never closes days. */
export async function getReserveSnapshot(
  ctx: DatabaseCtx,
  household: Doc<"households">,
  now: number,
): Promise<ReserveSnapshot> {
  requireAllowanceCents(household);

  return await projectSnapshot(ctx, household, await loadState(ctx, household._id), now);
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

/**
 * Daily budget rollups and closed reserve days in a local-date range of at
 * most 31 days (a month to date).
 */
export async function listReserveActivity(
  ctx: DatabaseCtx,
  householdId: Id<"households">,
  {
    startLocalDate,
    endExclusiveLocalDate,
  }: { startLocalDate: string; endExclusiveLocalDate: string },
): Promise<{ rollups: Doc<"dailyBudgetRollups">[]; reserveDays: Doc<"goalReserveDays">[] }> {
  const [rollups, reserveDays] = await Promise.all([
    ctx.db
      .query("dailyBudgetRollups")
      .withIndex("by_household_and_local_date", (q) =>
        q
          .eq("householdId", householdId)
          .gte("localDate", startLocalDate)
          .lt("localDate", endExclusiveLocalDate),
      )
      .take(MAX_RANGE_DAYS + 1),
    ctx.db
      .query("goalReserveDays")
      .withIndex("by_household_and_local_date", (q) =>
        q
          .eq("householdId", householdId)
          .gte("localDate", startLocalDate)
          .lt("localDate", endExclusiveLocalDate),
      )
      .take(MAX_RANGE_DAYS + 1),
  ]);

  assertOneRowPerDay(rollups, "Daily budget rollups");
  assertOneRowPerDay(reserveDays, "Goal reserve days");

  return { rollups, reserveDays };
}

// ---------------------------------------------------------------------------
// Ledger writes (internal)
// ---------------------------------------------------------------------------

/** The household plus its reserve state, kept current in memory across writes. */
type LoadedAccount = {
  household: Doc<"households">;
  state: Doc<"goalReserveStates"> | null;
};

async function applyEvent(
  ctx: MutationCtx,
  account: LoadedAccount,
  event: ReserveEvent,
  now: number,
): Promise<void> {
  const state = account.state;

  if (!state) {
    throw new Error("Goal reserve is not active");
  }

  const transition = reduceReserveEvent(state, event);
  const commonLedgerFields = {
    householdId: state.householdId,
    amountCents: transition.amountCents,
    localDate: event.localDate,
    createdAt: now,
  };

  switch (event.kind) {
    case "daily_close":
      await ctx.db.insert("goalReserveLedgerEntries", {
        ...commonLedgerFields,
        kind: "daily_close",
        allowanceSnapshotCents: event.allowanceCents,
        spendingSnapshotCents: event.spendingCents,
      });
      break;
    case "purchase":
    case "purchase_undo":
      await ctx.db.insert("goalReserveLedgerEntries", {
        ...commonLedgerFields,
        kind: event.kind,
        sourceExpenseId: event.expenseId,
        wantItemId: event.wantItemId,
        actorId: event.actorId,
      });
      break;
    case "purchase_correction":
      await ctx.db.insert("goalReserveLedgerEntries", {
        ...commonLedgerFields,
        kind: "correction",
        sourceExpenseId: event.expenseId,
        wantItemId: event.wantItemId,
        actorId: event.actorId,
      });
      break;
    case "closed_day_correction": {
      const closedDay = await loadReserveDay(ctx, state.householdId, event.localDate);

      if (!closedDay) {
        throw new Error("Cannot correct a reserve day that has not been closed");
      }

      const spendingSnapshotCents = closedDay.spendingSnapshotCents + event.budgetImpactDeltaCents;
      assertNonNegativeCents(spendingSnapshotCents, "Closed-day spending");

      await ctx.db.patch("goalReserveDays", closedDay._id, {
        spendingSnapshotCents,
        contributionCents: closedDay.allowanceSnapshotCents - spendingSnapshotCents,
        updatedAt: now,
      });
      await ctx.db.insert("goalReserveLedgerEntries", {
        ...commonLedgerFields,
        kind: "correction",
        allowanceSnapshotCents: closedDay.allowanceSnapshotCents,
        spendingSnapshotCents,
        sourceExpenseId: event.expenseId,
        actorId: event.actorId,
      });
      break;
    }
  }

  const statePatch = {
    positionCents: transition.positionCents,
    ...(transition.lastClosedLocalDate !== undefined
      ? { lastClosedLocalDate: transition.lastClosedLocalDate }
      : {}),
    updatedAt: now,
  };

  await ctx.db.patch("goalReserveStates", state._id, statePatch);
  account.state = { ...state, ...statePatch };
}

/** Updates rollups for an expense change and corrects any closed day it touched. */
async function moveExpenseMoney(
  ctx: MutationCtx,
  account: LoadedAccount,
  {
    before,
    after,
    expenseId,
    actorId,
    now,
  }: {
    before?: ExpenseFacts;
    after?: ExpenseFacts;
    expenseId: Id<"expenses">;
    actorId: Id<"users">;
    now: number;
  },
): Promise<void> {
  const changes = await applyExpenseDelta(ctx, {
    householdId: account.household._id,
    before,
    after,
    now,
  });

  for (const change of changes) {
    const closedDay = await loadReserveDay(ctx, account.household._id, change.localDate);

    if (!closedDay) {
      continue;
    }

    if (!account.state) {
      throw new Error("Closed reserve day is missing its reserve state");
    }

    await applyEvent(
      ctx,
      account,
      {
        kind: "closed_day_correction",
        localDate: change.localDate,
        budgetImpactDeltaCents: change.budgetImpactDeltaCents,
        expenseId,
        actorId,
      },
      now,
    );
  }
}

// ---------------------------------------------------------------------------
// Activation and daily close
// ---------------------------------------------------------------------------

/** Starts the household's reserve. Idempotent. */
export async function activateReserve(
  ctx: MutationCtx,
  { household, actorId, now }: { household: Doc<"households">; actorId: Id<"users">; now: number },
): Promise<void> {
  if (await loadState(ctx, household._id)) {
    return;
  }

  const timeZone = getEffectiveTimeZone(household, now);
  const activationLocalDate = getLocalDateKey(now, timeZone);

  await ctx.db.insert("goalReserveStates", {
    householdId: household._id,
    positionCents: 0n,
    activatedAt: now,
    firstEligibleLocalDate: getNextLocalDate(activationLocalDate, timeZone),
    updatedAt: now,
  });
  await ctx.db.insert("goalReserveLedgerEntries", {
    householdId: household._id,
    kind: "activation",
    amountCents: 0n,
    localDate: activationLocalDate,
    actorId,
    createdAt: now,
  });
}

export type CloseDaysResult = { complete: boolean; lastClosedLocalDate?: string };

async function closeLoadedDays(
  ctx: MutationCtx,
  account: LoadedAccount,
  throughExclusiveTimestamp: number,
  maxDays: number,
): Promise<CloseDaysResult> {
  if (!Number.isFinite(throughExclusiveTimestamp)) {
    throw new Error("Closing timestamp must be finite");
  }

  if (!Number.isInteger(maxDays) || maxDays < 1) {
    throw new Error("Maximum closed days must be a positive integer");
  }

  const { household } = account;
  const reserveState = account.state;

  if (!reserveState) {
    return { complete: true };
  }

  const allowanceCents = requireAllowanceCents(household);
  // Days close in the stored zone; a pending zone only takes over once the
  // last day of the old zone has closed (promotion below).
  const timeZone = getStoredHouseholdTimeZone(household);
  const throughExclusiveLocalDate = getLocalDateKey(throughExclusiveTimestamp, timeZone);
  const maximumDays = Math.min(maxDays, CLOSE_DAYS_PER_TRANSACTION);

  let nextLocalDate = reserveState.lastClosedLocalDate
    ? getNextLocalDate(reserveState.lastClosedLocalDate, timeZone)
    : reserveState.firstEligibleLocalDate;
  let lastClosedLocalDate = reserveState.lastClosedLocalDate;
  let closedDayCount = 0;

  while (nextLocalDate < throughExclusiveLocalDate && closedDayCount < maximumDays) {
    if (await loadReserveDay(ctx, household._id, nextLocalDate)) {
      throw new Error("Reserve day already exists before the recorded close cursor");
    }

    const rollup = await loadRollup(ctx, household._id, nextLocalDate);
    const spendingSnapshotCents = rollup?.budgetImpactExpenseCents ?? 0n;

    await ctx.db.insert("goalReserveDays", {
      householdId: household._id,
      localDate: nextLocalDate,
      timeZone,
      allowanceSnapshotCents: allowanceCents,
      spendingSnapshotCents,
      contributionCents: allowanceCents - spendingSnapshotCents,
      closedAt: throughExclusiveTimestamp,
      updatedAt: throughExclusiveTimestamp,
    });

    await applyEvent(
      ctx,
      account,
      {
        kind: "daily_close",
        localDate: nextLocalDate,
        allowanceCents,
        spendingCents: spendingSnapshotCents,
      },
      throughExclusiveTimestamp,
    );

    lastClosedLocalDate = nextLocalDate;
    nextLocalDate = getNextLocalDate(nextLocalDate, timeZone);
    closedDayCount += 1;
  }

  if (
    household.pendingTimeZone !== undefined &&
    household.pendingTimeZoneEffectiveAt !== undefined &&
    throughExclusiveTimestamp >= household.pendingTimeZoneEffectiveAt
  ) {
    const finalOldTimeZoneDate = getLocalDateKey(
      household.pendingTimeZoneEffectiveAt - 1,
      timeZone,
    );

    if (lastClosedLocalDate !== undefined && lastClosedLocalDate >= finalOldTimeZoneDate) {
      const promotion = {
        timeZone: household.pendingTimeZone,
        pendingTimeZone: undefined,
        pendingTimeZoneEffectiveAt: undefined,
      };

      await ctx.db.patch("households", household._id, promotion);
      account.household = { ...household, ...promotion };
    }
  }

  return {
    complete: nextLocalDate >= throughExclusiveLocalDate,
    ...(lastClosedLocalDate !== undefined ? { lastClosedLocalDate } : {}),
  };
}

/**
 * Closes finished reserve days up to (not including) the local day that
 * contains `throughExclusiveTimestamp`, at most `maxDays` per call.
 */
export async function closeReserveDays(
  ctx: MutationCtx,
  {
    householdId,
    throughExclusiveTimestamp,
    maxDays,
  }: { householdId: Id<"households">; throughExclusiveTimestamp: number; maxDays: number },
): Promise<CloseDaysResult> {
  const household = await ctx.db.get("households", householdId);

  if (!household) {
    throw new Error("Household not found");
  }

  const account: LoadedAccount = { household, state: await loadState(ctx, householdId) };

  return await closeLoadedDays(ctx, account, throughExclusiveTimestamp, maxDays);
}

/**
 * Loads the account and closes pending days. Returns null (after scheduling
 * the rest of the catch-up for this household) when it could not finish.
 */
async function openCurrentAccount(
  ctx: MutationCtx,
  household: Doc<"households">,
  now: number,
): Promise<LoadedAccount | null> {
  const account: LoadedAccount = { household, state: await loadState(ctx, household._id) };
  const result = await closeLoadedDays(ctx, account, now, CLOSE_DAYS_PER_TRANSACTION);

  if (!result.complete) {
    await ctx.scheduler.runAfter(0, internal.reserveMaintenance.closeThrough, {
      householdId: household._id,
      throughExclusiveTimestamp: now,
      maxDays: CLOSE_DAYS_PER_TRANSACTION,
    });

    return null;
  }

  return account;
}

const SYNCING: ReserveSyncing = { status: "reserve_syncing" };

function requireActiveState(account: LoadedAccount): Doc<"goalReserveStates"> {
  if (!account.state) {
    throw new Error("Goal reserve is not active");
  }

  return account.state;
}

// ---------------------------------------------------------------------------
// Want purchases
// ---------------------------------------------------------------------------

/**
 * Records a purchase of a planned Want: inserts the linked expense, funds it
 * from the reserve first, and books it against `localDate`.
 */
export async function recordPurchase(
  ctx: MutationCtx,
  {
    household,
    actorId,
    want,
    amountCents,
    localDate,
    now,
  }: {
    household: Doc<"households">;
    actorId: Id<"users">;
    want: Doc<"wantItems">;
    amountCents: bigint;
    localDate: string;
    now: number;
  },
): Promise<ReserveResult<PurchaseFunding & { expenseId: Id<"expenses"> }>> {
  assertPositiveCents(amountCents, "Actual amount");

  const preCloseTimeZone = getEffectiveTimeZone(household, now);
  // Validation only: throws on a malformed date or an invalid time zone.
  getLocalDayBounds(localDate, preCloseTimeZone);

  if (localDate > getLocalDateKey(now, preCloseTimeZone)) {
    throw new Error("Purchase date cannot be in the future");
  }

  const account = await openCurrentAccount(ctx, household, now);

  if (!account) {
    return SYNCING;
  }

  requireActiveState(account);
  const snapshot = await projectSnapshot(ctx, account.household, account.state, now);

  if (localDate > snapshot.localDate) {
    throw new Error("Purchase date cannot be in the future");
  }

  const { startTimestamp } = getLocalDayBounds(localDate, snapshot.timeZone);
  const funding = calculatePurchaseFunding(amountCents, snapshot.availableCents);

  const expenseId = await ctx.db.insert("expenses", {
    householdId: household._id,
    name: want.name,
    notes: want.notes,
    amount: centsToLegacyDollars(amountCents),
    amountCents,
    date: startTimestamp,
    localDate,
    wantItemId: want._id,
    reserveUsedCents: funding.reserveUsedCents,
  });

  await applyEvent(
    ctx,
    account,
    {
      kind: "purchase",
      localDate,
      reserveUsedCents: funding.reserveUsedCents,
      expenseId,
      wantItemId: want._id,
      actorId,
    },
    now,
  );
  await moveExpenseMoney(ctx, account, {
    after: { localDate, amountCents, reserveUsedCents: funding.reserveUsedCents },
    expenseId,
    actorId,
    now,
  });

  return { status: "ok", expenseId, ...funding };
}

/**
 * Changes a purchase's amount. Funding is recomputed from the reserve that
 * would be available now had the original purchase never happened.
 */
export async function correctPurchase(
  ctx: MutationCtx,
  {
    household,
    actorId,
    expense,
    amountCents,
    now,
  }: {
    household: Doc<"households">;
    actorId: Id<"users">;
    expense: Doc<"expenses">;
    amountCents: bigint;
    now: number;
  },
): Promise<ReserveResult<PurchaseFunding>> {
  assertPositiveCents(amountCents, "Actual amount");
  const wantItemId = requireLinkedWant(expense);

  const account = await openCurrentAccount(ctx, household, now);

  if (!account) {
    return SYNCING;
  }

  const state = requireActiveState(account);
  const allowanceCents = requireAllowanceCents(account.household);
  const timeZone = getEffectiveTimeZone(account.household, now);
  const before = toExpenseFacts(expense, timeZone);
  const previousBudgetImpactCents = getBudgetImpactCents(before);
  const currentLocalDate = getLocalDateKey(now, timeZone);

  // Reverse the original purchase in memory. Every past day is closed at this
  // point, so its budget impact is either in a closed day's contribution or
  // in today's rollup (or neither, before the reserve's first eligible day).
  const purchaseDayIsClosed = (await loadReserveDay(ctx, household._id, before.localDate)) !== null;
  const positionWithoutPurchaseCents =
    state.positionCents +
    before.reserveUsedCents +
    (purchaseDayIsClosed ? previousBudgetImpactCents : 0n);
  const todayRollup = await loadRollup(ctx, household._id, currentLocalDate);
  const todayBudgetWithoutPurchaseCents =
    (todayRollup?.budgetImpactExpenseCents ?? 0n) -
    (before.localDate === currentLocalDate ? previousBudgetImpactCents : 0n);

  if (todayBudgetWithoutPurchaseCents < 0n) {
    throw new Error("Current-day budget rollup is inconsistent");
  }

  const funding = calculatePurchaseFunding(
    amountCents,
    projectCurrentReserve(
      positionWithoutPurchaseCents,
      allowanceCents,
      todayBudgetWithoutPurchaseCents,
    ).availableCents,
  );
  const after: ExpenseFacts = {
    localDate: before.localDate,
    amountCents,
    reserveUsedCents: funding.reserveUsedCents,
  };

  await ctx.db.patch("expenses", expense._id, {
    amount: centsToLegacyDollars(amountCents),
    amountCents,
    reserveUsedCents: funding.reserveUsedCents,
    localDate: before.localDate,
  });

  await applyEvent(
    ctx,
    account,
    {
      kind: "purchase_correction",
      localDate: before.localDate,
      previousReserveUsedCents: before.reserveUsedCents,
      nextReserveUsedCents: funding.reserveUsedCents,
      expenseId: expense._id,
      wantItemId,
      actorId,
    },
    now,
  );
  await moveExpenseMoney(ctx, account, { before, after, expenseId: expense._id, actorId, now });

  return { status: "ok", ...funding };
}

/** Removes a purchase's expense and returns its reserve funding. */
export async function undoPurchase(
  ctx: MutationCtx,
  {
    household,
    actorId,
    expense,
    now,
  }: {
    household: Doc<"households">;
    actorId: Id<"users">;
    expense: Doc<"expenses">;
    now: number;
  },
): Promise<ReserveResult> {
  const wantItemId = requireLinkedWant(expense);

  const account = await openCurrentAccount(ctx, household, now);

  if (!account) {
    return SYNCING;
  }

  requireActiveState(account);
  const before = toExpenseFacts(expense, getEffectiveTimeZone(account.household, now));

  await moveExpenseMoney(ctx, account, { before, expenseId: expense._id, actorId, now });
  await applyEvent(
    ctx,
    account,
    {
      kind: "purchase_undo",
      localDate: before.localDate,
      reserveUsedCents: before.reserveUsedCents,
      expenseId: expense._id,
      wantItemId,
      actorId,
    },
    now,
  );
  await ctx.db.delete("expenses", expense._id);

  return { status: "ok" };
}

function requireLinkedWant(expense: Doc<"expenses">): Id<"wantItems"> {
  if (!expense.wantItemId) {
    throw new Error("Expense is not a Want purchase");
  }

  if (expense.amountCents === undefined) {
    throw new Error("Linked purchase is missing its cent-valued amount");
  }

  return expense.wantItemId;
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

function assertExpenseFields(fields: ExpenseFields, now: number, timeZone: string): string {
  if (fields.amountCents <= 0n) {
    throw new Error("Expense amount must be greater than zero");
  }

  const localDate = getLocalDateKey(fields.date, timeZone);

  if (localDate > getLocalDateKey(now, timeZone)) {
    throw new Error("Expense date cannot be in the future");
  }

  return localDate;
}

function assertEverydayExpense(expense: Doc<"expenses">): void {
  if (expense.wantItemId) {
    throw new Error("Want purchases must be managed from the wants flow");
  }
}

export async function addExpense(
  ctx: MutationCtx,
  {
    household,
    actorId,
    fields,
    now,
  }: { household: Doc<"households">; actorId: Id<"users">; fields: ExpenseFields; now: number },
): Promise<ReserveResult<{ expenseId: Id<"expenses"> }>> {
  assertExpenseFields(fields, now, getEffectiveTimeZone(household, now));

  const account = await openCurrentAccount(ctx, household, now);

  if (!account) {
    return SYNCING;
  }

  const localDate = assertExpenseFields(fields, now, getEffectiveTimeZone(account.household, now));
  const expenseId = await ctx.db.insert("expenses", {
    householdId: household._id,
    name: fields.name,
    notes: fields.notes,
    amount: centsToLegacyDollars(fields.amountCents),
    amountCents: fields.amountCents,
    date: fields.date,
    localDate,
  });

  await moveExpenseMoney(ctx, account, {
    after: { localDate, amountCents: fields.amountCents, reserveUsedCents: 0n },
    expenseId,
    actorId,
    now,
  });

  return { status: "ok", expenseId };
}

export async function editExpense(
  ctx: MutationCtx,
  {
    household,
    actorId,
    expense,
    fields,
    now,
  }: {
    household: Doc<"households">;
    actorId: Id<"users">;
    expense: Doc<"expenses">;
    fields: ExpenseFields;
    now: number;
  },
): Promise<ReserveResult> {
  assertEverydayExpense(expense);
  assertExpenseFields(fields, now, getEffectiveTimeZone(household, now));

  const account = await openCurrentAccount(ctx, household, now);

  if (!account) {
    return SYNCING;
  }

  const timeZone = getEffectiveTimeZone(account.household, now);
  const movedLocalDate = assertExpenseFields(fields, now, timeZone);
  const before = toExpenseFacts(expense, timeZone);
  // Keeping the timestamp keeps the day it was recorded against; moving it
  // re-keys it in today's effective zone.
  const localDate = fields.date === expense.date ? before.localDate : movedLocalDate;

  await ctx.db.patch("expenses", expense._id, {
    name: fields.name,
    notes: fields.notes,
    amount: centsToLegacyDollars(fields.amountCents),
    amountCents: fields.amountCents,
    date: fields.date,
    localDate,
  });

  await moveExpenseMoney(ctx, account, {
    before,
    after: { localDate, amountCents: fields.amountCents, reserveUsedCents: 0n },
    expenseId: expense._id,
    actorId,
    now,
  });

  return { status: "ok" };
}

export async function removeExpense(
  ctx: MutationCtx,
  {
    household,
    actorId,
    expense,
    now,
  }: {
    household: Doc<"households">;
    actorId: Id<"users">;
    expense: Doc<"expenses">;
    now: number;
  },
): Promise<ReserveResult> {
  assertEverydayExpense(expense);

  const account = await openCurrentAccount(ctx, household, now);

  if (!account) {
    return SYNCING;
  }

  await moveExpenseMoney(ctx, account, {
    before: toExpenseFacts(expense, getEffectiveTimeZone(account.household, now)),
    expenseId: expense._id,
    actorId,
    now,
  });
  await ctx.db.delete("expenses", expense._id);

  return { status: "ok" };
}

export function centsToLegacyDollars(amountCents: bigint): number {
  return Number(amountCents) / 100;
}
