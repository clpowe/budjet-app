import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";

type MoneyState = {
  value: number;
  positive: boolean;
};

function finiteNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function moneyState(value: unknown, positive: boolean): MoneyState {
  return {
    value: finiteNumber(value),
    positive,
  };
}

export function useExpenses() {
  const { queryDayBounds, queryMonthBounds, elapsedDays, totalDaysInMonth, remainingDaysInMonth } =
    useDate();

  const { data: household } = useConvexQuery(api.households.getMyHousehold, {});
  const dailyBudget = computed(() => finiteNumber(household.value?.allowance, 50));

  const params = computed(() => ({
    from: queryDayBounds.value.from,
    to: queryDayBounds.value.to,
  }));

  const { data: expenses } = useConvexQuery(api.expenses.listMyExpenses, params);
  const { mutate: deleteExpense } = useConvexMutation(api.expenses.deleteExpense);

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
    const value = expenses.value?.reduce((acc, curr) => acc + finiteNumber(curr.amount), 0) ?? 0;
    const positive = value <= dailyBudget.value;
    return moneyState(value, positive);
  });

  const burn_rate = computed(() => {
    const days = finiteNumber(elapsedDays.value);
    const spent = finiteNumber(total.value);

    if (days <= 0 || spent <= 0) {
      return moneyState(0, true);
    }

    const value = spent / days;
    const positive = value <= dailyBudget.value;
    return moneyState(value, positive);
  });

  const variance = computed(() => {
    const value = dailyBudget.value * finiteNumber(elapsedDays.value) - finiteNumber(total.value);
    const positive = value >= 0;
    return moneyState(value, positive);
  });

  const rollingBudget = computed(() => {
    // remaining budget divided by remaining days
    const totalMonthAllowance = dailyBudget.value * totalDaysInMonth.value;
    const spentSoFar = finiteNumber(total.value);
    const remainingBudget = totalMonthAllowance - spentSoFar;

    if (remainingDaysInMonth.value <= 0) return moneyState(0, false);

    const value = remainingBudget / remainingDaysInMonth.value;
    const positive = value >= dailyBudget.value;

    return moneyState(value, positive);
  });

  const remove = (id: Doc<"expenses">["_id"]) => deleteExpense({ expenseId: id });

  return {
    total,
    expenses,
    totalToday,
    burn_rate,
    variance,
    dailyBudget,
    currentPosition,
    rollingBudget,
    remove,
  };
}
