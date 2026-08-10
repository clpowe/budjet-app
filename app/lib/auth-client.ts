import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/vue";

export const createBudgetAuthClient = (baseURL: string) =>
  createAuthClient({
    baseURL,
    plugins: [convexClient(), crossDomainClient()],
  });

export type BudgetAuthClient = ReturnType<typeof createBudgetAuthClient>;
