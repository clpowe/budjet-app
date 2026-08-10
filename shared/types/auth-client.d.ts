import type { BudgetAuthClient } from "../lib/auth-client";

declare module "#app" {
  interface NuxtApp {
    $authClient: BudgetAuthClient;
  }
}

declare module "vue" {
  interface ComponentCustomProperties {
    $authClient: BudgetAuthClient;
  }
}

export {};
