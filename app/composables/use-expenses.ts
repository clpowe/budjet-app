import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";

export function useExpenses() {
  const { queryDayBounds } = useDate();

  const params = computed(() => ({
    from: queryDayBounds.value.from,
    to: queryDayBounds.value.to,
  }));

  const { data: expenses } = useConvexQuery(api.expenses.listMyExpenses, params);
  const { mutate: deleteExpense } = useConvexMutation(api.expenses.deleteExpense);

  const totalToday = computed(() => {
    return expenses.value?.reduce((acc, curr) => acc + curr.amount, 0) ?? 0;
  })
  const remove = (id: Doc<"expenses">["_id"]) =>
    deleteExpense({ expenseId: id });

  return { expenses, totalToday, remove };
}
