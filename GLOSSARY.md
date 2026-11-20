# Glossary

Domain terms used in code, tests and plans. Keep names here in sync with the code.

## Household and access

- **Household**: the tenant. Owns the daily allowance (`allowanceCents`), its time zone, goals, expenses, income and debts.
- **Household member**: a signed-in user whose `householdId` points at an existing Household. Resolved only on the server by `requireHouseholdMember` / `findHouseholdMember` (`convex/lib/household_access.ts`); functions never accept a client-supplied household id.
- **Stored vs effective time zone**: `household.timeZone` is stored. A time-zone change is saved as `pendingTimeZone` with `pendingTimeZoneEffectiveAt` (the next local midnight in the current zone) and becomes the effective zone once that time has passed. It is resolved on read by `getEffectiveTimeZone`; nothing promotes it.
- **Local date**: a household-local `YYYY-MM-DD` string. The key for daily budget totals.

## Money

- **Cents**: all money is integer `bigint` cents (`shared/utils/money-cents.ts`). There are no float money fields.
- **Expense**: spending. Has a required **local date** (`expenses.localDate`): the day it counts against, fixed when written.
- **Goal purchase**: an expense linked to a goal (`expenses.goalId`). `fromSavingsCents` is the part paid from savings. Edited only from the Goals page.
- **Budget impact** ("From daily budget"): `amountCents − fromSavingsCents`; the part of an expense that counts against the daily allowance (`budgetImpact` in `shared/utils/savings.ts`).
- **Daily budget totals**: per Household and local date, `totalSpentCents` and `spentFromSavingsCents` (`dailyBudgetTotals`). Budget impact is derived from them.
- **Income** ("One-off transactions"): one-off money in or out (`income`, signed `amountCents`). Shown on `/income`; does not affect savings.
- **Debt**: a recurring payment (`debts`, `paymentCents`). "Total debt payments" sums them.

## Savings

Savings are derived on read; no balance is stored.

- **Savings start** (`households.savingsStartLocalDate`): the first local date that earns savings. Set when the first goal starts saving.
- **Savings position**: `allowance × closed eligible days − spending charged to those days`, minus today's spending from savings. Calculated by `calculateSavings` (`shared/utils/savings.ts`); read through `getSavingsSnapshot` (`convex/lib/savings_account.ts`).
- **Available savings**: the position floored at zero, after today's overage. What goals and purchases can use.
- **Savings shortfall**: how far below zero savings are (`shortfallCents`, shown as "Your next $X of unused budget will cover this").
- **Estimated savings from today**: `allowance − today's budget impact` when today is under budget (`projectedEndOfDayContributionCents`). An estimate until the day ends.
- **Savings account**: the module that writes household money (`convex/lib/savings_account.ts`): expenses, goal purchases and daily budget totals.

## Goals

- **Goal**: something the Household might buy (`goals`). Status `idea` (Ideas), `saving` (Saving for), `on_hold` (On hold) or `purchased` (Purchase history).
- **Active goal queue**: the ordered `saving` goals (max 100). Available savings fund them in order (`allocateSavings` in `shared/utils/goal-allocation.ts`); allocations are computed, never stored.
- **Record purchase**: buying a goal being saved for. Creates a linked expense paid from savings first, then from the daily budget. The Goals page previews the split locally (`previewGoalPurchase`); the server recalculates it when the purchase is recorded. A **purchase correction** re-funds it as if the original purchase never happened; **undo** removes the expense and puts the goal back at the bottom of Saving for.
