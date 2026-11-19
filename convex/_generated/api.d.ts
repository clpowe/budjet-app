/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as budget from "../budget.js";
import type * as chat from "../chat.js";
import type * as depts from "../depts.js";
import type * as expenses from "../expenses.js";
import type * as households from "../households.js";
import type * as http from "../http.js";
import type * as lib_active_want_queue from "../lib/active_want_queue.js";
import type * as lib_auth_origin from "../lib/auth_origin.js";
import type * as lib_daily_budget_totals from "../lib/daily_budget_totals.js";
import type * as lib_helpers from "../lib/helpers.js";
import type * as lib_household_access from "../lib/household_access.js";
import type * as lib_savings_account from "../lib/savings_account.js";
import type * as lib_want_savings from "../lib/want_savings.js";
import type * as savings from "../savings.js";
import type * as test_utils_seed from "../test_utils/seed.js";
import type * as users from "../users.js";
import type * as wants from "../wants.js";
import type * as windfall from "../windfall.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  budget: typeof budget;
  chat: typeof chat;
  depts: typeof depts;
  expenses: typeof expenses;
  households: typeof households;
  http: typeof http;
  "lib/active_want_queue": typeof lib_active_want_queue;
  "lib/auth_origin": typeof lib_auth_origin;
  "lib/daily_budget_totals": typeof lib_daily_budget_totals;
  "lib/helpers": typeof lib_helpers;
  "lib/household_access": typeof lib_household_access;
  "lib/savings_account": typeof lib_savings_account;
  "lib/want_savings": typeof lib_want_savings;
  savings: typeof savings;
  "test_utils/seed": typeof test_utils_seed;
  users: typeof users;
  wants: typeof wants;
  windfall: typeof windfall;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
