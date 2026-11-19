import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";

type BudgetMetric = {
  value: number;
  isWithinBudget: boolean;
};

function centsToDollars(value: bigint | undefined): number {
  return Number(value ?? 0n) / 100;
}

function createBudgetMetric(value: number, isWithinBudget: boolean): BudgetMetric {
  return {
    value,
    isWithinBudget,
  };
}

export function useExpenses() {
  const { currentDate, remainingDaysInMonth } = useDate();

  const dateParams = computed(() => ({ asOfTimestamp: currentDate.value.getTime() }));

  const { data: expenses } = useConvexQuery(api.expenses.listDailyExpenses, dateParams);
  const { mutate: deleteExpense } = useConvexMutation(api.expenses.deleteExpense);

  const { data: summary } = useConvexQuery(api.budget.getHomeSummary, dateParams);

  const dailyAllowanceDollars = computed(() =>
    centsToDollars(summary.value?.plan.dailyAllowanceCents),
  );
  const monthToDateTotalDollars = computed(() =>
    centsToDollars(summary.value?.spending.monthToDate.expenseCents),
  );
  const safeToSpendCents = computed(() => summary.value?.plan.safeToSpendCents ?? 0n);
  const remainingTodayDollars = computed(
    () =>
      centsToDollars(summary.value?.plan.dailyAllowanceCents) -
      centsToDollars(summary.value?.spending.today.budgetImpactCents),
  );

  const totalToday = computed(() => {
    const value = centsToDollars(summary.value?.spending.today.expenseCents);
    const isWithinBudget = value <= dailyAllowanceDollars.value;
    return createBudgetMetric(value, isWithinBudget);
  });

  const averageDailySpend = computed(() => {
    const value = centsToDollars(summary.value?.spending.monthToDate.averageDailyBudgetImpactCents);
    const isWithinBudget = value <= dailyAllowanceDollars.value;
    return createBudgetMetric(value, isWithinBudget);
  });

  const variance = computed(() => {
    const value = centsToDollars(summary.value?.spending.monthToDate.budgetImpactVarianceCents);
    const isWithinBudget = value >= 0;
    return createBudgetMetric(value, isWithinBudget);
  });

  const safeToSpendPerDay = computed(() => {
    if (remainingDaysInMonth.value <= 0) return createBudgetMetric(0, false);

    const value = centsToDollars(safeToSpendCents.value) / remainingDaysInMonth.value;
    const isWithinBudget = value >= dailyAllowanceDollars.value;

    return createBudgetMetric(value, isWithinBudget);
  });

  const removeExpense = (expenseId: Doc<"expenses">["_id"]) => deleteExpense({ expenseId });

  return {
    monthToDateTotalDollars,
    summary,
    safeToSpendCents,
    expenses,
    totalToday,
    averageDailySpend,
    variance,
    dailyAllowanceDollars,
    remainingTodayDollars,
    safeToSpendPerDay,
    removeExpense,
  };
}
