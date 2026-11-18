# Glossary

Domain terms used in code, tests and plans. Keep names here in sync with the code.

## Household and access

- **Household**: the tenant. Owns the daily allowance (`allowanceCents`), its time zone, Wants, expenses and savings.
- **Household member**: a signed-in user whose `householdId` points at an existing Household. Resolved only on the server by `requireHouseholdMember` / `findHouseholdMember` (`convex/lib/household_access.ts`); functions never accept a client-supplied household id.
- **Stored vs effective time zone**: `household.timeZone` is stored. The effective zone is a scheduled `pendingTimeZone` once its effective time has passed. Days close in the stored zone; the pending zone is promoted only after the last day of the old zone has closed.
- **Local date**: a household-local `YYYY-MM-DD` string. The key for rollups and the close cursor.

## Money

- **Cents**: all money is integer `bigint` cents. Legacy float `amount` fields are dual-written for old readers only.
- **Expense**: spending. Has a **stored local date** (`expenses.localDate`): the day it counts against, fixed when it is written and never recomputed from the current zone. Moving an expense's timestamp re-keys it in the effective zone at that moment.
- **Budget impact**: `amountCents − savingsUsedCents`; the part of an expense that counts against the daily allowance.
- **Daily budget rollup**: per Household and local date, totals of expense, savings-funded and budget-impact cents.

## Savings

- **Savings account**: the module that moves household money (`convex/lib/savings_account.ts`). Owns every write to the savings state and daily budget rollups, plus the money fields of expenses. Every write closes pending days first.
- **Savings position**: the signed household balance (`goalSavingsStates.positionCents`). The only stored savings money; there is no ledger. Moved by savings events (daily close, purchase, undo, correction, closed-day correction).
- **Daily close**: finishing a local day. Its contribution, `allowance − that day's budget impact`, is added to the position. No per-day row is stored; the day's rollup is the record.
- **Close cursor**: `lastClosedLocalDate`, the last closed day. A day is **closed** when `firstEligibleLocalDate ≤ day ≤ lastClosedLocalDate`.
- **Savings syncing**: a write found more pending days than one transaction may close (31). It closed what it could, scheduled the rest for that Household, and did nothing else. Clients ask the user to retry.
- **Closed-day correction**: an expense change on an already-closed day. Moves the position by the opposite of that day's budget-impact change.
- **Savings snapshot**: live read of the savings at a moment: available savings, recovery amount, today's overage and projected end-of-day contribution.

## Wants

- **Want**: something the Household might buy. Status `considering`, `plan_for_it`, `not_now` or `bought`.
- **Active Want queue**: the ordered `plan_for_it` Wants (max 100). Savings allocations to them are derived, never stored.
- **Purchase**: buying a planned Want. Creates a linked expense funded from savings first. A **purchase correction** re-funds it from savings as if the original purchase never happened; **undo** removes the expense and returns its funding.
