import { api } from "../../convex/_generated/api";

export function useDebts() {
  const { data: debts } = useConvexQuery(api.depts.listMyDebts, {});
  const { data: totalPayment } = useConvexQuery(api.depts.getTotalPayment, {});
  const { mutate: update } = useConvexMutation(api.depts.updateDebt);
  const { mutate: remove } = useConvexMutation(api.depts.deleteDebt);
  const { mutate: reorder } = useConvexMutation(api.depts.reorderDebts);

  return { debts, totalPayment, update, remove, reorder };
}
