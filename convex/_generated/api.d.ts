/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as depts from "../depts.js";
import type * as expenses from "../expenses.js";
import type * as households from "../households.js";
import type * as lib_helpers from "../lib/helpers.js";
import type * as users from "../users.js";
import type * as windfall from "../windfall.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  depts: typeof depts;
  expenses: typeof expenses;
  households: typeof households;
  "lib/helpers": typeof lib_helpers;
  users: typeof users;
  windfall: typeof windfall;
}>;
declare const fullApiWithMounts: typeof fullApi;

export declare const api: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "internal">
>;

export declare const components: {};
