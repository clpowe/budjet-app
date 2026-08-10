import type { BudgetAuthClient } from "~/lib/auth-client";

export const useAuthClient = (): BudgetAuthClient => {
  return useNuxtApp().$authClient;
};
