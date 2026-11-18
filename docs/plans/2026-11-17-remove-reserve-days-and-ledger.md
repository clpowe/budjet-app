# Remove reserve days and the reserve ledger

Follow-up to `2026-11-17-reserve-account-and-household-access.md`. Shrinks the goal reserve to one balance plus the daily budget rollups that already exist.

## Why

- `goalReserveLedgerEntries` is write-only. No query, page or calculation reads it; only tests do.
- `goalReserveDays` has three readers, and each one can use data we already store:
  1. "Is this day closed?" in `moveExpenseMoney` and `correctPurchase` → the close cursor on `goalReserveStates`.
  2. "Saved this month" in `budget.getHomeSummary` (`closedPositiveReserveContributionCents`) → rollups + allowance.
  3. The zone hint in `migrations/backfillExpenseLocalDates` → one-off; delete after it has run everywhere.
- The allowance cannot be changed today (set once at household creation and by `backfillMoney`), so the per-day `allowanceSnapshotCents` holds no information the household doc lacks.

## Target model

```
goalReserveStates:  positionCents, firstEligibleLocalDate, lastClosedLocalDate   ← the reserve cash
dailyBudgetRollups: expenseCents, reserveFundedExpenseCents, budgetImpactExpenseCents per day

daily close:     position += allowance − rollup.budgetImpact (0 if no rollup); cursor = that day
purchase:        position −= reserveUsed
purchase undo:   position += reserveUsed
correction:      position += prevReserveUsed − nextReserveUsed
edit closed day: position −= Δ budgetImpact        (closed ⇔ firstEligible ≤ day ≤ cursor)
```

`reduceReserveEvent` and `ReserveEvent` stay as the pure seam: they already compute exactly these position moves. `applyEvent` shrinks to "reduce, then patch state".

## Working agreement

- Same as the parent plan: read `convex/_generated/ai/guidelines.md` first. The user types the code; Claude gives full code per step, waits for "done", reviews, runs `vp check` and `vp test`. Edit directly only on "apply" / "you write it".
- Keep `## Progress` in sync after every step.
- Steps C1–C4 are behaviour-preserving for users. Each leaves the suite green.

## Settled decisions (2026-11-17)

1. **Allowance is fixed for now.** Accept that "saved this month" recomputes closed days with the current allowance. The user expects to make the allowance editable later; that feature must then store it per rollup row or in an allowance-changes table. Out of scope here.
2. **No audit trail.** Accept losing the per-movement history. Position correctness is guarded by tests only.
3. **Delete existing rows** (step C5) instead of leaving orphaned tables. Requires the `localDate` backfill to have run on every deployment first.
4. **Keep the negative-spending guard.** The closed-day correction currently asserts the day's spending stays ≥ 0. Move that check into `applyExpenseDelta`: every rollup field must stay ≥ 0 after a delta.

## Steps

### C0 — Prerequisite: finish the `localDate` backfill

Run on dev and prod (it reads `goalReserveDays`, so it must finish before C5):

```bash
npx convex run migrations/backfillExpenseLocalDates:run '{"cursor":null}'
```

Confirm no expense has `localDate === undefined` (dashboard filter or a one-off query).

### C1 — Closed check from the cursor

`convex/lib/reserve_account.ts`:

- Add a private `isClosedDay(state, localDate)`: `state !== null && lastClosedLocalDate !== undefined && localDate >= firstEligibleLocalDate && localDate <= lastClosedLocalDate`.
- `moveExpenseMoney`: replace `loadReserveDay(...)` with `isClosedDay(account.state, change.localDate)`.
- `correctPurchase`: `purchaseDayIsClosed = isClosedDay(state, before.localDate)`.

`convex/lib/daily_budget_rollups.ts`: `applyExpenseDelta` throws if any rollup field would go below zero (decision 4).

Tests: existing closed-day correction tests in `expenses.test.ts` and `purchases.test.ts` must pass unchanged. Add one for a day before `firstEligibleLocalDate` (no correction) and one for the negative-rollup guard.

### C2 — "Saved this month" from rollups

- `listReserveActivity` returns `{ rollups }` only (drop the `goalReserveDays` query and its `assertOneRowPerDay`).
- New exported pure function in `reserve_account.ts`, e.g. `sumClosedContributions({ rollups, allowanceCents, state, startLocalDate, endExclusiveLocalDate, timeZone })`: walk each local date in `[max(start, firstEligible), min(endExclusive, cursor + 1))`; add `max(0, allowance − rollup.budgetImpact)`, treating a missing rollup as 0 impact (a no-spend day contributes the full allowance).
- `budget.getHomeSummary` uses it for `closedPositiveReserveContributionCents`.

Tests: unit tests for the walk (no-spend day, overspend day clamps to 0, month starting before first eligible day, cursor lagging behind today). `budget.test.ts` keeps its current expected numbers.

### C3 — Stop writing reserve days

- `closeLoadedDays`: remove the `goalReserveDays` insert and the "Reserve day already exists before the recorded close cursor" guard. It reads the rollup and emits `daily_close` as before. (`reduceReserveEvent` still rejects closing at or before the cursor.)
- `applyEvent` `closed_day_correction`: remove the day load/patch.
- Delete `loadReserveDay` if unused.

Tests: replace assertions on `goalReserveDays` rows with assertions on `positionCents` and `lastClosedLocalDate` (`reserveMaintenance.test.ts`, `reserve.test.ts`, `expenses.test.ts`, `purchases.test.ts`, `budget.test.ts` fixtures that insert reserve days).

### C4 — Stop writing the ledger

- `applyEvent`: drop the `switch` of inserts; keep `reduceReserveEvent` + state patch.
- `activateReserve`: drop the `activation` ledger insert. `actorId` may become unused across events; remove it from `ReserveEvent` and callers only if nothing else needs it.
- Update the module header comment.

Tests: replace ledger-row and "position equals ledger sum" assertions with position assertions.

### C5 — Delete existing rows

New `convex/migrations/clearReserveHistory.ts`: internal mutation `run({ table, cursor })` that deletes one page (e.g. 200 docs) of `goalReserveDays` or `goalReserveLedgerEntries` and reschedules itself until done. Run for both tables on each deployment after C3–C4 are deployed (so nothing writes new rows meanwhile).

Delete `migrations/backfillExpenseLocalDates.ts` and its test (C0 done everywhere).

### C6 — Drop the tables

- Remove both tables from `convex/schema.ts`; run `npx convex codegen`.
- Verify the push on dev. If Convex refuses to drop a non-empty table, C5 did not finish.
- Delete `clearReserveHistory.ts` once it has run on every deployment.
- Update `GLOSSARY.md`: "Reserve position" no longer "equals the sum of its ledger entries"; "Reserve day / daily close" becomes the close event only; "Closed-day correction" moves the position only.

## Rollout order

Deploy C1–C4 → run C5 on each deployment → deploy C6. Never deploy C6 before C5 has emptied both tables.

## Progress

- [x] Decisions 1–4 confirmed
- [ ] C0 — `localDate` backfill run on dev and prod
- [x] C1 — Closed check from the cursor
- [x] C2 — "Saved this month" from rollups
- [x] C3 — Stop writing reserve days
- [x] C4 — Stop writing the ledger
- [ ] C5 — Delete existing rows (migration written + tested; not yet run on any deployment)
- [ ] C6 — Drop the tables

### Log

- 2026-11-17: Plan written.
- 2026-11-17: Decisions 1–4 confirmed. Editable allowance expected later, out of scope. C1 code drafted. Claude wrote the C1 tests (guard test red until source lands).
- 2026-11-17: C1 applied. Closed check uses the cursor; correction tolerates a missing reserve day (transitional); rollups reject negative totals. 40 files / 236 tests pass, vp check clean.
- 2026-11-17: C2 applied. `sumClosedPositiveContributions` derives "saved this month" from rollups + cursor; `listReserveActivity` returns rollups only.
- 2026-11-17: C3 + C4 applied together. Daily close and corrections only move `positionCents`; no reserve-day or ledger writes. `ReserveEvent` slimmed to money fields; `actorId` removed from the Reserve account interface. Tests assert position + cursor.
- 2026-11-17: C5 written: `migrations/clearReserveHistory:run({ table })`, 2 tests. GLOSSARY updated. 41 files / 242 tests pass, vp check clean. C6 waits: it must ship after C5 has run on every deployment.
