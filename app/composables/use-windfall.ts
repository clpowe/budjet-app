import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";

export function useWindfall() {
  const { data: windfall } = useConvexQuery(api.income.listIncome);
  const { mutate: deleteIncome } = useConvexMutation(api.income.deleteIncome);

  const { data: windfallTotal } = useConvexQuery(api.income.getMyIncomeTotal, {});

  const remove = (id: Doc<"income">["_id"]) => deleteIncome({ incomeId: id });

  return { windfall, windfallTotal, remove };
}
