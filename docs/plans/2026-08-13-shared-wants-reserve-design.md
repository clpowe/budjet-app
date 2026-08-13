# Shared Wants and Goal Reserve Design

**Date:** 2026-08-13
**Status:** Approved

## Summary

Daily Funds will add a household-shared **Wants** feature for purchases people want to consider before buying. Items can move through **Considering**, **Plan for it**, **Not now**, and **Bought**. Active items form a manually ordered queue funded from one shared goal reserve.

The reserve begins at zero when the household first puts an item into **Plan for it**. Completed-day underspending increases it, overspending decreases it, and the signed position carries across months. The queue does not create separate savings pots. Instead, the UI allocates the available shared reserve to active items in order, filling the first item before the next.

The experience must frame tradeoffs constructively. It should say what would make a purchase possible and when it may be ready, rather than saying the household cannot afford it.

## Goals

- Give household members a shared place to capture desired purchases.
- Make the effect of a planned purchase visible without reserving its full cost immediately.
- Tie progress directly to daily spending decisions.
- Support savings that accumulate across calendar months.
- Keep purchase history, reserve usage, and ordinary budget impact reconcilable.
- Let all household members collaborate equally while preserving attribution.
- Keep the implementation compatible with the existing Nuxt, Convex, and Cloudflare Workers architecture.

## Non-goals for the first release

- Separate reserve pots per person or per item
- Owner approval workflows
- Recurring manual contributions
- Item images, product links, or price tracking
- Notifications or reminders
- Returns and refund workflows
- Automatic queue reordering based on priority or target date
- Importing surplus from before the reserve was activated

## Product model

### Item fields

Each want item contains:

- Name
- Estimated cost
- Priority: `high`, `medium`, or `low`
- Optional target date
- Optional notes
- Status: `considering`, `plan_for_it`, `not_now`, or `bought`
- Manual queue position when active
- Creator and creation/update timestamps
- Purchaser, purchase timestamp, and linked expense after purchase

Priority is descriptive and filterable. It never overrides manual queue order.

### Status lifecycle

**Considering** items remain visible and show an impact preview, but receive no reserve allocation.

Moving an item to **Plan for it** appends it to the active queue. If this is the household's first active item, reserve accounting starts at zero at that moment. Returning an inactive item to the plan also appends it to the bottom until someone reorders it.

**Not now** preserves an idea without affecting the active plan.

**Bought** is entered through the purchase flow so that the item, reserve withdrawal, and expense stay linked. Bought items remain available as history.

All household members may add, edit, reorder, change status, and purchase items. The system records who created an item and who marked it bought.

## Reserve and allocation model

### One shared reserve

The household owns one signed reserve position. The UI derives item allocations by walking the active queue from top to bottom:

1. Start with `max(reservePosition, 0)`.
2. Allocate up to the first item's estimated cost.
3. Carry any remainder to the next item.
4. Continue until the reserve is exhausted or all active items are filled.

Reordering never moves money between persisted item pots because item pots do not exist. It simply recalculates the allocation view from the shared reserve. This makes rebalancing immediate and prevents stale earmarks from surviving a priority change.

### Completed-day contribution

For each completed household-local day:

```text
daily contribution = snapshotted daily allowance - budget-impacting spending
```

The signed contribution is recorded in the reserve ledger and applied to the cached household position. Positive contributions move goals forward. Negative contributions move them back.

The position may become negative. The UI shows zero available for allocation and explains the recovery amount positively, for example: "Your next $12 of savings gets the plan moving again." Future surpluses first repair the negative position before funding items again.

No historical surplus is imported when the feature is activated.

### Current-day behavior

Unused allowance from the open day is not funded progress. It appears separately as **Potential reserve tonight**.

If current-day budget-impacting spending exceeds today's allowance, the excess immediately reduces the visible reserve position. This live adjustment avoids showing an item as ready when today's decisions have already moved it farther away.

At household-local midnight, the daily result is finalized in the ledger. A later edit to a transaction from a closed day records a correction and updates the cached reserve position in the same transaction.

### Household timezone

Each household gains an IANA timezone. New households default it from the owner's browser; existing households default to `America/New_York`. Every member shares the same day boundary.

A timezone change takes effect at the next local-day boundary so an already-open day is never reinterpreted midway through the day.

## Purchase accounting

Purchasing an item is one atomic operation. The member supplies the actual amount and purchase date. The backend calculates:

```text
reserve used = min(actual amount, currently available shared reserve)
general-budget impact = actual amount - reserve used
```

Reserve use may consume progress currently displayed on lower-priority items. The confirmation view must disclose that effect before purchase.

The operation:

1. Catches up any reserve state that must be finalized.
2. Calculates the available reserve and lower-item impact.
3. Creates a linked expense for the full actual amount.
4. Records a reserve withdrawal.
5. Updates the cached reserve position.
6. Marks the item Bought with purchaser and purchase time.
7. Removes it from the active queue, causing the remaining reserve to rebalance.

The expense stores the linked want item and the amount of reserve used. The general ledger displays a marked breakdown such as:

```text
$120 total · $100 from reserve · $20 budget impact
```

Budget summaries use actual expense outflows together with signed reserve-ledger movements. A reserve withdrawal offsets the funded part of the purchase in the active budget period, so a purchase saved across prior months does not make the current month appear over plan. Only the unfunded remainder affects ordinary spending performance.

For example, a $100 item bought for $120 with $100 available produces:

- Expense amount: $120
- Reserve used: $100
- General-budget impact: $20
- Reserve remaining: $0
- Item status: Bought

If the shared reserve contains $150, the same purchase uses $120 from the reserve, including $20 previously displayed on the next item. The purchase confirmation names that consequence.

### Corrections and undo

A linked purchase cannot be edited through a generic expense form. A dedicated correction flow updates the purchase amount and reconciles reserve usage transactionally.

Undoing a purchase removes the linked expense, reverses the reserve withdrawal, restores the item to **Plan for it**, appends it to the active queue, and recalculates allocations. Returns and refunds are deferred to a later release.

## Guidance and forecasting

Target dates are advisory. They never reorder the queue or alter allocation.

Guidance examples include:

- "Set aside $8/day to have this ready by October 1."
- "At your recent pace of $20/day, this could be ready in about a week."
- "Every $10 set aside moves this closer."
- "Today's spending moved this $5 farther away."
- "You've made room for this."

For an item with a target date, the daily amount is its remaining unfunded cost divided by the remaining household-local days. Without a target date, forecasts use a clearly labeled recent completed-day reserve pace. When there is not enough positive history for a useful forecast, the UI shows a small constructive step without promising a ready date.

## User experience

### Home

The Home dashboard separates:

- **Safe to spend**
- **Reserved for wants**
- **Potential reserve tonight**

A compact top-item card appears directly below safe-to-spend. It shows:

- Item name
- Estimated cost
- Current derived allocation
- Progress bar
- Amount remaining
- Estimated ready date or target-date pace
- Potential contribution from the current day
- A link to the full Wants page

### Wants page

The primary navigation gains a **Wants** link to `/wants`.

The page contains:

1. Reserve summary and top-goal forecast
2. Add-item action
3. Active **Plan for it** queue
4. Considering items
5. Not now items
6. Collapsible Bought history

The active queue supports pointer drag-and-drop and keyboard-accessible Move up/Move down actions. A complete ordered ID list is sent to one atomic reorder mutation.

The purchase confirmation shows the actual cost, reserve used, general-budget impact, and progress that will be removed from lower items.

Loading, empty, pending, success, and failure states are explicit. Mutation buttons prevent duplicate submission. Errors use user-safe language and preserve entered form data.

## Frontend architecture

The design follows the project's Vue and Nuxt conventions:

- `/wants` is a thin route-level controller.
- `useWantList` owns the single reactive Convex data path and focused mutation methods.
- Business calculations remain server-owned or in pure shared utilities rather than being duplicated in templates.
- Humble components render the reserve summary, top-goal card, queue, item row, forms, purchase confirmation, and status sections.
- A small strategy map owns status labels, tones, and permitted actions.
- The Home page consumes a compact backend summary instead of duplicating queue allocation logic.
- State ownership and mutation paths remain explicit; no global store is needed.

The app remains client-rendered, so the feature introduces no new Nuxt server route or privileged browser/server boundary.

## Backend architecture

Convex remains the only durable backend. The feature does not add Cloudflare KV, D1, R2, Durable Objects, queues, or Worker-side persistence.

### Tables

`wantItems` stores household-scoped item state, ordering, attribution, and purchase linkage.

`goalReserveState` stores one cached signed reserve position per household, the activation timestamp, the effective timezone state, and the most recently closed local day.

`goalReserveLedger` stores auditable daily contributions, corrections, and purchase withdrawals. Entries carry household, type, signed amount, local date, source references, actor where applicable, and timestamps.

Existing `expenses` gain optional `wantItemId` and `reserveUsed` fields. Existing documents remain valid.

Indexes must support bounded household/status queue reads, household/local-date ledger reads, and source-reference reconciliation. All growing list APIs use bounded reads or pagination.

### Day closing

A bounded scheduled Convex job periodically finds households with local days that need closing. It snapshots the applicable allowance and timezone for each daily entry. Work is paginated and continued through scheduled internal functions rather than scanning every household in one transaction.

Reserve-sensitive mutations also catch up required state transactionally before calculating availability. Queries include the open day's live negative adjustment and potential positive contribution without writing wall-clock-derived state.

### Authorization and concurrency

Every public function derives the authenticated user and household server-side. Functions never trust a client-supplied user or household ID for authorization.

Mutations validate that referenced items and expenses belong to the current household and are in valid states. Purchasing updates the item, expense, ledger, and cached reserve together, preventing two concurrent purchases from spending the same reserve. Reordering verifies a complete, unique set of active item IDs for the current household.

If a reorder is stale because another member changed the queue, the server rejects it. The client returns to the authoritative reactive order and explains what changed.

## Testing and verification

### Pure logic tests

- Ordered allocation across zero, one, and many items
- Rebalancing after reorder and status changes
- Negative reserve positions and recovery
- Target-date and recent-pace forecasts
- Current-day potential versus funded progress
- Budget-summary invariants before and after funded purchases

### Convex tests

- Household authorization for every read and mutation
- Activation at zero with no historical backfill
- Atomic reorder validation
- Multi-month reserve carryover
- Positive and negative daily close entries
- Historical expense correction
- Household timezone and daylight-saving boundaries
- Fully funded, partially funded, over-estimate, and lower-item-consuming purchases
- Purchase correction and undo
- Concurrent purchase attempts
- Bounded query and scheduled-job behavior

### Nuxt tests

- Loading, empty, active, negative, ready, and error states
- Status actions and form validation
- Purchase-impact disclosure
- Progress display and encouraging copy
- Pointer and keyboard reordering
- Duplicate-submission prevention
- Home top-item summary
- General-ledger reserve marker

### Release checks

- `vp check`
- `vp test`
- `vp build`
- Cloudflare/Wrangler dry-run
- Convex type generation and deployment validation for the target environment

## Success criteria

- Two household members see queue changes reactively and in the same order.
- Completed-day underspending and overspending adjust the shared reserve correctly across month boundaries.
- The top item shows when it is funded and how daily choices change that date.
- A reserve-funded purchase is visible in the general ledger without falsely creating a current-month budget spike.
- The full purchase, reserve, and status update cannot partially commit.
- Every reserve movement can be explained from ledger entries.
