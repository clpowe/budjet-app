import { api } from "../../convex/_generated/api";
// import type { Doc } from "../../convex/_generated/dataModel";

export function useDepts() {

  const { data: depts } = useConvexQuery(api.depts.listMyDepts, {});
  const { data: totalPayment } = useConvexQuery(api.depts.getTotalPayment, {})
  const { mutate: update } = useConvexMutation(api.depts.updateDept)

  return { depts, totalPayment, update };
} 
