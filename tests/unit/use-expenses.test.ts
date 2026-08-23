import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { computed, ref } from "vue";
import type { Doc } from "../../convex/_generated/dataModel";

const expensesRef = ref<Doc<"expenses">[]>([
  { amount: 10 } as Doc<"expenses">,
  { amount: -4 } as Doc<"expenses">,
]);
const currentDateRef = ref(new Date(1_000));
const summaryRef = ref({
  period: {
    localMonth: "1970-01",
    elapsedDays: 2,
  },
  plan: {
    dailyAllowanceCents: 5_000n,
    allowanceCents: 150_000n,
    safeToSpendCents: 139_000n,
    closedPositiveReserveContributionCents: 2_000n,
  },
  spending: {
    month: {
      expenseCents: 10_000n,
      reserveFundedCents: 1_000n,
      budgetImpactCents: 9_000n,
      averageDailyBudgetImpactCents: 5_000n,
      budgetImpactVarianceCents: 1_000n,
    },
    today: {
      expenseCents: 600n,
      budgetImpactCents: 500n,
    },
  },
  reserve: {
    positionCents: 4_000n,
    availableCents: 4_000n,
    recoveryCents: 0n,
    todayOverageAdjustmentCents: 0n,
    projectedEndOfDayContributionCents: 4_500n,
  },
  nextPlannedWant: null,
});

const deleteExpenseMock = vi.fn();
const useConvexQueryMock = vi.fn();
const useConvexMutationMock = vi.fn();

vi.mock("#imports", () => ({
  computed,
  ref,
  useDate: () => ({
    queryDayBounds: computed(() => ({ from: 0, to: 1 })),
    currentDate: currentDateRef,
    remainingDaysInMonth: computed(() => 29),
  }),
  useConvexQuery: (...args: unknown[]) => useConvexQueryMock(...args),
  useConvexMutation: (...args: unknown[]) => useConvexMutationMock(...args),
}));

let useExpenses: typeof import("../../app/composables/use-expenses").useExpenses;

describe("useExpenses", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("ref", ref);
    vi.stubGlobal("useDate", () => ({
      queryDayBounds: computed(() => ({ from: 0, to: 1 })),
      currentDate: currentDateRef,
      remainingDaysInMonth: computed(() => 29),
    }));
    vi.stubGlobal("useConvexQuery", (...args: unknown[]) => useConvexQueryMock(...args));
    vi.stubGlobal("useConvexMutation", (...args: unknown[]) => useConvexMutationMock(...args));
    useConvexQueryMock.mockReset();
    useConvexMutationMock.mockReset();
    deleteExpenseMock.mockReset();

    useConvexQueryMock.mockImplementation(() => {
      const responses = [expensesRef, summaryRef];
      const idx = (useConvexQueryMock.mock.calls.length - 1) % responses.length;
      return { data: responses[idx] };
    });
    useConvexMutationMock.mockReturnValue({ mutate: deleteExpenseMock });

    ({ useExpenses } = await import("../../app/composables/use-expenses"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    expensesRef.value = [{ amount: 10 } as Doc<"expenses">, { amount: -4 } as Doc<"expenses">];
    currentDateRef.value = new Date(1_000);
    summaryRef.value = {
      period: {
        localMonth: "1970-01",
        elapsedDays: 2,
      },
      plan: {
        dailyAllowanceCents: 5_000n,
        allowanceCents: 150_000n,
        safeToSpendCents: 139_000n,
        closedPositiveReserveContributionCents: 2_000n,
      },
      spending: {
        month: {
          expenseCents: 10_000n,
          reserveFundedCents: 1_000n,
          budgetImpactCents: 9_000n,
          averageDailyBudgetImpactCents: 5_000n,
          budgetImpactVarianceCents: 1_000n,
        },
        today: {
          expenseCents: 600n,
          budgetImpactCents: 500n,
        },
      },
      reserve: {
        positionCents: 4_000n,
        availableCents: 4_000n,
        recoveryCents: 0n,
        todayOverageAdjustmentCents: 0n,
        projectedEndOfDayContributionCents: 4_500n,
      },
      nextPlannedWant: null,
    };
  });

  it("computes totals and burn rate based on convex data", () => {
    const composable = useExpenses();

    expect(composable.expenses.value).toEqual(expensesRef.value);
    expect(composable.total.value).toBe(100);
    expect(composable.totalToday.value).toEqual({ value: 6, positive: true });
    expect(composable.burn_rate.value).toEqual({ value: 50, positive: true });
    expect(composable.variance.value).toEqual({ value: 10, positive: true });
    expect(composable.dailyBudget.value).toBe(50);
    expect(composable.currentPosition.value).toBe(45);
    expect(composable.safeToSpendCents.value).toBe(139_000n);
    expect(composable.summary.value).toBe(summaryRef.value);
    expect(useConvexQueryMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ value: { asOfTimestamp: 1_000 } }),
    );
  });

  it("returns zeroed states while the centralized summary is loading", () => {
    summaryRef.value = undefined as never;
    const composable = useExpenses();

    expect(composable.total.value).toBe(0);
    expect(composable.totalToday.value).toEqual({ value: 0, positive: true });
    expect(composable.burn_rate.value).toEqual({ value: 0, positive: true });
    expect(composable.variance.value).toEqual({ value: 0, positive: true });
    expect(composable.safeToSpendCents.value).toBe(0n);
  });

  it("calls convex mutation when removing an expense", () => {
    const composable = useExpenses();
    composable.remove("expense-id" as Doc<"expenses">["_id"]);

    expect(deleteExpenseMock).toHaveBeenCalledWith({ expenseId: "expense-id" });
  });
});
