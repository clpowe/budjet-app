import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";

export function useExpenses() {
  const { queryDayBounds, queryMonthBounds, elapsedDays } = useDate();

  const params = computed(() => ({
    from: queryDayBounds.value.from,
    to: queryDayBounds.value.to,
  }));

  const { data: expenses } = useConvexQuery(
    api.expenses.listMyExpenses,
    params,
  );
  const { mutate: deleteExpense } = useConvexMutation(
    api.expenses.deleteExpense,
  );

  const { data: total } = useConvexQuery(
    api.expenses.getMyTotal,
    computed(() => ({
      from: queryMonthBounds.value.from,
      to: queryMonthBounds.value.to,
    })),
  );

  const { data: currentPosition } = useConvexQuery(
    api.expenses.getMyCurrentPosition,
    computed(() => ({
      from: queryDayBounds.value.from,
      to: queryDayBounds.value.to,
      allowance: 50,
    })),
  );

  const totalToday = computed(() => {
    return expenses.value?.reduce((acc, curr) => acc + curr.amount, 0) ?? 0;
  });

  const burn_rate = computed(() => {
    if (!elapsedDays.value || !total.value) {
      return 0;
    }
    return total.value / elapsedDays.value;
  });

  const variance = computed(() => {
    return 50 * elapsedDays.value - (total.value ?? 0);
  });

  const remove = (id: Doc<"expenses">["_id"]) =>
    deleteExpense({ expenseId: id });

  return {
    total,
    expenses,
    totalToday,
    burn_rate,
    variance,
    currentPosition,
    remove,
  };
}
