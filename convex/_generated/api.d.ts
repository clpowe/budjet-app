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
import type * as crons from "../crons.js";
import type * as depts from "../depts.js";
import type * as expenses from "../expenses.js";
import type * as households from "../households.js";
import type * as http from "../http.js";
import type * as lib_auth_origin from "../lib/auth_origin.js";
import type * as lib_daily_budget_rollups from "../lib/daily_budget_rollups.js";
import type * as lib_helpers from "../lib/helpers.js";
import type * as lib_want_reserve from "../lib/want_reserve.js";
import type * as migrations_backfillMoney from "../migrations/backfillMoney.js";
import type * as reserve from "../reserve.js";
import type * as reserveMaintenance from "../reserveMaintenance.js";
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
  crons: typeof crons;
  depts: typeof depts;
  expenses: typeof expenses;
  households: typeof households;
  http: typeof http;
  "lib/auth_origin": typeof lib_auth_origin;
  "lib/daily_budget_rollups": typeof lib_daily_budget_rollups;
  "lib/helpers": typeof lib_helpers;
  "lib/want_reserve": typeof lib_want_reserve;
  "migrations/backfillMoney": typeof migrations_backfillMoney;
  reserve: typeof reserve;
  reserveMaintenance: typeof reserveMaintenance;
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
