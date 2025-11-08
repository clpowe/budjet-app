import { ConvexReactClient } from "convex/react";
import type { FunctionReference, OptionalRestArgs } from "convex/server";
import type { Value } from "convex/values";

// Copied directly from clientType.ts
export type AuthClient = {
  authenticatedCall<Action extends FunctionReference<"action", "public">>(
    action: Action,
    ...args: OptionalRestArgs<Action>
  ): Promise<Action["_returnType"]>;
  unauthenticatedCall<Action extends FunctionReference<"action", "public">>(
    action: Action,
    ...args: OptionalRestArgs<Action>
  ): Promise<Action["_returnType"]>;
  verbose: boolean | undefined;
  logger?: ConvexReactClient["logger"];
};

// Copied directly from index.tsx
export interface TokenStorage {
  getItem: (
    key: string,
  ) => string | undefined | null | Promise<string | undefined | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
}

// Copied directly from index.tsx (and updated for Vue)
export type ConvexAuthActionsContext = {
  signIn(
    this: void,
    provider: string,
    params?:
      | FormData
      | (Record<string, Value> & {
        redirectTo?: string;
        code?: string;
      }),
  ): Promise<{
    signingIn: boolean;
    redirect?: URL;
  }>;
  signOut(this: void): Promise<void>;
};

// This is new: for our internal useAuth() composable
export type ConvexAuthInternalContext = {
  isLoading: import('vue').Ref<boolean>;
  isAuthenticated: import('vue').Ref<boolean>;
  fetchAccessToken: ({
    forceRefreshToken,
  }: {
    forceRefreshToken: boolean;
  }) => Promise<string | null>;
};
