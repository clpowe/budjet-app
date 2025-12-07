import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { computed, ref } from "vue";
import type { Doc } from "../../convex/_generated/dataModel";

const expensesRef = ref<Doc<"expenses">[]>([
  { amount: 10 } as Doc<"expenses">,
  { amount: -4 } as Doc<"expenses">,
]);
const totalRef = ref(100);
const currentPositionRef = ref(5);
const elapsedDaysRef = ref(2);

const deleteExpenseMock = vi.fn();
const useConvexQueryMock = vi.fn();
const useConvexMutationMock = vi.fn();

vi.mock("#imports", () => ({
  computed,
  useDate: () => ({
    queryDayBounds: computed(() => ({ from: 0, to: 1 })),
    queryMonthBounds: computed(() => ({ from: 2, to: 3 })),
    elapsedDays: computed(() => elapsedDaysRef.value),
  }),
  useConvexQuery: (...args: unknown[]) => useConvexQueryMock(...args),
  useConvexMutation: (...args: unknown[]) => useConvexMutationMock(...args),
}));

let useExpenses: typeof import("../../app/composables/use-expenses").useExpenses;

describe("useExpenses", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("useDate", () => ({
      queryDayBounds: computed(() => ({ from: 0, to: 1 })),
      queryMonthBounds: computed(() => ({ from: 2, to: 3 })),
      elapsedDays: computed(() => elapsedDaysRef.value),
    }));
    vi.stubGlobal("useConvexQuery", (...args: unknown[]) =>
      useConvexQueryMock(...args),
    );
    vi.stubGlobal("useConvexMutation", (...args: unknown[]) =>
      useConvexMutationMock(...args),
    );
    useConvexQueryMock.mockReset();
    useConvexMutationMock.mockReset();
    deleteExpenseMock.mockReset();

    useConvexQueryMock.mockImplementation(() => {
      const responses = [expensesRef, totalRef, currentPositionRef];
      const idx = (useConvexQueryMock.mock.calls.length - 1) % responses.length;
      return { data: responses[idx] };
    });
    useConvexMutationMock.mockReturnValue({ mutate: deleteExpenseMock });

    ({ useExpenses } = await import("../../app/composables/use-expenses"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    expensesRef.value = [
      { amount: 10 } as Doc<"expenses">,
      { amount: -4 } as Doc<"expenses">,
    ];
    totalRef.value = 100;
    currentPositionRef.value = 5;
    elapsedDaysRef.value = 2;
  });

  it("computes totals and burn rate based on convex data", () => {
    const composable = useExpenses();

    expect(composable.expenses.value).toEqual(expensesRef.value);
    expect(composable.totalToday.value).toBe(6);
    expect(composable.burn_rate.value).toBe(50);
    expect(composable.variance.value).toBe(0);
    expect(composable.currentPosition.value).toBe(5);
  });

  it("returns 0 burn rate when missing totals or elapsed days", () => {
    totalRef.value = null as unknown as number;
    const composable = useExpenses();
    expect(composable.burn_rate.value).toBe(0);

    totalRef.value = 100;
    elapsedDaysRef.value = 0;
    const composable2 = useExpenses();
    expect(composable2.burn_rate.value).toBe(0);
  });

  it("calls convex mutation when removing an expense", () => {
    const composable = useExpenses();
    composable.remove("expense-id" as Doc<"expenses">["_id"]);

    expect(deleteExpenseMock).toHaveBeenCalledWith({ expenseId: "expense-id" });
  });
});
