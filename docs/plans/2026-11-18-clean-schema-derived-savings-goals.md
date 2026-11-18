# Clean schema: derived savings, Goals, and the naming pass

Reconciles three review threads (Codex + Claude) into one plan. Supersedes the compatibility-migration parts of `2026-11-18-rename-reserve-to-savings.md` and the "keep the stored position" model of `2026-11-17-remove-reserve-days-and-ledger.md`.

## Premise

No one uses the app. Data is disposable, so we do **one clean schema cutover** instead of dual tables, mirrored writes, `v2` status strings, backfills or old-vs-new comparisons.

## Data model: facts vs derived

| Facts (stored in Convex, one source of truth)                                            | Derived (never stored)                                 |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Household: `allowanceCents`, `timeZone`, `savingsStartLocalDate?`                        | Savings position, available savings, shortfall         |
| Expense: `amountCents`, `localDate`, `goalId?`, `fromSavingsCents`                       | Is a day closed (`localDate < today`)                  |
| Goal: name, `estimatedCostCents`, status, `order`                                        | Per-goal saved / remaining / % funded, purchase losses |
| Income (was windfall), debts                                                             | Month totals, "saved this month", balance chart        |
| `dailyBudgetTotals` (**rebuildable cache**, written in the same mutation as the expense) |                                                        |

`fromSavingsCents` stays a fact: it records how a purchase was funded at that moment.

### Where a derived value is computed

Ask: _does this screen already have all the inputs?_

- **Convex query**: anything that would need downloading many rows (savings summary from daily totals, month totals).
- **Vue `computed()` via shared pure fn**: per-goal allocation, progress, purchase preview. Goals page gets ordered goals + `availableSavingsCents`.
- **Convex mutation**: anything that decides what gets written (final purchase funding split). Never trust browser numbers. Mutation returns the split; UI displays it.

### Savings formula (replaces stored position, close cursor, hourly cron)

```
N              = eligible closed days   (savingsStartLocalDate .. yesterday; empty days count)
closedPosition = N × allowance − Σ totalSpent over closed days
today          = fromSavings_today + max(0, (spent_today − fromSavings_today) − allowance)
position       = closedPosition − today
available      = max(0, position)      shortfall = max(0, −position)
```

Acceptance example: 3 closed days × $50, $125 spent ($110 daily budget + $15 savings) → $25. Today $8 over → **$17 available**. Preserve existing `projectCurrentReserve` semantics; port its tests.

## Schema (money tables)

```ts
households:  name, inviteCode, ownerId, allowanceCents: int64, timeZone,
             pendingTimeZone?, pendingTimeZoneEffectiveAt?,   // kept, resolved on read (see D3)
             savingsStartLocalDate?: string, createdAt
expenses:    householdId, name, notes, amountCents: int64, localDate,
             fromSavingsCents: int64 (0n default), goalId?: id("goals")
             index by_household_and_local_date  // order within day = _creationTime; drop `date`
goals:       (was wantItems) householdId, name, estimatedCostCents, priority, notes,
             status: "idea" | "saving" | "on_hold" | "purchased", order?, audit fields, expenseId?
income:      (was windfall) householdId, source, notes, amountCents, localDate
debts:       creditor, isPriority, householdId, paymentCents: int64, order?
dailyBudgetTotals: householdId, localDate, totalSpentCents, spentFromSavingsCents
chatMessages, users: unchanged
```

Deleted: `goalReserveStates`, `goalSavingsStates`, `savingsMigration`, all float money fields, `moneyMigrationCompletedAt`, optional-field fallbacks, `reserveMaintenance`/`savingsMaintenance`, the cron, `migrations/`, "syncing" state (backend + UI). Budget impact is always `totalSpent − spentFromSavings`; no stored field.

## Decisions

Settled:

- Integer cents everywhere; `localDate` required; expenses drop the timestamp.
- Derived savings; no stored position, cursor, cron or daily-balance snapshot table.
- Savings start: optional `savingsStartLocalDate`, set once the day the first goal enters `saving`; first eligible day is the next local date (preserves today's behavior).
- Chart history is **by expense date** (reconstructed, edits revise past points). No immutable snapshots.
- Per-goal funding progress and purchase-loss preview **stay** (move to Vue). Revisit only if you say they're not needed.
- Brand stays **Daily Funds**; The Money Talk is exploration only.
- Time zone change keeps "takes effect at next household midnight", resolved on read (no cron).

Need your call (defaults in bold):

- **D1** Editable daily budget soon? **No: single `allowanceCents` now.** If yes: `allowancePeriods(effectiveFromLocalDate, dailyAllowanceCents)` from day one, else a $50→$60 edit rewrites history.
- **D2** Dev wipe: all tables, fresh deployment (assumed).
- **D3** Prod reset: **money-only** (delete expenses, goals, income, debts, rollups, savings state; keep users, households, chat), patch `allowanceCents`/`timeZone` onto households first. Or full wipe + re-sign-up. Separate release step.
- **D4** Time zone: keep deferred switch (above) or take effect immediately (simpler, but can release or skip a day of savings).

## Phases

Working agreement: read `convex/_generated/ai/guidelines.md` first. You type source; I write tests, give full code per step, wait for "done", then `vp check` / `vp test`. Update Progress after every step. Each phase ends green.

**P0 Triage (no behavior change)**

1. Working tree has an unfinished rename: keep UI wording, component and test copy renames. Drop backend compat (`goalSavingsStates` dual table, `savingsMigration`, `migrations/renameSavings*`, `v2` retry statuses, `savings_syncing`). Commit a checkpoint branch first.
2. Home: remove unused subscriptions (`useExpenses`, `useWindfall`, debt-total) from the parent; subscribe in the child that renders them. Measure subscription count before/after.

**P1 Shared pure math (tests first)**

- `shared/utils/local-date.ts` (moved from `want_reserve.ts`; importers: budget, expenses, households, `use-date.ts`).
- `shared/utils/money-cents.ts`: one positive-cents assertion.
- `shared/utils/savings.ts`: position/available/shortfall from totals (above), with the acceptance fixtures.
- `shared/utils/goal-allocation.ts`: allocate over ordered goals, items keep their identity (compare before/after by `_id`, not index); purchase preview = allocate twice, diff by id.
- One `budgetImpact(totalSpent, fromSavings)`.

**P2 Convex cutover on a fresh dev deployment**

- New schema; households, expenses (+ totals cache in same mutation), goals, income, debts.
- `savings.getSummary({})`: reads household + totals + today; **no `now` arg** (page keys on household budget date; refresh at midnight, tz change, tab focus).
- Goal queries: ordered goals + savings summary; reuse `loadActiveGoalQueue` validation. Build validators from `schema.tables.goals.validator`.
- `purchase` / `correctPurchase` / `undoPurchase`: compute split inside mutation; correction = recompute without that purchase. One `requireLinkedPurchase` (household check, goal↔expense both directions, funding bounds). All return `{ status: "ok", ... }`.
- Delete maintenance, cron, migrations, legacy-money helpers.
- Fixtures: activation, no-spend day, overspend, backdated expense, correction, undo, midnight, tz change both directions.

**P3 Frontend wiring**

- Goals page: `computed()` allocation/progress; purchase dialog preview local (no request per keystroke); show mutation's returned split.
- Remove all "syncing" UI/retry paths; collapse `use-want-list` action wrappers (table-driven).

**P4 Naming pass** (UI can ship before P2 if needed)

| Now                                          | New                                                                                                             |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Reserve / Goal reserve                       | Savings; "Available savings"; item: "Saved toward this goal"                                                    |
| Wants                                        | Goals (`wants` route/files → `goals`)                                                                           |
| Considering / Plan for it / Not now / Bought | Ideas / Saving for / On hold / Purchase history (action: "Start saving")                                        |
| Potential tonight                            | Estimated savings from today                                                                                    |
| Reserve recovery                             | Savings shortfall ("Your next $18 of unused budget will cover this")                                            |
| Purchase / Complete purchase                 | Record purchase; Amount paid / From savings / From daily budget                                                 |
| + / Add transaction / Add Spending           | Add expense (Transactions = history incl. in/out)                                                               |
| H / M / W / H nav                            | Home / Transactions / Goals / Household                                                                         |
| Windfall                                     | One-off transactions; button "Add income" (form is positive-only; Money in/out later)                           |
| Total Snowball                               | Total debt payments (calc already sums all debts)                                                               |
| depts / `/mydepts`                           | debts / `/mydebts`. **Bug:** debt add component calls `api.expenses.createExpense`; wire to debt creation first |

Update `GLOSSARY.md` and accessible names in the same change.

**P5 Savings chart**: `savings.getHistory({ days })` walks the same pure fn per day; line chart "Savings balance at day end", zero line, "Available now" shown separately. `@tanstack/charts` + `d3-shape` already installed.

**P6 Temporal swap** (independent): `shared/utils/temporal.ts` re-exports `temporal-polyfill`; rewrite date helpers and replace `@formkit/tempo` (6 files; `format`, `tzDate`, `addMonth`, `monthStart`, `dayStart`). Verify the polyfill bundles in the Convex runtime before committing. Swap to native when Safari + Convex ship it.

**P7 Prod money-only reset** (D3): widen → patch households → wipe money tables → deploy new schema → verify sign-in, create goal, record expense, purchase. Separate release.

## Risks

- Reads grow: ~365 small total rows per year of savings history. Benchmark a purchase on years of data; add a monthly cache only if needed.
- Convex subscriptions re-run on DB change, not clock: midnight refresh must be a client date change, not a timer re-running the old query.
- Past days change if old expenses or (later) the allowance change. Accepted.

## Progress

- [x] P0 triage (checkpoint 4d48396; removed rename migration, reserve shims, goalReserveStates/savingsMigration, table mirroring; Home 5 subscriptions -> 1; dual fields/apiVersion/syncing left for P2)
- [ ] P1 shared math
- [ ] P2 Convex cutover
- [ ] P3 frontend wiring
- [ ] P4 naming pass
- [ ] P5 chart
- [ ] P6 Temporal
- [ ] P7 prod reset

_2026-11-18: plan written; awaiting D1–D4._
_2026-11-18: D1-D4 accepted at defaults. P0 done, 236/236 tests, vp check clean._
