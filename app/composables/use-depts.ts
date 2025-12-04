import { api } from "../../convex/_generated/api";

export function useDepts() {
  const { data: depts } = useConvexQuery(api.depts.listMyDepts, {});
  const { data: totalPayment } = useConvexQuery(api.depts.getTotalPayment, {});
  const { mutate: update } = useConvexMutation(api.depts.updateDebt);
  const { mutate: remove } = useConvexMutation(api.depts.deleteDepts);

  return { depts, totalPayment, update, remove };
}
