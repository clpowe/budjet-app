# Minimal household chat MVP

## Summary

Add one shared, realtime text conversation per household in Home's existing chat area. Show the latest **50 messages**, retain older messages in storage, and keep the UI reusable for future contextual conversations.

Use the existing Convex `1.44.0` and `convex-nuxt` integrations. One new dependency (decided 2026-11-15): VueUse (`@vueuse/core`, `@vueuse/nuxt` 15.0.0) for `useTextareaAutosize` (composer), `useEventListener` (popover `toggle`), and `useMediaQuery` (desktop threshold in `home.vue`).

## Behavior and boundaries

- All current household members can read and send messages equally.
- New members see existing history. Leaving ends access; previously sent messages remain.
- Display sender name, timestamp, and distinct styling for the current user's messages.
- Timestamps render in the browser's local time zone, not the household budget time zone.
- Accept plain text. The server trims, then requires 1–2,000 UTF-16 code units (`body.length`). The client applies the same rule before sending.
- Render text safely with interpolation only: no `v-html`, no Markdown. Preserve line breaks with `white-space: pre-wrap`.
- Show loading, empty, sending, and error states. Preserve the draft on send failure; clear it after success. Prevent repeated submissions while sending.
- Label the history window "Latest 50 messages." Older-history browsing is deferred.
- Excluded: private messages, contextual threads, attachments, reactions, editing/deletion, presence, read receipts, notifications, AI replies, suggested financial actions.
- Accepted risks, deferred: no rate limiting on `send`; no retention or deletion policy, so the table grows without bound.

## Implementation

### Backend and authorization

- Add `chatMessages` to `convex/schema.ts`: `householdId: v.id("households")`, `senderId: v.id("users")`, `body: v.string()`. Index `by_household` on `["householdId"]`, matching existing naming. Convex appends `_creationTime`, which gives chronological order.
- `senderName` is resolved at read time in `list` (changed 2026-11-15: profile name changes must show on old messages): the sender's trimmed `name` if non-empty, otherwise the local part of their email; "Former member" if the user document is missing. One lookup per distinct sender. Reading `users` docs makes the subscription re-run on rename. Names change when `syncUser` copies them from the auth identity.
- Add `convex/chat.ts` with two public functions, both with argument validators:
  - `list({})`: resolve the user with `findCurrentUser`. Return `[]` when unauthenticated or household-less. Otherwise query `by_household` with `.order("desc").take(50)` and reverse, so the result is oldest to newest. Return `_id`, `_creationTime`, `senderId`, `senderName`, `body`, plus `isOwn` computed on the server.
  - `send({ body })`: resolve the user with `getAuthenticatedUser`, require `householdId`, confirm the household document exists, trim and validate, insert, and return the ID.
- Neither function accepts a client-supplied sender or household ID.
- Validation failures throw `ConvexError` with a code (`EMPTY_BODY`, `BODY_TOO_LONG`), because plain `Error` messages are redacted in production. The client maps codes to copy and falls back to a generic "Couldn't send. Try again." for anything else.
- Membership is read inside `list`, so leaving a household invalidates the subscription with no client work.
- No conversation table or contextual identifiers yet. Future contextual chats can introduce those when their ownership rules are defined.

### Reusable UI

- `ChatPanel` (presentation only): renders messages, scroll container, composer, and status. Props: `messages`, `status` (`loading | ready | error`), `sending`, `errorMessage`, and `v-model` for the draft. Emits `submit`. Exposes a header slot so the host can inject controls. No Convex imports.
- `HouseholdChat` (container): subscribes to `api.chat.list`, owns the draft and send lifecycle, maps error codes to copy, and resets the draft when the current user ID changes. Message clearing needs no code; the reactive query handles it.
- Composer: labeled textarea and Send button. Enter sends; Shift+Enter inserts a newline; ignore Enter while `event.isComposing`. Send disabled while sending or when the trimmed draft is empty.
- Rows keyed by `_id`. When the 51st message arrives the oldest row drops; accept the small shift for this release.

### Scrolling

- Scroll to the newest message on: first data load, the popover's `toggle` event when it opens, and after the user's own send succeeds.
- Deferred (decided 2026-11-15, minimal scroll scope): on an incoming message, auto-scroll only when the reader is within about 80px of the bottom. For MVP, incoming messages do not move scroll position.
- The closed mobile drawer is `display: none`, so scrolling on mount alone is not sufficient; the `toggle` handler is required.

### Placement in `app/pages/home.vue`

- Replace the placeholder with `HouseholdChat`. Home keeps ownership of desktop placement and the mobile drawer.
- Home supplies the Close button through the panel's header slot, using `popovertarget="chatpopover" popovertargetaction="hide"`, and hides it at the desktop threshold alongside the existing toggle.
- Escape dismissal and focus return come from the native `popover` attribute. Do not hand-roll them; verify only.
- Keep the desktop column at **1000px of `main-container` width**. Replace the 500px check with `useMediaQuery("(width >= 1000px)")` (VueUse), with a comment noting it mirrors the container rule and depends on `.main-layout` spanning the viewport.
- Override the global `[popover]` `overflow` and `padding` from `main.css` on `.chat-section`, so the panel owns a single scroller with a pinned composer.
- Chat is available on Home's Today and Month views only.

## Validation

**Backend tests** (`convex/chat.test.ts`, following the `convexTest` and `seedHousehold` pattern):

- same-household sharing; cross-household isolation
- unauthenticated and household-less `list` returns `[]`; `send` rejects in both cases
- `send` rejects when the user's `householdId` points to a missing household
- joining shows prior history; leaving ends access while messages remain
- sender attribution, including the email-local-part fallback and `isOwn`
- renaming a user updates `senderName` on their existing messages
- blank, whitespace-only, and oversized input rejected with the right code; body stored trimmed
- chronological order and the 50-message limit

**UI tests** (`tests/nuxt/`):

- `ChatPanel`: loading, empty, and error states; own-message styling; Enter, Shift+Enter, and `isComposing`; Send disabled while sending or empty
- `HouseholdChat`: draft preserved on failure and cleared on success; submission locked while sending; draft resets when the user ID changes

**Manual checks:**

- live delivery across two authenticated browser sessions
- mobile drawer: Close control, Escape, focus return to the toggle
- resizing across 1000px closes an open drawer and shows the column; no close at 500px

**Workflow:**

- Before editing: run the Intent skill discovery/load from `AGENTS.md` and the project setup checks; complete the architectural-co-pilot checkpoints (predicted change locations, chosen implementation unit, three-sentence design entry).
- After implementation: `vp check`, `vp test`, `vp run build`.
- Additive table change with no backfill. Verify in development before production deployment.

## Progress

User types all code. Claude reviews each step and updates this section after every change. Status: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` deferred.

Baseline: `25e303b` on `main`.

### Phase 1 checkpoints

- [-] Intent skill discovery (`pnpm dlx @tanstack/intent@latest list`): skipped by user 2026-11-15
- [x] Predicted files recorded (below)
- [x] Implementation units chosen: user writes all code. Closest review on `send` validation, scroll rules (user unsure these are MVP), `HouseholdChat` send lifecycle.
- [x] Design-journal entries (remaining gaps skipped by user 2026-11-15; left _pending_ in journal) in `docs/design-journal.md` (user's words): three separate entries (user decision: separation of concerns): `convex/chat.ts`, `ChatPanel`, `HouseholdChat`. `docs/design-journal.md` created with user's words; gaps marked _pending_ there.

### Steps

1. [x] Schema: `chatMessages` table + `by_household` index in `convex/schema.ts`
2. [x] `convex/chat.ts` → `list({})` (read-time sender names)
3. [x] `convex/chat.ts` → `send({ body })` (trim/validate, `ConvexError` codes)
4. [x] Backend tests `convex/chat.test.ts`
5. [x] `ChatPanel` (presentation, composer, states, header slot)
6. [x] `HouseholdChat` (container, send lifecycle, error-code copy, draft reset on user change)
7. [x] Scrolling, minimal (first load + own send live in `HouseholdChat`; drawer `toggle` in `home.vue` via exposed `scrollToBottom`): first load, popover `toggle`, own send. Near-bottom auto-scroll on incoming `[-]` deferred.
8. [x] `app/pages/home.vue` placement (Close button via slot, `useMediaQuery("(width >= 1000px)")`, `.chat-section` overflow/padding override)
9. [x] UI tests `tests/nuxt/`
10. [x] `vp check`, `vp test`, `vp run build`
11. [x] Manual checks (two sessions, mobile drawer, 1000px resize)
12. [-] Phase 3 (dropped 2026-11-16: learning protocol removed): predict/observe, extend exercise, predicted-vs-actual files, learning-log entry

### Predicted files (user's prediction, preserved)

Recorded 2026-11-15, verbatim: "I will need to add a convex api create a chat component. that add that component to the homepage"

### Log

- 2026-11-15: Progress tracking added. No code changes yet.
- 2026-11-15: Predicted files and review focus recorded. Journal draft in progress.
- 2026-11-15: Scroll scope set to minimal (rules 1–3). Incoming-message auto-scroll deferred.
- 2026-11-15: Journal split into three entries: `convex/chat.ts`, `ChatPanel`, `HouseholdChat`.
- 2026-11-15: `docs/design-journal.md` created. Recorded: `chat.ts` invariant + rejected alternative, `HouseholdChat` state owner (component unnamed), `ChatPanel` rejected alternative.

- 2026-11-15: Journal: `chat.ts` invariant kept as is; chat-table reconsider clause recorded. User named `ChatPanel` as draft/sending owner, which contradicts plan (`HouseholdChat` owns). Open decision.

- 2026-11-15: Ownership resolved: `HouseholdChat` owns draft + sending flag, per plan. Journal updated.

- 2026-11-15: User skipped remaining journal sentences and Intent discovery. Phase 1 closed. Step 1 started.

- 2026-11-15: Step 1 done. `chatMessages` added to `convex/schema.ts` (4 required fields, `by_household` index), matches contract. `vp check convex/schema.ts` pass; `vp test convex/schema.test.ts` 1/1 pass. Step 2 started.

- 2026-11-15: Step 2 early review. File created as `convex/chats.ts` (plan says `chat.ts`; naming open). Draft is a plain function, not yet a Convex `query`; uses `getAuthenticatedUser` (throws) instead of `findCurrentUser` (returns null). Hints given, no fix supplied. `convex dev` regenerated `_generated/api.d.ts`.

- 2026-11-15: User chose `chat.ts`. Claude renamed `convex/chats.ts` → `convex/chat.ts` (contents unchanged). API path is `api.chat.*`, matching plan.

- 2026-11-15: User override "Just write it" for this session: Claude supplies full code, user types it in. Learning exercises skipped; independent understanding of `list`/`send` deferred. Full `convex/chat.ts` (list + send) supplied.

- 2026-11-15: Contract change (user): sender names follow profile renames. `senderName` removed from `chatMessages` schema; `list` resolves names from `users` at read time. Plan sections updated.
- 2026-11-15: Steps 2–3 done. User typed code into stale `convex/chats.ts` tab; Claude moved it over the old `chat.ts` stub. `vp check` on `chat.ts` + `schema.ts` pass; `vp test convex` 54/54 pass (no chat tests yet). `_generated/api.d.ts` now lists `chat`. Step 4 started.

- 2026-11-15: `convex/chat.test.ts` supplied (8 tests covering every backend validation bullet). Claude dry-ran it as a temp file: 8/8 pass, `vp check` clean; temp file removed from repo.

- 2026-11-15: Step 4 done. User typed `convex/chat.test.ts`. `vp test convex` 62/62 pass (54 existing + 8 chat); `vp check convex/chat.test.ts` clean. Backend complete.

- 2026-11-15: Step 5 code supplied: `app/components/chat/panel.vue` (auto-imports as `<ChatPanel>`), new `shared/utils/chat-message.ts` (`CHAT_MESSAGE_MAX_LENGTH`, `getChatBodyError`) shared by server and client, and a small `send` refactor in `convex/chat.ts` to use it. `ChatPanel` exposes `scrollToBottom()` for step 7. Claude smoke-tested drafts (Enter/Shift+Enter/isComposing, disabled states, too-long hint, loading): pass; drafts removed from repo. Note: `vp check` does not type-check `.vue` files (no `vue-tsc`).

- 2026-11-15: User approved VueUse. Claude ran `vp add @vueuse/core @vueuse/nuxt` (15.0.0; `package.json` + `pnpm-lock.yaml` changed). Peer warning is pre-existing (`vitest` vs `@nuxt/test-utils`/`better-auth`), unrelated. `"@vueuse/nuxt"` must be added to `modules` in `nuxt.config.ts` (user types). `ChatPanel` draft updated to `useTextareaAutosize` (max 160px, `resize: none`); smoke test re-run: pass; temp files removed.

- 2026-11-15: `ChatPanel` timestamps switched from `Intl.DateTimeFormat` to Tempo `format({ date, format: "MMM D, h:mm A" })` with no `tz` (browser local). `useDate()` rejected: it formats in the household budget zone (plan requires browser local) and would couple the presentation component to household data.

- 2026-11-15: Step 5 done. User typed `@vueuse/nuxt` module, `shared/utils/chat-message.ts`, `send` refactor, `app/components/chat/panel.vue`. Panel relies on Nuxt auto-imports (Vue APIs, `useTextareaAutosize`, `shared/utils` exports) instead of explicit imports; confirmed working. Temp smoke test pass (incl. Tempo time + too-long hint), removed. `vp test convex` + smoke 63/63; `vp check` on 4 files clean.

- 2026-11-15: Step 6 code supplied: `app/components/household-chat.vue` (`<HouseholdChat>`). Uses `useConvexQuery(api.chat.list)`, `useConvexMutation(api.chat.send)`, `useConvexUser()`; maps `ConvexError` codes to copy; passes header slot through to `ChatPanel`; also does step 7's first-load and own-send scroll and exposes `scrollToBottom` for home's drawer `toggle`. Claude smoke-tested with mocked composables (failure keeps draft + copy, success clears, double submit blocked, user change resets): pass; drafts moved to scratchpad (smoke test kept there for step 9).

- 2026-11-15: User typed `app/components/household-chat.vue`. Read review: logic matches supplied code (`toErrorCopy` renamed `convertToErrorCopy`, two comments dropped). Formatting off on lines 9–16 (missing semicolons/spacing) and an extra blank line before `<template>`; `vp check --fix` should resolve. Checks NOT run: Claude's shell returned exit 1 for every command, including `pwd`. Step 6 not ticked.

- 2026-11-15: Step 6 done. User ran `vp check --fix`; formatting fixed. Claude's shell recovered and re-verified: `vp check` on `household-chat.vue` + `panel.vue` clean; smoke test + `convex` tests 63/63 pass; temp test removed. Step 8 started (also finishes step 7's drawer `toggle` scroll).

- 2026-11-15: Step 8 code supplied for `app/pages/home.vue`: `HouseholdChat` replaces placeholder; Close button via header slot (`popovertargetaction="hide"`, hidden at desktop); `useMediaQuery("(width >= 1000px)")` + `watch` replaces manual `matchMedia(500px)` listener; `useEventListener(chatPopover, "toggle")` scrolls to newest on open (finishes step 7); `.chat-section` gets `overflow: hidden` + explicit padding. Addition beyond plan: desktop column is `position: sticky; top: 0; height: 100dvh` so the composer stays reachable on long pages. Claude checked a temp swap (`vp check` clean), original restored. Not yet runtime-tested.

- 2026-11-16: Steps 7–8 done. User applied `home.vue` edits; matches supplied code (explanatory comments dropped). `vp check` clean (204 files formatted, 129 linted). `vp run build` pass. `vp test` 181/182: the 1 failure is old, not chat-related: `tests/nuxt/wants-page.test.ts` > "includes Wants in the primary navigation" throws `Context not found` because `AppHeader` renders `<expenses-add>`, which calls `useConvexQuery` and the test does not mock it (`expenses/add.vue` last changed in `44fd88e`). Browser behaviour not yet checked (step 11). Step 9 started.

- 2026-11-16: User asked Claude to write the tests directly this time (exception to "user types code"). Old test fixed: `tests/nuxt/wants-page.test.ts` AppHeader test now stubs `ExpensesAdd` (it subscribes to Convex) and checks that the `/wants` link exists. The old check for the text "Wants" was dropped, because nav links now read single letters ("W"; two links read "H"). The nav links have no clear accessible names; that gap is noted here and not fixed (outside chat scope).
- 2026-11-16: Step 9 done. `tests/nuxt/chat-panel.test.ts` (14): loading, error, and empty states; own-message class; text-only bodies; Enter, Shift+Enter, `isComposing`; Send disabled when empty, whitespace-only, while sending, or over 2,000 characters; exactly 2,000 allowed. `tests/nuxt/household-chat.test.ts` (9, mocked Convex composables): status mapping; success clears the draft; failure keeps the draft, with code copy and generic copy; retry clears the error; locked while in flight; user change resets the draft and error.
- 2026-11-16: Step 10 done. `vp check` clean (206 formatted, 131 linted); `vp test` 205/205 (37 files); `vp run build` pass. Not yet checked: browser behaviour (step 11).

- 2026-11-16: Step 11 browser run (Claude drove the in-app browser; user signed in, since auth posts to the `*.convex.site` host). Pass: desktop column at 1280px; chat toggle and Close hidden; send via Enter; Shift+Enter keeps a newline; `pre-wrap` body; draft cleared; own-message styling; timestamp in browser local time (America/New_York). Mobile at 390px: drawer opens; Close works; Escape works; focus returns to toggle after both; Tab from toggle goes into the drawer. Resize: drawer stays open at 700px (no close at 500); growing to 1100px closes it and shows the sticky column.
- 2026-11-16: Bug found (step 7 scroll): on the drawer's first open the newest ~22px are hidden. Cause: while closed (`display: none`), `useTextareaAutosize` sets the textarea to `0px`. The `toggle` handler scrolls to the bottom, then autosize grows the textarea to 28px, the message list shrinks, and `scrollTop` (42) is no longer the max (64). Later opens are fine. Fix proposed in `ChatPanel` (keep the list pinned to the bottom when the scroller resizes while at bottom); awaiting go-ahead.
- 2026-11-16: Noted, outside chat scope: (1) `home.vue` line 93 has a placeholder `<div>Toggle <button>chat</button></div>`; at desktop the button hides but the stray "Toggle" text stays visible. (2) In dark color scheme the page has no `html`/`body` background, so the main area renders dark with black text. Both predate the chat work. Live delivery across two sessions is not yet observed; it needs a second signed-in member.

- 2026-11-16: Scroll fix applied by Claude (user: "Yes, apply it"). `ChatPanel` now uses `useScroll(scroller).arrivedState` + `useResizeObserver(scroller)`: when the list's box resizes and the reader was at the bottom, it scrolls to the bottom again. Browser recheck at 390px with a fresh load: first drawer open now ends at max (64/64), newest message fully visible. Guard check: scrolled to the top, then grew the composer to 100px; the list stayed at 0 (no jump). The test draft was cleared, not sent. Incoming-message auto-scroll is still deferred (content growth does not resize the scroller box). `vp check` clean. `vp test` 208/211: the 3 failures are in `convex/purchases.test.ts`, which the user is editing (shows modified in git, not touched by Claude); not chat-related.

- 2026-11-16: Step 11 done. Live delivery checked (user chose `convex run`). Confirmed the deployment is `dev:`. Claude found the second household member (Ashley Powe, same household) without printing emails or keys, then ran `npx convex run chat:send` with `--identity` built from her `identityKey` (issuer|subject). Body clearly labeled: "[Test] Live delivery check sent by Claude via convex run". The browser tab, signed in as Christopher, got it through the open subscription with no reload, about 1.2s after the command started (includes `npx` startup). Attributed to "Ashley Powe", not `is-own`. The temporary users export in the scratchpad was deleted. The test message remains in the dev database; there is no delete in the app yet, so remove it from the Convex dashboard if wanted.

- 2026-11-16: Phase 3 started. Scope compared and `docs/learning-log.md` created with the task entry and module index (next cold drill 2026-11-30). Prediction matched at module level. Missed: `schema.ts`, `shared/utils/chat-message.ts`, and config/deps for VueUse. Unrelated user edits excluded: `convex/purchases.test.ts`, `tests/unit/want-reserve.test.ts`. Predict (leave-household case) and Extend (single source for the 50-message limit) offered; awaiting user.

- 2026-11-16: User dropped the learning protocol. Removed: the co-pilot section of `AGENTS.md` and `.agents/skills/architectural-co-pilot/`. Predict/Extend not done; step 12 dropped. Implementation steps 1–11 complete.

- 2026-11-16: `docs/design-journal.md` and `docs/learning-log.md` deleted at the user's request (learning protocol removed). Earlier log entries that mention them are history.

Status: implementation complete and verified; nothing committed. Open: none for chat. Noted outside scope: stray "Toggle" text in `home.vue`, no page background in dark mode, AppHeader nav links lack accessible names.
