import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";

export function useWindfall() {

  const { data: windfall } = useConvexQuery(api.windfall.listWindfall);
  const { mutate: deleteWindfall } = useConvexMutation(api.windfall.deleteWindfall);

  const { data: windfallTotal } = useConvexQuery(
    api.windfall.getMyWindfallTotal,
    {}
  )

  const remove = (id: Doc<"windfall">["_id"]) =>
    deleteWindfall({ windfallId: id });

  return { windfall, windfallTotal, remove };
}
