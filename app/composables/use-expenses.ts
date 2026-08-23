import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";

type MoneyState = {
  value: number;
  positive: boolean;
};

function centsToDollars(value: bigint | undefined): number {
  return Number(value ?? 0n) / 100;
}

function moneyState(value: number, positive: boolean): MoneyState {
  return {
    value,
    positive,
  };
}

export function useExpenses() {
  const { currentDate, queryDayBounds, remainingDaysInMonth } = useDate();

  const dayParams = computed(() => ({
    from: queryDayBounds.value.from,
    to: queryDayBounds.value.to,
  }));

  const { data: expenses } = useConvexQuery(api.expenses.listMyExpenses, dayParams);
  const { mutate: deleteExpense } = useConvexMutation(api.expenses.deleteExpense);

  const { data: summary } = useConvexQuery(
    api.budget.getHomeSummary,
    computed(() => ({
      asOfTimestamp: currentDate.value.getTime(),
    })),
  );

  const dailyBudget = computed(() => centsToDollars(summary.value?.plan.dailyAllowanceCents));
  const total = computed(() => centsToDollars(summary.value?.spending.month.expenseCents));
  const safeToSpendCents = computed(() => summary.value?.plan.safeToSpendCents ?? 0n);
  const currentPosition = computed(
    () =>
      centsToDollars(summary.value?.plan.dailyAllowanceCents) -
      centsToDollars(summary.value?.spending.today.budgetImpactCents),
  );

  const totalToday = computed(() => {
    const value = centsToDollars(summary.value?.spending.today.expenseCents);
    const positive = value <= dailyBudget.value;
    return moneyState(value, positive);
  });

  const burn_rate = computed(() => {
    const value = centsToDollars(summary.value?.spending.month.averageDailyBudgetImpactCents);
    const positive = value <= dailyBudget.value;
    return moneyState(value, positive);
  });

  const variance = computed(() => {
    const value = centsToDollars(summary.value?.spending.month.budgetImpactVarianceCents);
    const positive = value >= 0;
    return moneyState(value, positive);
  });

  const rollingBudget = computed(() => {
    if (remainingDaysInMonth.value <= 0) return moneyState(0, false);

    const value = centsToDollars(safeToSpendCents.value) / remainingDaysInMonth.value;
    const positive = value >= dailyBudget.value;

    return moneyState(value, positive);
  });

  const remove = (id: Doc<"expenses">["_id"]) => deleteExpense({ expenseId: id });

  return {
    total,
    summary,
    safeToSpendCents,
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
