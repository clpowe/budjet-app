# Glossary

Domain terms used in code, tests and plans. Keep names here in sync with the code.

## Household and access

- **Household**: the tenant. Owns the daily allowance (`allowanceCents`), its time zone, Wants, expenses and the reserve.
- **Household member**: a signed-in user whose `householdId` points at an existing Household. Resolved only on the server by `requireHouseholdMember` / `findHouseholdMember` (`convex/lib/household_access.ts`); functions never accept a client-supplied household id.
- **Stored vs effective time zone**: `household.timeZone` is stored. The effective zone is a scheduled `pendingTimeZone` once its effective time has passed. Reserve days close in the stored zone; the pending zone is promoted only after the last day of the old zone has closed.
- **Local date**: a household-local `YYYY-MM-DD` string. The key for rollups, reserve days and ledger entries.

## Money

- **Cents**: all money is integer `bigint` cents. Legacy float `amount` fields are dual-written for old readers only.
- **Expense**: spending. Has a **stored local date** (`expenses.localDate`): the day it counts against, fixed when it is written and never recomputed from the current zone. Moving an expense's timestamp re-keys it in the effective zone at that moment.
- **Budget impact**: `amountCents − reserveUsedCents`; the part of an expense that counts against the daily allowance.
- **Daily budget rollup**: per Household and local date, totals of expense, reserve-funded and budget-impact cents.

## Goal reserve

- **Reserve account**: the module that moves household money (`convex/lib/reserve_account.ts`). Owns every write to reserve state, ledger, reserve days and rollups, plus the money fields of expenses. Every write closes pending days first.
- **Reserve position**: the signed household balance (`goalReserveStates.positionCents`). Always equals the sum of its ledger entries.
- **Reserve day / daily close**: a finished local day. Its contribution is `allowance − budget impact` and is added to the position.
- **Close cursor**: `lastClosedLocalDate`, the last closed reserve day.
- **Reserve syncing**: a write found more pending days than one transaction may close (31). It closed what it could, scheduled the rest for that Household, and did nothing else. Clients ask the user to retry.
- **Closed-day correction**: an expense change on an already-closed day. Patches that reserve day and moves the position by the opposite of the budget-impact change.
- **Reserve snapshot**: live read of the reserve at a moment: available reserve, recovery amount, today's overage and projected end-of-day contribution.

## Wants

- **Want**: something the Household might buy. Status `considering`, `plan_for_it`, `not_now` or `bought`.
- **Active Want queue**: the ordered `plan_for_it` Wants (max 100). Reserve allocations to them are derived, never stored.
- **Purchase**: buying a planned Want. Creates a linked expense funded from the reserve first. A **purchase correction** re-funds it from the reserve as if the original purchase never happened; **undo** removes the expense and returns its funding.
