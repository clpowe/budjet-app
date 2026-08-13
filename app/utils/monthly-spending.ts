export type ExpenseAmount = {
  amount: number;
  date: number;
};

export type MonthlySpendingRow = {
  budget: number;
  day: number;
  id: string;
  label: string;
  spent: number | null;
};

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

function finiteAmount(value: number) {
  return Number.isFinite(value) ? value : 0;
}

export function buildMonthlySpendingRows(
  expenses: readonly ExpenseAmount[],
  currentDate: Date,
  dailyBudget: number,
): MonthlySpendingRow[] {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const currentDay = currentDate.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dailyTotals = new Map<number, number>();

  for (const expense of expenses) {
    const expenseDate = new Date(expense.date);

    if (expenseDate.getFullYear() !== year || expenseDate.getMonth() !== month) continue;

    const day = expenseDate.getDate();
    dailyTotals.set(day, (dailyTotals.get(day) ?? 0) + finiteAmount(expense.amount));
  }

  let cumulativeSpend = 0;
  const safeDailyBudget = Math.max(0, finiteAmount(dailyBudget));

  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = new Date(year, month, day);

    if (day <= currentDay) cumulativeSpend += dailyTotals.get(day) ?? 0;

    return {
      budget: safeDailyBudget * day,
      day,
      id: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      label: dayFormatter.format(date),
      spent: day <= currentDay ? cumulativeSpend : null,
    };
  });
}
