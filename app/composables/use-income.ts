import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";

export function useIncome() {
  const { data: entries } = useConvexQuery(api.income.listIncome);
  const { mutate: deleteIncome } = useConvexMutation(api.income.deleteIncome);

  const { data: incomeTotal } = useConvexQuery(api.income.getMyIncomeTotal, {});

  const remove = (id: Doc<"income">["_id"]) => deleteIncome({ incomeId: id });

  return { entries, incomeTotal, remove };
}
