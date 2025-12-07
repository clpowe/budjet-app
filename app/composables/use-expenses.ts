import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";

export function useExpenses() {
  const { queryDayBounds, queryMonthBounds, elapsedDays } = useDate();

  const dailyBudget = ref(50);

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
      allowance: dailyBudget.value,
    })),
  );

  const totalToday = computed(() => {
    const value =
      expenses.value?.reduce((acc, curr) => acc + curr.amount, 0) ?? 0;
    const positive = value <= dailyBudget.value;
    return {
      value,
      positive,
    };
  });

  const burn_rate = computed(() => {
    if (!elapsedDays.value || !total.value) {
      return 0;
    }
    const value = total.value / elapsedDays.value;
    const positive = value <= dailyBudget.value;
    return {
      value,
      positive,
    };
  });

  const variance = computed(() => {
    const value = dailyBudget.value * elapsedDays.value - (total.value ?? 0);
    const positive = value >= 0;
    return {
      value,
      positive,
    };
  });

  const remove = (id: Doc<"expenses">["_id"]) =>
    deleteExpense({ expenseId: id });

  return {
    total,
    expenses,
    totalToday,
    burn_rate,
    variance,
    dailyBudget,
    currentPosition,
    remove,
  };
}
