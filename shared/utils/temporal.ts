/**
 * The one place the app gets Temporal from. Swap this for the native
 * `globalThis.Temporal` once Safari and the Convex runtime ship it.
 */
export { Temporal } from "temporal-polyfill";
