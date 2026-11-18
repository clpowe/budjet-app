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
 * Owns every write to goalReserveStates and dailyBudgetRollups, plus the
 * money fields of expenses. The reserve is one balance (`positionCents`) and a
 * close cursor; daily rollups hold each day's spending.
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
  | { kind: "purchase"; reserveUsedCents: bigint }
  | { kind: "purchase_undo"; reserveUsedCents: bigint }
  | {
      kind: "purchase_correction";
      previousReserveUsedCents: bigint;
      nextReserveUsedCents: bigint;
    }
  | { kind: "closed_day_correction"; budgetImpactDeltaCents: bigint };

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

/** Daily budget rollups in a local-date range of at most 31 days (a month to date). */
export async function listReserveActivity(
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
 * Sum of the positive daily-close contributions for the closed days in a
 * local-date range: each closed day adds `max(0, allowance − budget impact)`.
 * A closed day without a rollup had no spending and adds the full allowance.
 * Uses the current allowance for every day (the allowance cannot change yet).
 */
export function sumClosedPositiveContributions({
  rollups,
  allowanceCents,
  state,
  startLocalDate,
  endExclusiveLocalDate,
  timeZone,
}: {
  rollups: readonly Pick<Doc<"dailyBudgetRollups">, "localDate" | "budgetImpactExpenseCents">[];
  allowanceCents: bigint;
  state: Pick<Doc<"goalReserveStates">, "firstEligibleLocalDate" | "lastClosedLocalDate"> | null;
  startLocalDate: string;
  endExclusiveLocalDate: string;
  timeZone: string;
}): bigint {
  const lastClosedLocalDate = state?.lastClosedLocalDate;

  if (!state || lastClosedLocalDate === undefined) {
    return 0n;
  }

  const budgetImpactByDate = new Map(
    rollups.map((rollup) => [rollup.localDate, rollup.budgetImpactExpenseCents]),
  );
  let localDate =
    startLocalDate > state.firstEligibleLocalDate ? startLocalDate : state.firstEligibleLocalDate;
  let totalCents = 0n;
  let dayCount = 0;

  while (localDate < endExclusiveLocalDate && localDate <= lastClosedLocalDate) {
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
// Position writes (internal)
// ---------------------------------------------------------------------------

/** The household plus its reserve state, kept current in memory across writes. */
type LoadedAccount = {
  household: Doc<"households">;
  state: Doc<"goalReserveStates"> | null;
};

/** Moves the reserve position by one event and keeps `account.state` current. */
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
  { before, after, now }: { before?: ExpenseFacts; after?: ExpenseFacts; now: number },
): Promise<void> {
  const changes = await applyExpenseDelta(ctx, {
    householdId: account.household._id,
    before,
    after,
    now,
  });

  for (const change of changes) {
    if (!isClosedDay(account.state, change.localDate)) {
      continue;
    }

    await applyEvent(
      ctx,
      account,
      { kind: "closed_day_correction", budgetImpactDeltaCents: change.budgetImpactDeltaCents },
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
  { household, now }: { household: Doc<"households">; now: number },
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
    const rollup = await loadRollup(ctx, household._id, nextLocalDate);

    await applyEvent(
      ctx,
      account,
      {
        kind: "daily_close",
        localDate: nextLocalDate,
        allowanceCents,
        spendingCents: rollup?.budgetImpactExpenseCents ?? 0n,
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

/** A day is closed once the close cursor has passed it. Days before the first eligible day never close. */
function isClosedDay(state: Doc<"goalReserveStates"> | null, localDate: string): boolean {
  return (
    state !== null &&
    state.lastClosedLocalDate !== undefined &&
    localDate >= state.firstEligibleLocalDate &&
    localDate <= state.lastClosedLocalDate
  );
}

/**
 * Records a purchase of a planned Want: inserts the linked expense, funds it
 * from the reserve first, and books it against `localDate`.
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
    { kind: "purchase", reserveUsedCents: funding.reserveUsedCents },
    now,
  );
  await moveExpenseMoney(ctx, account, {
    after: { localDate, amountCents, reserveUsedCents: funding.reserveUsedCents },
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
    expense,
    amountCents,
    now,
  }: {
    household: Doc<"households">;
    expense: Doc<"expenses">;
    amountCents: bigint;
    now: number;
  },
): Promise<ReserveResult<PurchaseFunding>> {
  assertPositiveCents(amountCents, "Actual amount");
  assertLinkedPurchase(expense);

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
  const purchaseDayIsClosed = isClosedDay(state, before.localDate);
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
      previousReserveUsedCents: before.reserveUsedCents,
      nextReserveUsedCents: funding.reserveUsedCents,
    },
    now,
  );
  await moveExpenseMoney(ctx, account, { before, after, now });

  return { status: "ok", ...funding };
}

/** Removes a purchase's expense and returns its reserve funding. */
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
): Promise<ReserveResult> {
  assertLinkedPurchase(expense);

  const account = await openCurrentAccount(ctx, household, now);

  if (!account) {
    return SYNCING;
  }

  requireActiveState(account);
  const before = toExpenseFacts(expense, getEffectiveTimeZone(account.household, now));

  await moveExpenseMoney(ctx, account, { before, now });
  await applyEvent(
    ctx,
    account,
    { kind: "purchase_undo", reserveUsedCents: before.reserveUsedCents },
    now,
  );
  await ctx.db.delete("expenses", expense._id);

  return { status: "ok" };
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

function assertExpenseFields(fields: ExpenseFields, now: number, timeZone: string): string {
  assertPositiveExpenseAmount(fields.amountCents);
  const localDate = getLocalDateKey(fields.date, timeZone);
  assertExpenseDayIsNotFuture(localDate, now, timeZone);
  return localDate;
}

function assertPositiveExpenseAmount(amountCents: bigint): void {
  if (amountCents <= 0n) {
    throw new Error("Expense amount must be greater than zero");
  }
}

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
    now,
  });

  return { status: "ok", expenseId };
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
): Promise<ReserveResult> {
  assertEverydayExpense(expense);
  assertPositiveExpenseAmount(fields.amountCents);
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

  const account = await openCurrentAccount(ctx, household, now);

  if (!account) {
    return SYNCING;
  }

  await ctx.db.patch("expenses", expense._id, {
    name: fields.name,
    notes: fields.notes,
    amount: centsToLegacyDollars(fields.amountCents),
    amountCents: fields.amountCents,
    date,
    localDate,
  });

  await moveExpenseMoney(ctx, account, {
    before,
    after: { localDate, amountCents: fields.amountCents, reserveUsedCents: 0n },
    now,
  });

  return { status: "ok" };
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
): Promise<ReserveResult> {
  assertEverydayExpense(expense);

  const account = await openCurrentAccount(ctx, household, now);

  if (!account) {
    return SYNCING;
  }

  await moveExpenseMoney(ctx, account, {
    before: toExpenseFacts(expense, getEffectiveTimeZone(account.household, now)),
    now,
  });
  await ctx.db.delete("expenses", expense._id);

  return { status: "ok" };
}

export function centsToLegacyDollars(amountCents: bigint): number {
  return Number(amountCents) / 100;
}
