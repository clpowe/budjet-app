# Shared Wants and Goal Reserve Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a household-shared Wants queue whose multi-month reserve rises and falls with daily spending, funds purchases transparently, and keeps the ordinary budget accurate.

**Architecture:** Convex owns want items, a signed reserve ledger, a cached household reserve position, daily closing, and atomic purchases. Nuxt pages remain thin orchestration layers over a focused `useWantList` composable and small presentational components; Cloudflare Workers continues to host the client-rendered Nuxt output without new persistence bindings.

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

1. The persisted reserve is one signed household position; item allocations are derived, never persisted.
2. Available reserve is `max(position + liveNegativeAdjustment, 0)`.
3. Today can reduce funded progress immediately, but positive progress is not credited until the day closes.
4. A purchase records the full expense and a signed reserve withdrawal in one mutation.
5. `budgetImpact = expense.amount - (expense.reserveUsed ?? 0)` for ordinary spending views.
6. Reordering contains every active item exactly once and never changes the reserve position.
7. All authorization derives household membership from `ctx.auth`; clients never authorize by sending a household or user ID.
8. The first eligible reserve day is the first full household-local day after activation, avoiding partial-day retroactive spending.

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

Create `convex/schema.test.ts` with `import.meta.glob("./**/*.ts")`, initialize `convexTest(schema, modules)`, and assert that a seeded household can contain `timeZone: "America/New_York"` and that a `wantItems` document can be inserted with `status: "considering"`.

Use fixed IDs only through `t.run`, not type casts that bypass schema validation.

**Step 4: Run the test and verify it fails**

Run:

```bash
vp test --run --project convex convex/schema.test.ts
```

Expected: FAIL because the new fields and tables do not exist.

**Step 5: Extend the schema**

Add `households.timeZone: v.optional(v.string())` and optional purchase metadata to `expenses`:

```ts
wantItemId: v.optional(v.id("wantItems")),
reserveUsed: v.optional(v.number()),
```

Add these tables and indexes:

```ts
wantItems: defineTable({
  householdId: v.id("households"),
  name: v.string(),
  estimatedCost: v.number(),
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
  position: v.number(),
  activatedAt: v.number(),
  firstEligibleLocalDate: v.string(),
  lastClosedLocalDate: v.optional(v.string()),
  updatedAt: v.number(),
}).index("by_household", ["householdId"]),

goalReserveLedger: defineTable({
  householdId: v.id("households"),
  kind: v.union(
    v.literal("activation"),
    v.literal("daily_close"),
    v.literal("correction"),
    v.literal("purchase"),
    v.literal("purchase_undo"),
  ),
  amount: v.number(),
  localDate: v.string(),
  allowanceSnapshot: v.optional(v.number()),
  spendingSnapshot: v.optional(v.number()),
  sourceExpenseId: v.optional(v.id("expenses")),
  wantItemId: v.optional(v.id("wantItems")),
  actorId: v.optional(v.id("users")),
  createdAt: v.number(),
})
  .index("by_household_and_local_date", ["householdId", "localDate"])
  .index("by_source_expense", ["sourceExpenseId"]),
```

Use plural table names consistently in all later tasks.

**Step 6: Default household timezone and regenerate types**

Change `createHousehold` to accept an optional validated `timeZone`, default to `America/New_York`, and persist it. Validate with a small `isValidTimeZone` helper rather than trusting arbitrary strings.

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
- Create: `tests/unit/want-reserve.test.ts`

**Step 1: Write allocation and purchase tests**

Cover:

```ts
expect(
  allocateReserve(150, [
    { id: "camera", estimatedCost: 100 },
    { id: "trip", estimatedCost: 80 },
  ]),
).toEqual([
  { id: "camera", allocated: 100, remaining: 0 },
  { id: "trip", allocated: 50, remaining: 30 },
]);

expect(allocateReserve(-12, [{ id: "camera", estimatedCost: 100 }])[0]).toMatchObject({
  allocated: 0,
  remaining: 100,
});

expect(calculatePurchaseFunding(120, 100)).toEqual({
  reserveUsed: 100,
  budgetImpact: 20,
});
```

Also test duplicate/missing reorder IDs, zero/negative costs, and lower-item impact previews.

**Step 2: Write timezone and forecast tests**

Test local date keys and day windows on the 2026 New York DST transitions, the next full day after activation, target-date daily pace, and recent positive contribution pace. Pass `now` explicitly; do not read the wall clock inside pure functions.

**Step 3: Run tests and verify failure**

```bash
vp test --run --project unit tests/unit/want-reserve.test.ts
```

Expected: FAIL because `convex/lib/want-reserve.ts` is missing.

**Step 4: Implement minimal pure helpers**

Export narrowly typed helpers:

```ts
allocateReserve(position, items);
getReorderUpdates(currentIds, requestedIds);
calculatePurchaseFunding(actualAmount, availableReserve);
calculateLowerItemImpact(allocationsBefore, reserveUsed);
getBudgetImpact(amount, reserveUsed);
getLocalDateKey(timestamp, timeZone);
getLocalDayBounds(localDate, timeZone);
getNextLocalDate(localDate, timeZone);
calculateTargetDailyAmount(remaining, targetDate, today, timeZone);
calculateRecentPace(contributions);
```

Use `@formkit/tempo` only inside the day-boundary helpers; keep allocation and finance helpers dependency-free. Reject non-finite and non-positive monetary inputs at the boundary.

**Step 5: Run tests**

```bash
vp test --run --project unit tests/unit/want-reserve.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add convex/lib/want-reserve.ts tests/unit/want-reserve.test.ts
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

- `create` trims names/notes, requires a positive finite cost, and records the actor.
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

The list query should use household/status indexes and bounded `.take(...)` calls. Return a stable view model:

```ts
{
  active: WantItem[],
  considering: WantItem[],
  notNow: WantItem[],
  bought: WantItem[],
}
```

Use a release-appropriate cap per section and return `hasMoreBought` so Bought history can become paginated without changing the active queue contract.

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

### Task 4: Activate the reserve and expose the household summary

**Files:**

- Create: `convex/reserve.ts`
- Create: `convex/reserve.test.ts`
- Modify: `convex/wants.ts`
- Regenerate: `convex/_generated/api.d.ts`

**Step 1: Write failing activation tests**

Test that the first transition to `plan_for_it`:

- Creates exactly one `goalReserveStates` row at position zero.
- Adds one zero-value activation ledger entry.
- Sets `firstEligibleLocalDate` to the next full local day.
- Does not import earlier monthly surplus.
- Remains idempotent when two items are planned.

Test that reserve state persists when no active items remain.

**Step 2: Write failing summary tests**

The public summary query accepts a client-supplied `now` timestamp and returns:

```ts
{
  position: number,
  availableReserve: number,
  recoveryAmount: number,
  liveNegativeAdjustment: number,
  potentialTonight: number,
  activeAllocations: Array<{
    itemId: Id<"wantItems">,
    allocated: number,
    remaining: number,
    progress: number,
  }>,
  topItem: null | TopItemSummary,
}
```

Assert that current-day underspending is potential only and spending above allowance reduces visible progress immediately.

**Step 3: Run and verify failure**

```bash
vp test --run --project convex convex/reserve.test.ts
```

Expected: FAIL because reserve functions do not exist.

**Step 4: Implement activation and summary**

Create internal helpers that receive `MutationCtx`, household, actor, and explicit `now`. Keep the public query read-only and pass `now` into it so cached query results do not depend on a server wall-clock read.

When calculating today's budget-impacting spending, query the household/date index with a hard upper bound and throw a diagnostic error rather than silently truncating.

**Step 5: Wire activation into status changes**

The transition mutation in `convex/wants.ts` invokes reserve activation in the same transaction when the target status is `plan_for_it`.

**Step 6: Regenerate and run tests**

```bash
vp exec convex codegen
vp test --run --project convex convex/reserve.test.ts convex/wants.test.ts
```

Expected: PASS.

**Step 7: Commit**

```bash
git add convex/reserve.ts convex/reserve.test.ts convex/wants.ts convex/_generated/api.d.ts
git commit -m "feat: activate household goal reserve"
```

### Task 5: Close household days and reconcile edited spending

**Files:**

- Create: `convex/reserveMaintenance.ts`
- Create: `convex/crons.ts`
- Create: `convex/reserveMaintenance.test.ts`
- Modify: `convex/expenses.ts`
- Modify: `convex/reserve.ts`
- Regenerate: `convex/_generated/api.d.ts`

**Step 1: Write failing daily-close tests**

Cover:

- A $50 allowance and $30 budget-impacting spending records `+20`.
- $55 spending records `-5`.
- Several closed days carry the signed position across a month boundary.
- The activation day is skipped and the next full day is eligible.
- The allowance and timezone are snapshotted into the daily entry.
- Re-running a close is idempotent.
- Catch-up work processes a bounded number of households/days and schedules continuation.

**Step 2: Write failing correction tests**

Create, edit, move, and delete an expense on a closed day. Assert that each mutation adds only the signed delta correction and updates `goalReserveStates.position` transactionally. Reject generic edits/deletes for expenses linked to a want purchase.

**Step 3: Run and verify failure**

```bash
vp test --run --project convex convex/reserveMaintenance.test.ts
```

Expected: FAIL because maintenance and reconciliation are absent.

**Step 4: Implement bounded closing**

Add an internal mutation that paginates reserve states, closes at most a small fixed number of missing days per household, and schedules a continuation when work remains. Use indexed expense ranges and store one `daily_close` entry per household/local date; detect duplicates with the compound index before inserting.

Register only an internal function with the cron:

```ts
crons.interval(
  "close household goal reserve days",
  { hours: 1 },
  internal.reserveMaintenance.closeEligibleDays,
  { cursor: null },
);
```

**Step 5: Reconcile ordinary expense mutations**

Refactor `createExpense`, `updateExpense`, and `deleteExpense` to:

- Derive household authorization server-side.
- Remove the unused client `householdId` argument.
- Validate ownership before update/delete.
- Apply a correction only when the affected local day is already closed.
- Handle moving an expense between two closed days as two deltas.
- Refuse generic modification of linked want purchases.

**Step 6: Run tests**

```bash
vp exec convex codegen
vp test --run --project convex convex/reserveMaintenance.test.ts convex/reserve.test.ts
vp test --run --project unit tests/unit/use-expenses.test.ts
```

Expected: Convex tests pass; the existing composable test may fail until its expected create signature is updated. Fix only expectations caused by removal of `householdId`.

**Step 7: Commit**

```bash
git add convex/reserveMaintenance.ts convex/crons.ts convex/reserveMaintenance.test.ts convex/expenses.ts convex/reserve.ts convex/_generated/api.d.ts tests/unit/use-expenses.test.ts
git commit -m "feat: reconcile daily reserve with spending"
```

### Task 6: Add timezone settings and timezone-aware transaction entry

**Files:**

- Modify: `convex/households.ts`
- Modify: `convex/schema.ts`
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

Test valid IANA zones, invalid strings, owner-only timezone changes, and `effectiveAfterLocalDate` semantics. Existing households without a timezone resolve to `America/New_York` until saved.

**Step 2: Write failing frontend date tests**

Test that `useDate` accepts the household timezone as an explicit/ref input and generates labels and transaction timestamps in that zone. Remove every new feature dependency on hard-coded Eastern Time; existing unrelated date behavior can be migrated in the same focused change.

**Step 3: Run and verify failure**

```bash
vp test --run --project convex convex/households.test.ts
vp test --run --project unit tests/unit/use-date.test.ts
vp test --run --project nuxt tests/nuxt/household-timezone.test.ts
```

Expected: FAIL because timezone updates and injected date handling do not exist.

**Step 4: Implement backend setting**

Add `updateTimeZone({ timeZone, now })`. Validate the zone, require household ownership, and store the new zone for the next local-day boundary. If the schema needs pending/effective fields, add them explicitly and regenerate; do not reinterpret the open reserve day.

**Step 5: Implement the UI and shared date source**

Expose `timeZone` from `useHousehold`. Add a labeled timezone selector to the Household page for owners and explanatory read-only text for members. Prefer `Intl.supportedValuesOf("timeZone")` with a safe fallback list.

Use the shared timezone in transaction date parsing/formatting and page labels. Keep browser-only API access inside client setup because Nuxt is currently `ssr: false`, while retaining deterministic function inputs for tests.

**Step 6: Run tests and commit**

```bash
vp exec convex codegen
vp test --run --project convex convex/households.test.ts
vp test --run --project unit tests/unit/use-date.test.ts
vp test --run --project nuxt tests/nuxt/household-timezone.test.ts
git add convex/schema.ts convex/households.ts convex/households.test.ts convex/_generated app/composables/use-date.ts app/composables/use-households.ts app/pages/household.vue app/components/expenses/add.vue app/components/expenses/edit.vue app/components/spending/edit.vue tests/unit/use-date.test.ts tests/nuxt/household-timezone.test.ts
git commit -m "feat: add household budget timezone"
```

### Task 7: Implement atomic purchase, correction, and undo

**Files:**

- Modify: `convex/wants.ts`
- Modify: `convex/reserve.ts`
- Modify: `convex/expenses.ts`
- Create: `convex/purchases.test.ts`
- Regenerate: `convex/_generated/api.d.ts`

**Step 1: Write failing purchase tests**

Cover these exact scenarios:

| Estimate | Actual | Available reserve | Reserve used | Budget impact |
| -------: | -----: | ----------------: | -----------: | ------------: |
|      100 |    100 |               100 |          100 |             0 |
|      100 |    120 |               100 |          100 |            20 |
|      100 |    120 |               150 |          120 |             0 |
|      100 |    120 |                 0 |            0 |           120 |

Also assert that:

- The expense, purchase ledger entry, reserve state, and Bought item commit together.
- Reserve use can consume the next item's displayed allocation.
- A stale preview does not control the mutation; the server recalculates from current state.
- Concurrent purchase attempts cannot spend the same reserve twice.
- Another household cannot purchase the item.

**Step 2: Write failing correction and undo tests**

Correction recalculates reserve use against the original purchase transaction without creating a second expense. Undo deletes the linked expense, adds a reversing `purchase_undo` entry, restores the item to the bottom of `plan_for_it`, and leaves the cached position consistent.

**Step 3: Run and verify failure**

```bash
vp test --run --project convex convex/purchases.test.ts
```

Expected: FAIL because purchase functions are absent.

**Step 4: Implement preview and purchase**

Expose `previewPurchase({ itemId, actualAmount, now })` as a query returning reserve use, ordinary budget impact, and lower-item progress loss. Treat it as advisory only.

Implement `purchase({ itemId, actualAmount, purchasedAt, now })` as one mutation. Re-read and validate everything, catch up eligible reserve state, calculate funding, insert the expense and negative purchase ledger entry, update reserve state, mark Bought, and normalize the remaining queue.

**Step 5: Implement dedicated correction and undo**

Do not expose linked purchase changes through `expenses.updateExpense` or `deleteExpense`. Provide `correctPurchase` and `undoPurchase` mutations with explicit validators and audit entries.

**Step 6: Run tests and commit**

```bash
vp exec convex codegen
vp test --run --project convex convex/purchases.test.ts convex/reserve.test.ts convex/wants.test.ts
git add convex/wants.ts convex/reserve.ts convex/expenses.ts convex/purchases.test.ts convex/_generated/api.d.ts
git commit -m "feat: fund want purchases from reserve"
```

### Task 8: Centralize budget summaries and ledger purchase markers

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

**Step 1: Write failing budget-invariant tests**

Assert that:

- Positive daily reserve contributions reduce freely available safe-to-spend.
- Negative contributions restore the spending capacity they covered while moving goals backward.
- A purchase expense and matching reserve withdrawal offset by exactly `reserveUsed`.
- A $120 purchase with $100 reserve changes ordinary budget performance by only $20.
- A purchase funded from a prior month does not create a current-month spike.

Use explicit period bounds and a fixed `now`.

**Step 2: Run and verify failure**

```bash
vp test --run --project convex convex/budget.test.ts
```

Expected: FAIL because `api.budget.getHomeSummary` is absent.

**Step 3: Implement a bounded summary query**

Return one server-owned summary containing current safe-to-spend, reserved amount, potential tonight, spent totals, pace metrics, and the compact top-item summary. Query expenses and ledger entries by household/date indexes with explicit upper bounds and loud overflow errors; do not silently truncate financial totals.

Update monthly transaction mapping to include:

```ts
reserveUsed: expense.reserveUsed ?? 0,
budgetImpact: getBudgetImpact(expense.amount, expense.reserveUsed ?? 0),
isWantPurchase: expense.wantItemId !== undefined,
```

**Step 4: Migrate frontend consumers**

Make `useExpenses` consume the centralized summary instead of recomputing conflicting safe-to-spend rules. Replace Home's local `leftToSpend` formula. In monthly and spending ledgers, show a Want purchase marker and the three-value breakdown when reserve was used.

**Step 5: Run tests**

```bash
vp exec convex codegen
vp test --run --project convex convex/budget.test.ts
vp test --run --project unit tests/unit/use-expenses.test.ts
vp test --run --project nuxt tests/nuxt/spending-list.test.ts
```

Expected: PASS with no duplicate client-side budget formula remaining.

**Step 6: Commit**

```bash
git add convex/budget.ts convex/budget.test.ts convex/expenses.ts convex/_generated/api.d.ts app/composables/use-expenses.ts app/pages/home.vue app/pages/monthly.vue app/components/spending/list.vue tests/unit/use-expenses.test.ts tests/nuxt/spending-list.test.ts
git commit -m "feat: account for reserve in budget views"
```

### Task 9: Build the Wants composable and item form

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

Test required name, positive cost, required priority, optional date/notes, disabled/pending state, external mutation error, and emitted typed values.

**Step 3: Run and verify failure**

```bash
vp test --run --project unit tests/unit/use-want-list.test.ts
vp test --run --project nuxt tests/nuxt/wants-form.test.ts
```

Expected: FAIL because the composable and form are missing.

**Step 4: Implement the thin composable**

Use one obvious query path per concern. Pass an explicitly refreshed `now` to time-sensitive summary/preview queries; refresh at the next minute and on window focus without creating hydration-dependent IDs.

**Step 5: Implement the accessible form**

Use TanStack Vue Form. Keep validation close to fields, preserve parent-owned model state, and emit `submit` only for valid values. Use a native `select` for priority and a date input interpreted in household timezone.

**Step 6: Run tests and commit**

```bash
vp test --run --project unit tests/unit/use-want-list.test.ts
vp test --run --project nuxt tests/nuxt/wants-form.test.ts
git add app/composables/use-want-list.ts app/components/wants/form.vue tests/unit/use-want-list.test.ts tests/nuxt/wants-form.test.ts
git commit -m "feat: add wants form data flow"
```

### Task 10: Build the queue, status sections, and accessible reordering

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

### Task 11: Add purchase disclosure and Bought-history actions

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

### Task 12: Add the Home top-item card and constructive forecasting copy

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

### Task 13: Run full validation and Cloudflare compatibility checks

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
- [ ] Reserve ledger and cached position update in the same mutations.
- [ ] All financial totals use explicit bounded reads or fail loudly on overflow.
- [ ] No generic expense mutation can corrupt a linked purchase.
- [ ] No client-supplied household/user ID is used for authorization.
- [ ] Queue allocation is derived from shared reserve and manual order.
- [ ] Positive current-day potential is not shown as funded progress.
- [ ] The Home and ledger views consume server-owned budget calculations.
- [ ] All new interactions have keyboard and screen-reader coverage.
- [ ] No Cloudflare persistence binding was added.
- [ ] `vp check`, `vp test --run`, `vp build`, and Wrangler dry-run pass.
