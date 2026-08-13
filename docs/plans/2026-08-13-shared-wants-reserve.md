# Shared Wants and Goal Reserve Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a household-shared Wants queue whose multi-month reserve rises and falls with daily spending, funds purchases transparently, and keeps the ordinary budget accurate.

**Architecture:** Convex owns want items, integer-cent daily rollups, a signed reserve ledger, a cached household reserve position, daily closing, and atomic purchases. One idempotent `closeDaysThrough` service is shared by the scheduled closer and purchase catch-up. Nuxt pages remain thin orchestration layers over a focused `useWantList` composable and small presentational components; Cloudflare Workers continues to host the client-rendered Nuxt output without new persistence bindings.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Convex, Better Auth, TanStack Vue Form, Vue Draggable Plus, FormKit Tempo, Vite+/Vitest, Nuxt Test Utils, Tailwind CSS/DaisyUI, Cloudflare Workers/Wrangler.

---

## Required guidance

- Read `convex/_generated/ai/guidelines.md` before every task that edits `convex/`.
- Apply `@vue-nuxt-patterns`: pages orchestrate, `useWantList` owns feature data flow, and child components remain presentation-focused.
- Apply `@cloudflare` only at the deployment boundary; do not add KV, D1, R2, Durable Objects, or Worker APIs for this feature.
- Preserve unrelated user changes. Run `git status --short` before every commit and stage only files from the current task.
- Use `vp` commands (`vp install`, `vp exec`, `vp check`, `vp test`, `vp build`) rather than package-manager aliases.
- Generated files under `convex/_generated/` are changed only by `vp exec convex codegen`.

## Domain invariants

Keep these invariants visible while implementing:

1. Every durable or calculated money value in this feature is integer cents represented as `bigint` and stored with `v.int64()`. Names end in `Cents`. Decimal strings are parsed once at an input/legacy-data boundary; finance code never adds, subtracts, or allocates floating-point dollars.
2. The persisted reserve is one signed household `positionCents`; item allocations are derived, never persisted.
3. The exact sum of `goalReserveLedgerEntries.amountCents` for a household equals `goalReserveStates.positionCents`. Every mutation updates the entry and cached position transactionally.
4. Available reserve is `max(positionCents + liveNegativeAdjustmentCents, 0n)`.
5. Today can reduce funded progress immediately, but positive progress is not credited until the day closes.
6. A purchase records the full expense and a signed reserve withdrawal in one mutation.
7. `budgetImpactCents = amountCents - reserveUsedCents` for ordinary spending views.
8. Reordering contains every active item exactly once and never changes the reserve position.
9. All authorization derives household membership from `ctx.auth`; clients never authorize by sending a household or user ID.
10. Public mutations capture `Date.now()` server-side exactly once. Client-supplied time is allowed only on read-only summary/preview queries for cache determinism and is never passed into a write helper.
11. The cron and purchase paths call the same idempotent `closeDaysThrough()` helper. A `goalReserveDays` row is the uniqueness guard for one finalized contribution per household/local date.
12. The first eligible reserve day is the first full household-local day after activation, avoiding partial-day retroactive spending.

## Safe-to-spend ground truth

Preserve the existing product's fixed 30-day allowance contract while centralizing it on the server. For the current calendar-month window:

```text
planAllowanceCents = household.allowanceCents * 30n

budgetImpactExpenseCents =
  sum(expense.amountCents - (expense.reserveUsedCents ?? 0n))

currentPlanSetAsideCents =
  sum(max(goalReserveDay.contributionCents, 0n))
  for eligible closed days in the current calendar-month window

safeToSpendCents =
  planAllowanceCents
  - budgetImpactExpenseCents
  - currentPlanSetAsideCents
```

This is not a double subtraction. Ordinary expense totals still include unspent allowance, so the positive finalized amount moved into the reserve must be removed from freely spendable money exactly once. A reserve-funded purchase has its funded portion removed from `budgetImpactExpenseCents`; its originating positive daily set-aside remains counted in the month in which it was earned. Reserve brought forward from an earlier month is not subtracted from the current month, so spending that older reserve does not create a current-month spike.

Negative daily contributions are not subtracted again: the overspending that caused them is already present in `budgetImpactExpenseCents`. Corrections patch the single `goalReserveDays.contributionCents` value, so `currentPlanSetAsideCents` uses the corrected per-day result rather than the gross sum of historical positive ledger entries. Today's potential reserve is not included until close. Today's spending already reduces safe-to-spend through expenses, so its live negative reserve adjustment affects goal progress only and is not applied to safe-to-spend a second time.

### Task 1: Add the Convex test project and reserve schema

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `vitest.config.ts`
- Modify: `convex/schema.ts`
- Modify: `convex/households.ts`
- Create: `convex/schema.test.ts`
- Regenerate: `convex/_generated/dataModel.d.ts`
- Regenerate: `convex/_generated/api.d.ts`

**Step 1: Install the Convex test runtime**

Run:

```bash
vp install -D convex-test @edge-runtime/vm
```

Expected: both packages appear in `devDependencies`; the lockfile updates without replacing unrelated versions.

**Step 2: Register an edge-runtime test project**

Add a third project to `vitest.config.ts`:

```ts
{
  test: {
    name: "convex",
    include: ["convex/**/*.test.ts"],
    environment: "edge-runtime",
  },
},
```

**Step 3: Write the failing schema smoke test**

Create `convex/schema.test.ts` with `import.meta.glob("./**/*.ts")`, initialize `convexTest(schema, modules)`, and assert that a seeded household can contain `timeZone: "America/New_York"`, pending timezone fields, and integer-cent allowance data. Assert that a `wantItems` document accepts `estimatedCostCents: 10_000n` with `status: "considering"`.

Use fixed IDs only through `t.run`, not type casts that bypass schema validation.

**Step 4: Run the test and verify it fails**

Run:

```bash
vp test --run --project convex convex/schema.test.ts
```

Expected: FAIL because the new fields and tables do not exist.

**Step 5: Extend the schema**

Keep the existing floating-dollar fields temporarily for compatibility, but add integer-cent source-of-truth fields. Legacy floats are converted exactly once by the Task 6 migration and never enter reserve arithmetic directly.

Add these optional fields to `households`:

```ts
allowanceCents: v.optional(v.int64()),
timeZone: v.optional(v.string()),
pendingTimeZone: v.optional(v.string()),
pendingTimeZoneEffectiveAt: v.optional(v.number()),
moneyMigrationCompletedAt: v.optional(v.number()),
```

Add integer-cent purchase metadata to `expenses`:

```ts
amountCents: v.optional(v.int64()),
wantItemId: v.optional(v.id("wantItems")),
reserveUsedCents: v.optional(v.int64()),
```

Add these tables and indexes:

```ts
wantItems: defineTable({
  householdId: v.id("households"),
  name: v.string(),
  estimatedCostCents: v.int64(),
  priority: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
  targetDate: v.optional(v.number()),
  notes: v.string(),
  status: v.union(
    v.literal("considering"),
    v.literal("plan_for_it"),
    v.literal("not_now"),
    v.literal("bought"),
  ),
  order: v.optional(v.number()),
  createdBy: v.id("users"),
  updatedBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
  purchasedBy: v.optional(v.id("users")),
  purchasedAt: v.optional(v.number()),
  expenseId: v.optional(v.id("expenses")),
})
  .index("by_household_and_status", ["householdId", "status"])
  .index("by_household_and_status_and_order", ["householdId", "status", "order"]),

goalReserveStates: defineTable({
  householdId: v.id("households"),
  positionCents: v.int64(),
  activatedAt: v.number(),
  firstEligibleLocalDate: v.string(),
  lastClosedLocalDate: v.optional(v.string()),
  updatedAt: v.number(),
}).index("by_household", ["householdId"]),

goalReserveLedgerEntries: defineTable({
  householdId: v.id("households"),
  kind: v.union(
    v.literal("activation"),
    v.literal("daily_close"),
    v.literal("correction"),
    v.literal("purchase"),
    v.literal("purchase_undo"),
  ),
  amountCents: v.int64(),
  localDate: v.string(),
  allowanceSnapshotCents: v.optional(v.int64()),
  spendingSnapshotCents: v.optional(v.int64()),
  sourceExpenseId: v.optional(v.id("expenses")),
  wantItemId: v.optional(v.id("wantItems")),
  actorId: v.optional(v.id("users")),
  createdAt: v.number(),
})
  .index("by_household_and_local_date", ["householdId", "localDate"])
  .index("by_source_expense", ["sourceExpenseId"]),

goalReserveDays: defineTable({
  householdId: v.id("households"),
  localDate: v.string(),
  timeZone: v.string(),
  allowanceSnapshotCents: v.int64(),
  spendingSnapshotCents: v.int64(),
  contributionCents: v.int64(),
  closedAt: v.number(),
  updatedAt: v.number(),
}).index("by_household_and_local_date", ["householdId", "localDate"]),

dailyBudgetRollups: defineTable({
  householdId: v.id("households"),
  localDate: v.string(),
  expenseCents: v.int64(),
  reserveFundedExpenseCents: v.int64(),
  budgetImpactExpenseCents: v.int64(),
  updatedAt: v.number(),
}).index("by_household_and_local_date", ["householdId", "localDate"]),
```

All collection table names are plural. `goalReserveDays` and `dailyBudgetRollups` guarantee exact calendar-range summaries with at most one row per household/local date; screens never scan an arbitrary number of transactions or ledger entries.

**Step 6: Default household timezone and regenerate types**

Change `createHousehold` to accept an optional validated `timeZone`, default to `America/New_York`, and persist it with `allowanceCents`. Validate with a small `isValidTimeZone` helper rather than trusting arbitrary strings. New households set `moneyMigrationCompletedAt` immediately because their writes start in cents.

Run:

```bash
vp exec convex codegen
vp test --run --project convex convex/schema.test.ts
```

Expected: codegen succeeds and the schema test passes.

**Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts convex/schema.ts convex/households.ts convex/schema.test.ts convex/_generated
git commit -m "feat: add wants reserve schema"
```

### Task 2: Implement and test pure reserve calculations

**Files:**

- Create: `convex/lib/want-reserve.ts`
- Create: `shared/utils/money-cents.ts`
- Create: `tests/unit/want-reserve.test.ts`
- Create: `tests/unit/money-cents.test.ts`

**Step 1: Write allocation and purchase tests**

Cover:

```ts
expect(
  allocateReserve(15_000n, [
    { id: "camera", estimatedCostCents: 10_000n },
    { id: "trip", estimatedCostCents: 8_000n },
  ]),
).toEqual([
  { id: "camera", allocatedCents: 10_000n, remainingCents: 0n },
  { id: "trip", allocatedCents: 5_000n, remainingCents: 3_000n },
]);

expect(allocateReserve(-1_200n, [{ id: "camera", estimatedCostCents: 10_000n }])[0]).toMatchObject({
  allocatedCents: 0n,
  remainingCents: 10_000n,
});

expect(calculatePurchaseFunding(12_000n, 10_000n)).toEqual({
  reserveUsedCents: 10_000n,
  budgetImpactCents: 2_000n,
});
```

Also test duplicate/missing reorder IDs, zero/negative costs, lower-item impact previews, and exact allocation of one-cent remainders over hundreds of operations.

**Step 2: Write money-boundary tests**

Define one conversion contract in `shared/utils/money-cents.ts`:

```ts
type Cents = bigint;

parseMoneyToCents("140.05") === 14_005n;
formatCents(14_005n) === "$140.05";
legacyDollarsToCents(0.1 + 0.2) === 30n;
```

`parseMoneyToCents` accepts a normalized decimal string with at most two fractional digits and rejects exponent notation, `NaN`, infinities, extra precision, negatives where the caller requires positive money, and values outside signed 64-bit cents. `legacyDollarsToCents` is the only compatibility quantizer for existing `v.number()` dollars and uses `Math.round(value * 100)` once at migration/read boundaries. `formatCents` is display-only. Never convert cents back to floating dollars for arithmetic.

**Step 3: Write timezone and forecast tests**

Test local date keys and day windows on the 2026 New York DST transitions, the next full day after activation, target-date daily pace, and recent positive contribution pace. Pass `now` explicitly; do not read the wall clock inside pure functions.

**Step 4: Run tests and verify failure**

```bash
vp test --run --project unit tests/unit/money-cents.test.ts tests/unit/want-reserve.test.ts
```

Expected: FAIL because the money and reserve helpers are missing.

**Step 5: Implement minimal pure helpers**

Export narrowly typed helpers:

```ts
allocateReserve(positionCents, items);
getReorderUpdates(currentIds, requestedIds);
calculatePurchaseFunding(actualAmountCents, availableReserveCents);
calculateLowerItemImpact(allocationsBefore, reserveUsedCents);
getBudgetImpact(amountCents, reserveUsedCents);
getLocalDateKey(timestamp, timeZone);
getLocalDayBounds(localDate, timeZone);
getNextLocalDate(localDate, timeZone);
calculateTargetDailyAmount(remaining, targetDate, today, timeZone);
calculateRecentPace(contributions);
```

Use `@formkit/tempo` only inside day-boundary helpers; keep allocation and finance helpers dependency-free. All finance helper parameters and results use `bigint` cents. Reject zero/negative inputs where the operation requires positive money.

**Step 6: Run tests**

```bash
vp test --run --project unit tests/unit/money-cents.test.ts tests/unit/want-reserve.test.ts
```

Expected: PASS.

**Step 7: Commit**

```bash
git add convex/lib/want-reserve.ts shared/utils/money-cents.ts tests/unit/money-cents.test.ts tests/unit/want-reserve.test.ts
git commit -m "test: define wants reserve accounting"
```

### Task 3: Add household-authorized item queries and mutations

**Files:**

- Create: `convex/wants.ts`
- Create: `convex/wants.test.ts`
- Modify: `convex/lib/want-reserve.ts`
- Regenerate: `convex/_generated/api.d.ts`

**Step 1: Write failing Convex tests**

Using `convex-test`, seed two households and authenticated users. Test:

- `create` trims names/notes, requires positive `estimatedCostCents`, and records the actor.
- `list` returns bounded sections and orders active items by `order`.
- A member can edit an item in their household.
- A member cannot read or mutate another household's item.
- Moving to `plan_for_it` appends to the queue.
- Moving to `considering` or `not_now` removes queue order.
- `reorder` rejects duplicates, missing IDs, and stale active lists.
- Priority and target date do not affect queue order.

**Step 2: Run and verify failure**

```bash
vp test --run --project convex convex/wants.test.ts
```

Expected: FAIL because `api.wants` is absent.

**Step 3: Implement validators and bounded queries**

Define shared validators once and derive mutation argument shapes. Use `getAuthenticatedUser(ctx)` and the user's stored `householdId` for every operation.

The active queue has an enforced product limit `MAX_ACTIVE_WANTS = 100`; the mutation refuses a 101st active item with constructive guidance to move one to Considering or Not now. The active query therefore uses `.take(MAX_ACTIVE_WANTS + 1)` as an invariant check, not an arbitrary data-loss cap. Considering, Not now, and Bought use cursor pagination with page size 25.

Return a stable view model:

```ts
{
  active: WantItem[],
  considering: WantItem[],
  notNow: WantItem[],
  bought: WantItem[],
}
```

Return pagination cursors for inactive sections. Never silently omit active items.

**Step 4: Implement atomic status and reorder mutations**

For `reorder`, load the current household active IDs, pass both lists to `getReorderUpdates`, then patch consecutive `order` values in one mutation.

Do not implement reserve activation in this task. Task 4 adds it to the already-tested status transition.

**Step 5: Regenerate and run tests**

```bash
vp exec convex codegen
vp test --run --project convex convex/wants.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add convex/wants.ts convex/wants.test.ts convex/lib/want-reserve.ts convex/_generated/api.d.ts
git commit -m "feat: add shared wants queue"
```

### Task 4: Add effective household timezone settings

**Files:**

- Modify: `convex/households.ts`
- Create: `convex/households.test.ts`
- Modify: `app/composables/use-date.ts`
- Modify: `app/composables/use-households.ts`
- Modify: `app/pages/household.vue`
- Modify: `app/components/expenses/add.vue`
- Modify: `app/components/expenses/edit.vue`
- Modify: `app/components/spending/edit.vue`
- Create: `tests/unit/use-date.test.ts`
- Create: `tests/nuxt/household-timezone.test.ts`

**Step 1: Write failing backend timezone tests**

Test valid IANA zones, invalid strings, owner-only changes, server-owned mutation time, and replacement of a still-pending timezone. Existing households without a timezone resolve to `America/New_York`.

The schema contract is settled in Task 1:

```ts
timeZone: v.optional(v.string()),
pendingTimeZone: v.optional(v.string()),
pendingTimeZoneEffectiveAt: v.optional(v.number()),
```

`pendingTimeZoneEffectiveAt` is the next midnight in the currently effective timezone, computed from one server `Date.now()` captured by the mutation. Before that timestamp all calculations use `timeZone`; at and after it they use `pendingTimeZone`. A closing mutation promotes the pending values after closing the final old-timezone day.

**Step 2: Write failing frontend date tests**

Test that `useDate` accepts the household timezone as an explicit/ref input and generates labels and transaction timestamps in that zone. Remove hard-coded Eastern Time from transaction entry and edit paths.

**Step 3: Run and verify failure**

```bash
vp test --run --project convex convex/households.test.ts
vp test --run --project unit tests/unit/use-date.test.ts
vp test --run --project nuxt tests/nuxt/household-timezone.test.ts
```

Expected: FAIL because effective timezone behavior and shared date handling do not exist.

**Step 4: Implement backend setting and resolver**

Add `updateTimeZone({ timeZone })`; it accepts no `now`. Validate the zone, require household ownership, capture `Date.now()` inside the handler, and persist both pending fields. Export pure `getEffectiveTimeZone(household, at)` and boundary helpers for closing logic. If another change arrives before the boundary, replace the pending zone while retaining the already-established effective timestamp.

**Step 5: Implement UI and shared date source**

Expose effective and pending timezone state from `useHousehold`. Add a labeled timezone selector for owners and read-only explanatory text for members. Prefer `Intl.supportedValuesOf("timeZone")` with a safe fallback list.

Use the shared timezone in transaction date parsing/formatting and page labels. Keep browser-only API access inside client setup because Nuxt is currently `ssr: false`, while retaining deterministic inputs for tests.

**Step 6: Run tests and commit**

```bash
vp exec convex codegen
vp test --run --project convex convex/households.test.ts
vp test --run --project unit tests/unit/use-date.test.ts
vp test --run --project nuxt tests/nuxt/household-timezone.test.ts
git add convex/households.ts convex/households.test.ts convex/_generated app/composables/use-date.ts app/composables/use-households.ts app/pages/household.vue app/components/expenses/add.vue app/components/expenses/edit.vue app/components/spending/edit.vue tests/unit/use-date.test.ts tests/nuxt/household-timezone.test.ts
git commit -m "feat: add household budget timezone"
```

### Task 5: Refactor ordinary expense mutations and maintain daily rollups

**Files:**

- Modify: `convex/expenses.ts`
- Create: `convex/expenses.test.ts`
- Create: `convex/lib/daily-budget-rollups.ts`
- Modify: `app/components/expenses/add.vue`
- Modify: `app/components/expenses/edit.vue`
- Modify: `app/components/spending/edit.vue`
- Modify: `tests/unit/use-expenses.test.ts`
- Regenerate: `convex/_generated/api.d.ts`

**Step 1: Write failing expense authorization and cents tests**

Cover:

- `createExpense` no longer accepts `householdId`; it derives household membership server-side.
- Create/update write exact `amountCents` and keep legacy `amount` only as a display-compatibility mirror.
- Update/delete validate that the expense belongs to the authenticated household.
- Moving an expense between days updates both daily rollups atomically.
- Generic update/delete rejects an expense linked to a want purchase.
- An unauthenticated or cross-household user cannot change a rollup.

**Step 2: Write failing rollup and closed-day correction tests**

For create, update, move, and delete, assert that the unique `dailyBudgetRollups` row contains exact `expenseCents`, `reserveFundedExpenseCents`, and `budgetImpactExpenseCents`. Seed a `goalReserveDays` row and reserve state, then assert that editing a closed day:

- Patches the day's `spendingSnapshotCents` and `contributionCents`.
- Inserts exactly one signed `correction` ledger entry.
- Applies that exact delta to `positionCents` in the same transaction.
- Maintains `sum(ledger entries) === positionCents`.

**Step 3: Run and verify failure**

```bash
vp test --run --project convex convex/expenses.test.ts
```

Expected: FAIL because authorized cent writes, rollups, and correction hooks are absent.

**Step 4: Refactor expense mutations**

Refactor `createExpense`, `updateExpense`, and `deleteExpense` to derive household authorization server-side and remove the client `householdId` argument. Mutation arguments use `amountCents: v.int64()`. The compatibility `amount` mirror is derived from cents, never used for finance calculations, and can be removed in a later migration.

Update the existing number-based expense add/edit components to call the single compatibility quantizer `legacyDollarsToCents` immediately before sending `amountCents`. No floating value crosses the mutation boundary. The new Wants form in Task 11 uses stricter decimal-string parsing because it does not have a legacy model to preserve.

**Step 5: Implement transactional rollup and correction hooks**

Create one `applyExpenseDelta` helper that receives before/after cent-valued expense facts. It upserts the affected `dailyBudgetRollups` rows and, if a `goalReserveDays` row exists, applies the exact correction to the day, ledger, and cached reserve. Moving dates calls it once for removal and once for addition inside the same mutation.

This task deliberately does not add cron infrastructure or close new days.

**Step 6: Run tests**

```bash
vp exec convex codegen
vp test --run --project convex convex/expenses.test.ts
vp test --run --project unit tests/unit/use-expenses.test.ts
```

Expected: PASS, including updated frontend expectations for the new cents argument and removal of `householdId`.

**Step 7: Commit**

```bash
git add convex/expenses.ts convex/expenses.test.ts convex/lib/daily-budget-rollups.ts convex/_generated/api.d.ts app/components/expenses/add.vue app/components/expenses/edit.vue app/components/spending/edit.vue tests/unit/use-expenses.test.ts
git commit -m "refactor: secure expense writes in integer cents"
```

### Task 6: Backfill legacy money into exact daily rollups

**Files:**

- Create: `convex/migrations/backfillMoney.ts`
- Create: `convex/migrations/backfillMoney.test.ts`
- Modify: `convex/lib/daily-budget-rollups.ts`
- Modify: `convex/wants.ts`
- Regenerate: `convex/_generated/api.d.ts`

**Step 1: Write failing bounded-migration tests**

Seed legacy household allowance and expense dollar floats, including `0.1 + 0.2`, multiple local days, and enough documents to cross a pagination boundary. Assert that migration:

- Converts each value once with `legacyDollarsToCents`.
- Creates exact daily rollups in the effective household timezone.
- Is resumable and idempotent.
- Never increments a rollup twice on retry.
- Marks `moneyMigrationCompletedAt` only after all household expenses are converted.
- Leaves the existing legacy fields in place for compatibility.

Test that moving the first item to `plan_for_it` returns a `money_migration_pending` result for an existing household until migration completes; it must not activate a reserve from partial rollups.

**Step 2: Run and verify failure**

```bash
vp test --run --project convex convex/migrations/backfillMoney.test.ts
```

Expected: FAIL because the migration does not exist.

**Step 3: Implement resumable migration**

Implement internal paginated mutations with explicit constants:

```ts
const HOUSEHOLDS_PER_BATCH = 10;
const EXPENSES_PER_BATCH = 100;
```

Each expense gets `amountCents` before its value is applied to an idempotent per-household/day rollup rebuild. Prefer rebuilding one day's rollup from migrated rows and replacing it over incrementing uncertain prior state. Continuations use explicit household and expense cursors.

Expose an internal/admin start function; do not make migration control public to browsers. Status transitions can schedule the household migration and return a typed pending response.

**Step 4: Run tests and commit**

```bash
vp exec convex codegen
vp test --run --project convex convex/migrations/backfillMoney.test.ts convex/expenses.test.ts
git add convex/migrations/backfillMoney.ts convex/migrations/backfillMoney.test.ts convex/lib/daily-budget-rollups.ts convex/wants.ts convex/_generated/api.d.ts
git commit -m "feat: backfill exact household money rollups"
```

### Task 7: Activate the reserve and expose the household summary

**Files:**

- Create: `convex/reserve.ts`
- Create: `convex/reserve.test.ts`
- Modify: `convex/wants.ts`
- Regenerate: `convex/_generated/api.d.ts`

**Step 1: Write failing activation tests**

Test that the first transition to `plan_for_it`:

- Requires completed money migration.
- Creates exactly one `goalReserveStates` row at `positionCents: 0n`.
- Adds one zero-cent activation ledger entry.
- Sets `firstEligibleLocalDate` to the next full local day in the effective timezone.
- Does not import earlier monthly surplus.
- Remains idempotent when two items are planned.

Test that reserve state persists when no active items remain.

**Step 2: Write failing summary tests**

The public summary query accepts a client-supplied `now` timestamp only as an untrusted read/cache key and returns integer cents:

```ts
{
  positionCents: bigint,
  availableReserveCents: bigint,
  recoveryAmountCents: bigint,
  liveNegativeAdjustmentCents: bigint,
  potentialTonightCents: bigint,
  activeAllocations: Array<{
    itemId: Id<"wantItems">,
    allocatedCents: bigint,
    remainingCents: bigint,
    progressBasisPoints: number,
  }>,
  topItem: null | TopItemSummary,
}
```

Assert that current-day underspending is potential only and spending above allowance reduces visible progress immediately. The summary reads the unique current-day `dailyBudgetRollups` row, so its cost is constant regardless of transaction count.

**Step 3: Run and verify failure**

```bash
vp test --run --project convex convex/reserve.test.ts
```

Expected: FAIL because reserve functions do not exist.

**Step 4: Implement activation and summary**

Create internal activation helpers that receive a server-captured timestamp from their public mutation caller. The status mutation captures `Date.now()` inside the handler; it accepts no client time.

Keep the public summary read-only and pass the client `now` only into pure presentation calculations. It cannot close a day, promote a timezone, alter availability persisted for purchase, or call a mutation helper.

**Step 5: Wire activation into status changes**

The transition mutation in `convex/wants.ts` invokes reserve activation in the same transaction when the target status is `plan_for_it`.

**Step 6: Run tests and commit**

```bash
vp exec convex codegen
vp test --run --project convex convex/reserve.test.ts convex/wants.test.ts
git add convex/reserve.ts convex/reserve.test.ts convex/wants.ts convex/_generated/api.d.ts
git commit -m "feat: activate household goal reserve"
```

### Task 8: Close household days through one idempotent service

**Files:**

- Create: `convex/reserveMaintenance.ts`
- Create: `convex/crons.ts`
- Create: `convex/reserveMaintenance.test.ts`
- Modify: `convex/reserve.ts`
- Modify: `convex/households.ts`
- Regenerate: `convex/_generated/api.d.ts`

**Step 1: Write failing `closeDaysThrough` tests**

Cover:

- A 5_000-cent allowance and 3_000-cent budget-impact rollup records `+2_000n`.
- A 5_500-cent rollup records `-500n`.
- Several days carry the signed position exactly across a month boundary.
- The activation day is skipped and the next full day is eligible.
- Allowance cents and effective timezone are snapshotted into `goalReserveDays` and the ledger.
- Re-running through the same boundary is a no-op.
- Running two closers against the same day still produces one `goalReserveDays` row, one `daily_close` ledger entry, and one position change.
- A pending timezone activates only after the final old-timezone day closes, then is promoted on the household.

Write the test against one exported internal service API so both cron and later purchase tests exercise the same implementation.

**Step 2: Run and verify failure**

```bash
vp test --run --project convex convex/reserveMaintenance.test.ts
```

Expected: FAIL because daily closing is absent.

**Step 3: Implement the single close service**

Implement:

```ts
closeDaysThrough(ctx, {
  householdId,
  throughExclusiveTimestamp,
  maxDays,
}): Promise<{ complete: boolean; lastClosedLocalDate?: string }>
```

The caller supplies a timestamp captured server-side. The helper reads daily budget rollups, closes at most `CLOSE_DAYS_PER_TRANSACTION = 31`, and uses a unique `goalReserveDays` lookup before inserting. The day row, ledger entry, and cached position update occur in the same mutation. Convex transaction conflicts make a cron/purchase race retry against the already-created day row, yielding a no-op instead of a second credit.

If more than 31 days remain, return `complete: false`; do not perform an unbounded catch-up. The caller schedules continuation. The service also promotes an effective pending timezone only after closing the last old-timezone day.

**Step 4: Add the bounded scheduled orchestrator**

The cron handler captures `const serverNow = Date.now()` once, paginates `goalReserveStates` with `HOUSEHOLDS_PER_BATCH = 25`, and calls `closeDaysThrough` for each household. Schedule cursor continuation when households or days remain.

Register only the internal orchestrator:

```ts
crons.interval(
  "close household goal reserve days",
  { hours: 1 },
  internal.reserveMaintenance.closeEligibleDays,
  { cursor: null },
);
```

**Step 5: Run tests**

```bash
vp exec convex codegen
vp test --run --project convex convex/reserveMaintenance.test.ts convex/reserve.test.ts
```

Expected: PASS, including the cron/purchase-style idempotence test.

**Step 6: Commit**

```bash
git add convex/reserveMaintenance.ts convex/crons.ts convex/reserveMaintenance.test.ts convex/reserve.ts convex/households.ts convex/_generated/api.d.ts
git commit -m "feat: close household reserve days idempotently"
```

### Task 9: Implement atomic purchase, correction, and undo

**Files:**

- Modify: `convex/wants.ts`
- Modify: `convex/reserve.ts`
- Modify: `convex/expenses.ts`
- Modify: `convex/reserveMaintenance.ts`
- Create: `convex/purchases.test.ts`
- Regenerate: `convex/_generated/api.d.ts`

**Step 1: Write failing purchase tests**

Cover these exact cent-valued scenarios:

| Estimate cents | Actual cents | Available reserve cents | Reserve used cents | Budget impact cents |
| -------------: | -----------: | ----------------------: | -----------------: | ------------------: |
|         10,000 |       10,000 |                  10,000 |             10,000 |                   0 |
|         10,000 |       12,000 |                  10,000 |             10,000 |               2,000 |
|         10,000 |       12,000 |                  15,000 |             12,000 |                   0 |
|         10,000 |       12,000 |                       0 |                  0 |              12,000 |

Also assert that:

- The expense, purchase ledger entry, reserve state, Bought item, and daily budget rollup commit together.
- Reserve use can consume the next item's displayed allocation.
- A stale preview does not control the mutation; the server recalculates current state.
- Concurrent purchase attempts cannot spend the same reserve twice.
- Another household cannot purchase the item.
- Passing a future-looking client `now` is impossible because no purchase mutation accepts it.
- A purchase racing the hourly closer closes a day once and credits it once.

**Step 2: Write failing correction and undo tests**

Correction recalculates exact reserve use against the original purchase without creating a second expense. Undo deletes the linked expense, adds a reversing `purchase_undo` entry, restores the item to the bottom of `plan_for_it`, reverses its daily rollup delta, and preserves `sum(ledger entries) === positionCents`.

**Step 3: Run and verify failure**

```bash
vp test --run --project convex convex/purchases.test.ts
```

Expected: FAIL because purchase functions are absent.

**Step 4: Implement read-only preview and server-timed purchase**

Expose `previewPurchase({ itemId, actualAmountCents, now })` as a read-only query returning reserve use, ordinary budget impact, and lower-item progress loss. Its client time is advisory and cannot call write helpers.

Implement `purchase({ itemId, actualAmountCents, purchaseLocalDate })` as one mutation. It accepts no `now` and no arbitrary timestamp. Capture `const serverNow = Date.now()` inside the handler, reject a purchase local date after the server's effective household-local date, and call the same `closeDaysThrough` from Task 8.

If `closeDaysThrough` returns `complete: false`, commit only the bounded catch-up and schedule continuation; return `{ status: "reserve_syncing" }` without creating the purchase. The UI can retry after reactive state catches up. When complete, re-read availability, insert the cent-valued expense and negative purchase ledger entry, update the rollup/reserve/item, and normalize the queue in one transaction.

**Step 5: Implement dedicated correction and undo**

Do not expose linked purchase changes through `expenses.updateExpense` or `deleteExpense`. Provide `correctPurchase` and `undoPurchase`; neither accepts `now`. Both capture server time, use explicit validators, update rollups, and write audit entries transactionally.

**Step 6: Run tests and commit**

```bash
vp exec convex codegen
vp test --run --project convex convex/purchases.test.ts convex/reserveMaintenance.test.ts convex/reserve.test.ts convex/wants.test.ts
git add convex/wants.ts convex/reserve.ts convex/expenses.ts convex/reserveMaintenance.ts convex/purchases.test.ts convex/_generated/api.d.ts
git commit -m "feat: fund want purchases from reserve"
```

### Task 10: Centralize the exact safe-to-spend summary and ledger markers

**Files:**

- Create: `convex/budget.ts`
- Create: `convex/budget.test.ts`
- Modify: `convex/expenses.ts`
- Modify: `app/composables/use-expenses.ts`
- Modify: `app/pages/home.vue`
- Modify: `app/pages/monthly.vue`
- Modify: `app/components/spending/list.vue`
- Modify: `tests/unit/use-expenses.test.ts`
- Modify: `tests/nuxt/spending-list.test.ts`

**Step 1: Write failing formula tests before the query**

Encode the **Safe-to-spend ground truth** section verbatim in table-driven tests. At minimum:

| Scenario                                  | Plan allowance | Budget-impact expenses | Corrected positive set-asides | Safe to spend |
| ----------------------------------------- | -------------: | ---------------------: | ----------------------------: | ------------: |
| $30 spent and $20 saved today after close |        150,000 |                  3,000 |                         2,000 |       145,000 |
| Same $20 reserve spent this month         |        150,000 |                  3,000 |                         2,000 |       145,000 |
| $20 prior-month reserve spent this month  |        150,000 |                      0 |                             0 |       150,000 |
| $120 purchase, $100 prior reserve         |        150,000 |                  2,000 |                             0 |       148,000 |
| Closed day corrected from +$20 to -$5     |        150,000 |                  5,500 |                             0 |       144,500 |

All table values are cents. Also assert that current-day live negative adjustment is not subtracted from safe-to-spend a second time.

**Step 2: Write failing query tests**

Test `api.budget.getHomeSummary` with explicit calendar-month bounds and fixed query `now`. Verify it reads:

- `dailyBudgetRollups` for exact expense totals.
- `goalReserveDays` for corrected positive set-asides.
- `goalReserveStates` for reserve display.

The month queries use `.take(32)`: at most 31 valid local dates plus one sentinel. This is a domain-derived invariant cap independent of transaction volume. A 32nd row means duplicate/corrupt rollups and should produce an invariant error; normal high-volume households never fail due to transaction count.

**Step 3: Run and verify failure**

```bash
vp test --run --project convex convex/budget.test.ts
```

Expected: FAIL because the explicit formula and summary query are absent.

**Step 4: Implement the formula and summary**

Implement a pure `calculateSafeToSpendCents` matching the written equation exactly. Return one server-owned summary containing safe-to-spend, reserved amount, potential tonight, spent totals, pace metrics, and compact top-item summary. Do not scan transactions or ledger entries for screen totals.

Update monthly transaction mapping to include:

```ts
reserveUsedCents: expense.reserveUsedCents ?? 0n,
budgetImpactCents: getBudgetImpact(expense.amountCents, expense.reserveUsedCents ?? 0n),
isWantPurchase: expense.wantItemId !== undefined,
```

**Step 5: Migrate frontend consumers**

Make `useExpenses` consume the centralized summary instead of recomputing safe-to-spend. Replace Home's local `leftToSpend` formula. In monthly and spending ledgers, show a Want purchase marker and the three-value breakdown when reserve was used. Convert cents only for display through `formatCents`.

**Step 6: Run tests and commit**

```bash
vp exec convex codegen
vp test --run --project convex convex/budget.test.ts
vp test --run --project unit tests/unit/use-expenses.test.ts
vp test --run --project nuxt tests/nuxt/spending-list.test.ts
git add convex/budget.ts convex/budget.test.ts convex/expenses.ts convex/_generated/api.d.ts app/composables/use-expenses.ts app/pages/home.vue app/pages/monthly.vue app/components/spending/list.vue tests/unit/use-expenses.test.ts tests/nuxt/spending-list.test.ts
git commit -m "feat: centralize exact reserve budget accounting"
```

### Task 11: Build the Wants composable and item form

**Files:**

- Create: `app/composables/use-want-list.ts`
- Create: `app/components/wants/form.vue`
- Create: `tests/unit/use-want-list.test.ts`
- Create: `tests/nuxt/wants-form.test.ts`

**Step 1: Write failing composable tests**

Mock one `api.wants.list` query, one reserve summary query, and focused mutations. Assert the composable exposes a small stable contract:

```ts
{
  sections,
  summary,
  isLoading,
  createItem,
  updateItem,
  changeStatus,
  reorder,
  previewPurchase,
  purchase,
  correctPurchase,
  undoPurchase,
}
```

Mutation methods return `{ success, error? }` with user-safe fallback messages and do not hide network calls behind computed properties.

**Step 2: Write failing form tests**

Test required name, exact decimal-string-to-cents conversion, rejection of more than two fractional digits, required priority, optional date/notes, disabled/pending state, external mutation error, and emitted `estimatedCostCents` values.

**Step 3: Run and verify failure**

```bash
vp test --run --project unit tests/unit/use-want-list.test.ts
vp test --run --project nuxt tests/nuxt/wants-form.test.ts
```

Expected: FAIL because the composable and form are missing.

**Step 4: Implement the thin composable**

Use one obvious query path per concern. Pass an explicitly refreshed client `now` only to time-sensitive read-only summary/preview queries; refresh at the next minute and on window focus without creating hydration-dependent IDs. No mutation method includes a client clock argument.

**Step 5: Implement the accessible form**

Use TanStack Vue Form. Keep the money field as a decimal string until `parseMoneyToCents` succeeds, preserve parent-owned model state, and emit `submit` only for valid values. Use a native `select` for priority and a date input interpreted in household timezone.

**Step 6: Run tests and commit**

```bash
vp test --run --project unit tests/unit/use-want-list.test.ts
vp test --run --project nuxt tests/nuxt/wants-form.test.ts
git add app/composables/use-want-list.ts app/components/wants/form.vue tests/unit/use-want-list.test.ts tests/nuxt/wants-form.test.ts
git commit -m "feat: add wants form data flow"
```

### Task 12: Build the queue, status sections, and accessible reordering

**Files:**

- Create: `app/pages/wants.vue`
- Create: `app/components/wants/reserve-summary.vue`
- Create: `app/components/wants/list.vue`
- Create: `app/components/wants/item.vue`
- Create: `app/components/wants/status-badge.vue`
- Create: `app/utils/want-status.ts`
- Modify: `app/components/app-header.vue`
- Create: `tests/nuxt/wants-page.test.ts`
- Create: `tests/nuxt/wants-list.test.ts`

**Step 1: Write failing rendering tests**

Test loading, no-item, negative-recovery, active queue, Considering, Not now, and Bought states. Assert the copy distinguishes available reserve from potential tonight and uses an actual `<progress>` element or equivalent accessible progress semantics.

**Step 2: Write failing reorder tests**

Test pointer reorder output as a complete ID list, Move up/Move down buttons, disabled boundary actions, pending state, and stale-order rollback messaging. Do not assert library internals; assert emitted/reordered IDs and accessible labels.

**Step 3: Run and verify failure**

```bash
vp test --run --project nuxt tests/nuxt/wants-page.test.ts tests/nuxt/wants-list.test.ts
```

Expected: FAIL because the page/components are missing.

**Step 4: Implement the status strategy and humble components**

Keep labels, badge classes, descriptions, and allowed actions in `app/utils/want-status.ts`. Components receive prepared props and emit meaningful events; they do not call Convex directly.

**Step 5: Implement page orchestration and navigation**

`app/pages/wants.vue` uses `useWantList`, owns drawers/dialog state, and wires child events. Add the **Wants** navigation link. Use `vue-draggable-plus` for pointer dragging and explicit buttons for keyboard users.

**Step 6: Run tests and commit**

```bash
vp test --run --project nuxt tests/nuxt/wants-page.test.ts tests/nuxt/wants-list.test.ts
git add app/pages/wants.vue app/components/wants app/utils/want-status.ts app/components/app-header.vue tests/nuxt/wants-page.test.ts tests/nuxt/wants-list.test.ts
git commit -m "feat: add shared wants queue interface"
```

### Task 13: Add purchase disclosure and Bought-history actions

**Files:**

- Create: `app/components/wants/purchase-dialog.vue`
- Create: `app/components/wants/bought-list.vue`
- Create: `tests/nuxt/wants-purchase.test.ts`
- Modify: `app/pages/wants.vue`
- Modify: `app/components/wants/item.vue`

**Step 1: Write failing purchase-dialog tests**

Test fully funded, partially funded, and lower-item-impact previews. The dialog must visibly state:

- Full actual amount
- Reserve used
- General-budget impact
- Named/labeled progress lost from later items
- Pending and mutation-error states

Test that changing the actual amount refreshes the preview and stale preview values are not submitted as authority.

**Step 2: Write failing Bought-history tests**

Test linked ledger details, correction entry point, undo confirmation, and the absence of generic expense-edit actions for linked purchases.

**Step 3: Run and verify failure**

```bash
vp test --run --project nuxt tests/nuxt/wants-purchase.test.ts
```

Expected: FAIL because the purchase UI is missing.

**Step 4: Implement dialog and history**

Use the native `<dialog>` pattern already supported by DaisyUI or an accessible equivalent. Keep focus inside while open, return focus to the triggering item, and announce successful purchase through a polite live region.

**Step 5: Run tests and commit**

```bash
vp test --run --project nuxt tests/nuxt/wants-purchase.test.ts
git add app/components/wants/purchase-dialog.vue app/components/wants/bought-list.vue app/components/wants/item.vue app/pages/wants.vue tests/nuxt/wants-purchase.test.ts
git commit -m "feat: disclose reserve-funded purchases"
```

### Task 14: Add the Home top-item card and constructive forecasting copy

**Files:**

- Create: `app/components/wants/top-item-card.vue`
- Create: `app/utils/want-guidance.ts`
- Create: `tests/unit/want-guidance.test.ts`
- Create: `tests/nuxt/wants-top-item-card.test.ts`
- Modify: `app/pages/home.vue`

**Step 1: Write failing guidance tests**

Test deterministic copy for:

- Target-date daily amount
- Recent positive pace and estimated ready date
- Insufficient history
- Ready state
- Today's negative movement
- Negative reserve recovery

Keep exact money/date formatting separate from accounting calculations.

**Step 2: Write failing component tests**

Test no-active-item, partially funded, ready, and recovery states. Assert progress semantics, top-item link, reserve/potential labels, and that no message says “can't afford.”

**Step 3: Run and verify failure**

```bash
vp test --run --project unit tests/unit/want-guidance.test.ts
vp test --run --project nuxt tests/nuxt/wants-top-item-card.test.ts
```

Expected: FAIL because the card and guidance helper are missing.

**Step 4: Implement and place the card**

Render the card directly below the Home safe-to-spend section. Consume the compact backend summary already loaded for Home; do not start a duplicate list query from the card.

**Step 5: Run tests and commit**

```bash
vp test --run --project unit tests/unit/want-guidance.test.ts
vp test --run --project nuxt tests/nuxt/wants-top-item-card.test.ts
git add app/components/wants/top-item-card.vue app/utils/want-guidance.ts app/pages/home.vue tests/unit/want-guidance.test.ts tests/nuxt/wants-top-item-card.test.ts
git commit -m "feat: show top want progress on home"
```

### Task 15: Run full validation and Cloudflare compatibility checks

**Files:**

- Modify only files required to fix validation failures caused by this feature
- Review: `nuxt.config.ts`
- Review: `wrangler.jsonc`
- Review: `docs/plans/2026-08-13-shared-wants-reserve-design.md`

**Step 1: Install and diagnose the project environment**

```bash
vp install
vp env doctor
```

Expected: dependencies are synchronized and the selected runtime satisfies the project.

**Step 2: Run generated-code and focused backend validation**

```bash
vp exec convex codegen
vp exec tsc --noEmit
vp test --run --project convex
```

Expected: codegen, TypeScript, and all Convex tests pass.

When a Convex deployment is configured, also run:

```bash
vp exec convex dev --once
```

Expected: functions analyze and push successfully. Do not target production without explicit authorization.

**Step 3: Run all app checks**

```bash
vp check
vp test --run
vp build
```

Expected: formatting, lint, types, all projects, and the production Nuxt build pass.

**Step 4: Verify Cloudflare packaging without deploying**

```bash
vp exec wrangler deploy --dry-run
```

Expected: Wrangler packages `.output/server/index.mjs` and static assets successfully, with no new bindings required.

**Step 5: Perform manual acceptance checks**

Run the app with `vp run dev` and verify with two household accounts:

1. Both users see item changes reactively.
2. Pointer and keyboard reordering produce the same shared order.
3. Tonight's potential is separate from funded progress.
4. An over-budget transaction reduces top-item progress immediately.
5. A multi-month reserve remains after navigating month views.
6. A $120 purchase using $100 reserve shows `$120 total · $100 from reserve · $20 budget impact`.
7. The next item's progress decreases when the top purchase consumes overflow reserve.
8. Undo restores the item, expense, reserve, and queue consistently.
9. Timezone changes do not reinterpret the currently open day.

**Step 6: Commit validation fixes, if any**

```bash
git status --short
git add <only-feature-files-that-needed-fixes>
git commit -m "test: verify shared wants reserve"
```

If no files changed, do not create an empty commit.

## Completion checklist

- [ ] Every task's focused tests pass before its commit.
- [ ] Every new durable money field is `v.int64()` cents and every finance operation stays in `bigint` cents.
- [ ] Reserve ledger and cached position update in the same mutations.
- [ ] `sum(goalReserveLedgerEntries.amountCents) === goalReserveStates.positionCents` in tests after close, correction, purchase, correction, and undo.
- [ ] Screen totals read at most 32 unique daily rollups per month and never cap transaction counts.
- [ ] Cron and purchase catch-up call the same idempotent `closeDaysThrough` helper.
- [ ] No public mutation accepts client-supplied `now`; all capture server time once.
- [ ] No generic expense mutation can corrupt a linked purchase.
- [ ] No client-supplied household/user ID is used for authorization.
- [ ] Queue allocation is derived from shared reserve and manual order.
- [ ] Positive current-day potential is not shown as funded progress.
- [ ] The Home and ledger views consume the written safe-to-spend formula from one server-owned implementation.
- [ ] All new interactions have keyboard and screen-reader coverage.
- [ ] No Cloudflare persistence binding was added.
- [ ] `vp check`, `vp test --run`, `vp build`, and Wrangler dry-run pass.
