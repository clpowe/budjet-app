import { api } from "../../convex/_generated/api";

export function useDebts() {
  const { data: debts } = useConvexQuery(api.debts.listMyDebts, {});
  const { data: totalPayment } = useConvexQuery(api.debts.getTotalPayment, {});
  const { mutate: update } = useConvexMutation(api.debts.updateDebt);
  const { mutate: remove } = useConvexMutation(api.debts.deleteDebt);
  const { mutate: reorder } = useConvexMutation(api.debts.reorderDebts);

  return { debts, totalPayment, update, remove, reorder };
}
