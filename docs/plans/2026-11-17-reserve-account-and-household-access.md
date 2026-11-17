# Reserve account module + Household access

Implementation prompt for two deepening refactors from the 2026-11-17 architecture review:

- **#4 Household access**: one place that resolves the authenticated user's Household for every Convex function. Fixes the windfall cross-household leak.
- **#1 Reserve account**: one deep module that owns every write to the goal reserve (ledger, position, reserve days, daily budget rollups) and the live snapshot read.

Do #4 first; #1 builds on it.

## Working agreement

- Read `convex/_generated/ai/guidelines.md` before touching Convex code.
- The user types the code. For each step: give the complete code in chat, wait for "done", then review the diff and run `vp check` and `vp test`. Edit source files directly only when the user says "apply" / "you write it".
- Keep `## Progress` below in sync after every step (checkbox + dated log line).
- Behaviour-preserving unless a step says otherwise. Each step leaves the suite green.

## Settled decisions (2026-11-17)

1. **Scope**: the Reserve account module owns _all_ money-moving events: Want purchase / correct / undo, expense add / edit / delete, daily close, activation. `reserveMaintenance.ts` and `ensureGoalReserveActivated` become thin callers. The live snapshot read also lives here.
2. **Close before write**: every write through the module first closes pending reserve days (`closeDaysThrough`, capped at `CLOSE_DAYS_PER_TRANSACTION`). If catch-up is incomplete, the write does nothing and returns `{ status: "reserve_syncing" }`; callers schedule catch-up and surface it. Expense mutations gain this status too, and the UI must handle it.
3. **Stored local date**: expenses store `localDate` (household-local `YYYY-MM-DD`) at write time; existing rows are backfilled. Edits, undo, corrections and rollup/reserve-day keys use the stored value, never a recomputation with the current zone. Changing an expense's `date` recomputes `localDate` with the effective zone _at write time_.
4. **Correction funding**: a corrected purchase is funded from "reserve available as if this purchase never happened, as of now". The module computes it by reversing the old purchase in memory and re-projecting, not by hand-written add-back arithmetic.
5. **Test surface**: tests call the module's interface directly with convex-test. Pure functions (`reduceReserveEvent`, `projectCurrentReserve`, `calculatePurchaseFunding`) stay as an internal seam with their own unit tests. `purchases.test.ts` keeps a few end-to-end cases.

## Part A — Household access (#4)

### Problem

The preamble `getAuthenticatedUser → user.householdId check → db.get(household)` is copy-pasted ~20× (`wants.ts` ×10, `reserve.ts:261`, `budget.ts:96`, `households.ts:117`, `chat.ts:71`). `expenses.ts:48` has its own `getAuthorizedHousehold`. `convex/windfall.ts` has none: `listWindfall` and `getMyWindfallTotal` return every household's rows; `addWindfallTransaction` / `updateWindfall` trust a client `householdId`; update and delete check no ownership.

### Target

New `convex/lib/household_access.ts` (no new dependency):

```ts
requireHouseholdMember(ctx): Promise<{ user: Doc<"users">; household: Doc<"households"> }>
requireHouseholdDoc(ctx, table, id, householdId): Promise<Doc<table>>   // throws if missing or other household
```

Error messages stay as today ("User is not in a household", "Household not found") so existing tests pass. `requireHouseholdWant`, `requireLinkedPurchase` and `getAuthorizedHousehold` either use these or are deleted.

### Steps

- A1. Add `household_access.ts` with unit tests (convex-test): no identity, user without household, missing household, happy path, cross-household doc.
- A2. **Windfall security fix.** `windfall.ts`: list/total query `by_household_date` for the caller's household only; add/update drop the `householdId` arg and use the caller's; update/delete verify ownership. Update the client callers (`app/components/windfall/*`) to stop passing `householdId`. Add `convex/windfall.test.ts` covering cross-household read/update/delete denial.
- A3. Replace the preamble in `wants.ts`, `reserve.ts`, `budget.ts`, `households.ts`, `chat.ts`, `expenses.ts`. Keep queries that intentionally return `[]` / `null` for household-less users (e.g. `chat.list`) doing so — add a `findHouseholdMember` variant returning `null` if needed rather than throwing.
- A4. Extract a shared test seed (`convex/test_utils/seed.ts`) for user + household (+ optional reserve activation) and migrate the suites that duplicate it, one file at a time.

## Part B — Reserve account (#1)

### Problem

`purchase`, `correctPurchase` and `undoPurchase` (`convex/wants.ts:551–936`) follow three different procedures:

- Only `purchase` calls `closeDaysThrough`; correct and undo act on a possibly stale position.
- `correctPurchase` re-implements the live projection inline with raw `goalReserveStates` / `goalReserveDays` / `dailyBudgetRollups` queries (`wants.ts:719–775`).
- `applyExpenseDelta` (`lib/daily_budget_rollups.ts`) silently calls `applyReserveEvent` for closed-day corrections, so `undoPurchase` must re-fetch state afterwards (`wants.ts:875–908`). This also creates the cycle `lib/daily_budget_rollups → reserve → lib/live_reserve → households`.
- Correct, undo and `expenses.ts` edit/delete re-key the expense day with the _current_ effective zone (`wants.ts:736, 884`; `expenses.ts:198, 240`).
- The budget-impact formula exists in 4 places (`want_reserve.ts:147`, `daily_budget_rollups.ts:103`, `wants.ts:735`, `spending/list.vue:50`).

### Target interface (sketch — refine in step B2 before typing code)

New `convex/lib/reserve_account.ts`. Callers never touch `goalReserveStates`, `goalReserveLedgerEntries`, `goalReserveDays` or `dailyBudgetRollups` directly.

```ts
// read (QueryCtx | MutationCtx)
getReserveSnapshot(ctx, household, now): Promise<ReserveSnapshot>

// write (MutationCtx) — each closes pending days first
recordPurchase(ctx, { household, actorId, want, amountCents, localDate, now })
  -> { status: "reserve_syncing" } | { status: "ok"; expenseId; reserveUsedCents; budgetImpactCents }
correctPurchase(ctx, { household, actorId, expense, amountCents, now })      -> same union
undoPurchase(ctx, { household, actorId, expense, now })                      -> { status: "reserve_syncing" } | { status: "ok" }
recordExpenseChange(ctx, { household, actorId, before?, after?, expenseId, now }) -> { status: "reserve_syncing" } | { status: "ok" }

// maintenance
activate(ctx, { household, actorId, now })
closeDaysThrough(ctx, { household, throughExclusiveTimestamp, maxDays })   // moved from reserveMaintenance
```

Inside the module: load state once, close days, project, compute funding, insert/patch expense where the event owns it, write ledger + state, apply rollup delta, apply closed-day correction, assert ledger sum = position in tests. Want status/queue changes (`removeActiveWant`, `appendActiveWant`, purchasedBy fields) stay in `wants.ts`.

Open question for B2: does the module insert/delete the expense row itself for purchases (it owns funding, so probably yes), or does the caller insert and pass the id? Decide with the user before coding.

### Steps

- B1. **Stored `localDate` on expenses.** Schema: `localDate: v.optional(v.string())` + index if useful. Write it in every expense insert/patch (`expenses.ts`, `wants.ts`). Migration in `convex/migrations/` backfilling from `getLocalDateKey(date, zone)` using the zone recorded on the matching `goalReserveDays` row when one exists, else the household's stored zone. Test the migration. Make the field required after backfill is verified (separate step, user's call).
- B2. Agree the final interface with the user (types only, no bodies). Record any new domain terms in `GLOSSARY.md` (create it): Reserve account, Reserve snapshot, Budget impact, Close cursor, Stored local date.
- B3. Create `reserve_account.ts` with `getReserveSnapshot` (move `live_reserve.ts` in) and the one `getBudgetImpactCents`. Re-point `budget.ts`, `reserve.ts getSummary`, `wants.previewPurchase`. Delete `live_reserve.ts` once empty.
- B4. Move `applyReserveEvent`, `reduceReserveEvent`, `ensureGoalReserveActivated`, `applyExpenseDelta`, `closeDaysThrough` behind the module (private where possible). Break the import cycle. `reserveMaintenance.ts` keeps only the internal mutations + cron batching and calls the module.
- B5. `recordPurchase`: port `wants.purchase` onto it. Existing `purchases.test.ts` must pass unchanged.
- B6. `correctPurchase`: port onto the module using decision 4 and decision 2 (now closes days first). Delete the inline projection. Add tests: correct on a past day not yet closed, on a closed day, after a time-zone change, while reserve is syncing.
- B7. `undoPurchase`: port; single state load, no re-fetch. Add tests: undo on a closed day, on an unclosed past day, after a zone change, while syncing.
- B8. `recordExpenseChange`: port `expenses.ts` create/update/delete. Return `reserve_syncing` and handle it in `app/composables/use-expenses.ts` + expense forms (show "Reserve is catching up, try again in a moment"). Add tests for closed-day edit and zone-change edit.
- B9. Narrow `scheduleReserveCatchUp` to the one household that is behind (`closeThrough` internal mutation with `householdId`) instead of scanning all households.
- B10. Cleanup: remove dead helpers (`shouldPromotePendingTimeZone` if still unused, duplicate positive-cents checks), make `spending/list.vue` read budget impact from the server or the shared helper, and confirm no file outside the module queries the four reserve tables (`grep`). Ledger invariant helper moves to the shared test seed.

## Validation

- `vp check` and `vp test` green after every step.
- `grep -rn "goalReserveStates\|goalReserveLedgerEntries\|goalReserveDays\|dailyBudgetRollups" convex --include=*.ts` lists only `reserve_account.ts`, schema, migrations and tests.
- Every reserve test ends with the ledger-sum = position assertion.
- Windfall: a second household cannot read, update or delete the first household's windfalls.

## Out of scope

Household calendar module (#2), home summary (#3), want queue (#5), cents-only client (#6). The separate `wants.vue:46` `localDate` bug (`useDate()` does not return `localDate`) should be fixed first as a one-line change, not inside this plan.

## Progress

- [x] A1 household_access module + tests
- [x] A2 windfall auth fix + tests
- [x] A3 replace membership preamble
- [x] A4 shared test seed
- [x] B1 stored localDate + backfill
- [x] B2 interface agreed + GLOSSARY.md
- [x] B3 getReserveSnapshot in module
- [x] B4 move writes behind module, break cycle
- [x] B5 recordPurchase
- [x] B6 correctPurchase + tests
- [x] B7 undoPurchase + tests
- [x] B8 recordExpenseChange + UI syncing state
- [x] B9 per-household catch-up
- [x] B10 cleanup + grep check

### Log

- 2026-11-17: plan written from architecture review; decisions 1–5 accepted.
- 2026-11-17: exposed `localDate` from `useDate()` for the Wants purchase dialog. All 210 tests and the scoped check passed. The full check reported existing formatting issues in `monthly-spending.ts` and this plan.
- 2026-11-17: user switched to "Claude implements until further notice".
- 2026-11-17: A1 done — `convex/lib/household_access.ts` (`requireHouseholdMember`, `findHouseholdMember`, `requireHouseholdDoc`) + 9 tests.
- 2026-11-17: A2 done — `windfall.ts` scoped to caller's household (reads via `findHouseholdMember`, writes via `requireHouseholdMember` + `requireHouseholdDoc`); dropped client `householdId` arg in `windfall/add.vue` and `edit.vue`. Also fixed `updateWindfall` requiring `date` that `edit.vue` never sent (now optional, kept when absent). `convex/windfall.test.ts` 7 tests.
- 2026-11-17: A3 done — full preamble replaced by `requireHouseholdMember` in `wants.ts` (8 sites), `budget.ts`, `reserve.ts`, `chat.ts` (`send`; `list` uses `findHouseholdMember`), `households.ts` (`updateTimeZone`), `expenses.ts` (deleted `getAuthorizedHousehold`). `requireHouseholdWant` deleted → `requireHouseholdDoc(ctx, "wantItems", …, "Want item not found")`; expense ownership via `requireHouseholdDoc`. Kept `getHouseholdId` for id-only list queries (`depts.ts`, `expenses.ts` reads) and the create/join/leave household flows, which have different rules. `vp check --fix` also reformatted pre-existing files (`monthly-spending.ts`, this plan).
- 2026-11-17: A4 done (partial by design) — `convex/test_utils/seed.ts` (`insertHousehold`, `insertUser`, `testIdentity`, `DEFAULT_TEST_HOUSEHOLD`). Migrated `expenses.test.ts`, `windfall.test.ts`, `lib/household_access.test.ts`. Reserve-heavy suites (`purchases`, `reserve`, `reserveMaintenance`, `budget`, `wants`) migrate during Part B when their seeds gain reserve state. Suite: 39 files / 226 tests green.
- 2026-11-17: B1 done — `expenses.localDate` (optional) in schema; `ExpenseFacts` now carries `localDate` instead of `date`, so `applyExpenseDelta` no longer takes a zone. New `getExpenseLocalDate` / `toExpenseFacts` in `lib/daily_budget_rollups.ts` fall back to the effective zone only for legacy rows. Written by `createExpense`, `updateExpense` (kept when the timestamp is unchanged, re-keyed in today's zone when moved), `wants.purchase` (`purchaseLocalDate`), `correctPurchase`; read by correct/undo/delete. `backfillMoney.processHousehold` also fills `localDate`. New `migrations/backfillExpenseLocalDates:run` (stored zone, overridden by a closed reserve day's recorded zone) + 3 tests; regression test for edit/delete after a zone change in `expenses.test.ts`. Ran `npx convex codegen` (it uploads to the dev deployment for type analysis). **Before making `localDate` required: run `npx convex run migrations/backfillExpenseLocalDates:run '{"cursor":null}'` on each deployment.** Suite 40 files / 230 tests.
- 2026-11-17: B2 decided without a separate review (user: "implement until further notice"): the module inserts/deletes the purchase expense row itself. Interface in `convex/lib/reserve_account.ts`: reads `getReserveSnapshot`, `listReserveActivity`; maintenance `activateReserve`, `closeReserveDays`; writes `recordPurchase`, `correctPurchase`, `undoPurchase`, `addExpense`, `editExpense`, `removeExpense` — each returns `{ status: "ok", … } | { status: "reserve_syncing" }`. Internal seam: pure `reduceReserveEvent` / `projectCurrentReserve` (exported for unit tests); `applyEvent` keeps the loaded state current in memory, so no re-fetches. `GLOSSARY.md` created.
- 2026-11-17: B3–B4 done — `lib/live_reserve.ts` deleted (test renamed `lib/reserve_account.test.ts`); `reserve.ts` keeps only `getSummary`; `reserveMaintenance.ts` keeps only the internal mutations. `applyExpenseDelta` is now pure rollup bookkeeping returning changed days; the module applies closed-day corrections. Import cycle `daily_budget_rollups → reserve` is gone.
- 2026-11-17: B5–B7 done — `wants.purchase/correctPurchase/undoPurchase` call the module. Correct/undo now close days first and return `reserve_syncing` (result validators widened; `wants.vue` shows "The reserve is still syncing. Try again in a moment."). Undo runs the money change before re-queueing the Want; a full queue throws and rolls everything back. New tests: correct a past purchase (closes days, fixes the closed day), undo after a zone change, correct/undo while syncing.
- 2026-11-17: B8 done — `createExpense/updateExpense/deleteExpense` call the module and return `{ success: true } | { success: false, reason: "reserve_syncing" }`. `expenses/add.vue`, `expenses/edit.vue`, `spending/edit.vue` show the syncing message (edit forms also show errors now). Delete callers ignore the result (not surfaced yet). Fixed the closed-day test fixture that lacked a close cursor. New test: expense writes wait while syncing.
- 2026-11-17: B9 done — `openCurrentAccount` schedules `reserveMaintenance.closeThrough` for that household only; `closeThrough` reschedules itself until caught up. `scheduleReserveCatchUp` (all-household scan) deleted.
- 2026-11-17: B10 done — only `reserve_account.ts`, `daily_budget_rollups.ts` (internal), `reserveMaintenance.ts` (cursor over states), schema and migrations touch the four reserve tables; `budget.ts` month reads moved to `listReserveActivity`. Deleted dead `shouldPromotePendingTimeZone`. Not done: shared ledger-invariant helper + migrating reserve-heavy suites to `test_utils/seed.ts`; `spending/list.vue` still computes budget impact inline (belongs to candidate #3/#6). Suite 40 files / 234 tests; `vp check` clean. Vue SFC type-check isn't configured (`nuxi typecheck` asks to install Golar), so `.vue` edits are covered by Nuxt tests only. Found, not fixed: `app/components/depts/add.vue` calls `createExpense` with `amount` + `householdId`, which the mutation has not accepted since the cents migration.
