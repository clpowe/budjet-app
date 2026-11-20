import type { FunctionArgs } from "convex/server";
import { computed, onBeforeUnmount, onMounted } from "vue";
import { api } from "../../convex/_generated/api";
import { useWantSection } from "./use-want-section";

type CreateItemArgs = FunctionArgs<typeof api.goals.create>;
type UpdateItemArgs = FunctionArgs<typeof api.goals.update>;
type ChangeStatusArgs = FunctionArgs<typeof api.goals.changeStatus>;
type ReorderArgs = FunctionArgs<typeof api.goals.reorder>;
type PurchaseArgs = FunctionArgs<typeof api.goals.purchase>;
type CorrectPurchaseArgs = FunctionArgs<typeof api.goals.correctPurchase>;
type UndoPurchaseArgs = FunctionArgs<typeof api.goals.undoPurchase>;

type ActionResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: string;
    };

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function runAction<T>(action: () => Promise<T>, fallback: string): Promise<ActionResult<T>> {
  try {
    return {
      success: true,
      data: await action(),
    };
  } catch (error) {
    return {
      success: false,
      error: errorMessage(error, fallback),
    };
  }
}

export function useWantList() {
  const now = useState<number>("wants-summary-now", () => Date.now());

  const { data: activeResult, isPending: isActivePending } = useConvexQuery(api.goals.list, {});

  const convex = useConvexClient();
  const history = {
    considering: useWantSection(convex, "idea"),
    notNow: useWantSection(convex, "on_hold"),
    bought: useWantSection(convex, "purchased"),
  };

  const { data: summary, isPending: isSummaryPending } = useConvexQuery(
    api.savings.getSummary,
    computed(() => ({
      now: now.value,
    })),
  );

  const { mutate: createMutation } = useConvexMutation(api.goals.create);
  const { mutate: updateMutation } = useConvexMutation(api.goals.update);
  const { mutate: changeStatusMutation } = useConvexMutation(api.goals.changeStatus);
  const { mutate: reorderMutation } = useConvexMutation(api.goals.reorder);
  const { mutate: purchaseMutation } = useConvexMutation(api.goals.purchase);
  const { mutate: correctPurchaseMutation } = useConvexMutation(api.goals.correctPurchase);
  const { mutate: undoPurchaseMutation } = useConvexMutation(api.goals.undoPurchase);

  const sections = computed(() => ({
    active: activeResult.value?.active ?? [],
    considering: history.considering.items.value,
    notNow: history.notNow.items.value,
    bought: history.bought.items.value,
  }));

  const isLoading = computed(() => isActivePending.value || isSummaryPending.value);

  let refreshTimer: number | undefined;

  function refreshNow() {
    now.value = Date.now();
  }

  function scheduleNextMinute() {
    if (!import.meta.client) return;

    if (refreshTimer !== undefined) {
      window.clearTimeout(refreshTimer);
    }

    const delay = 60_000 - (Date.now() % 60_000);

    refreshTimer = window.setTimeout(() => {
      refreshNow();
      scheduleNextMinute();
    }, delay);
  }

  if (import.meta.client) {
    onMounted(() => {
      refreshNow();
      scheduleNextMinute();
      window.addEventListener("focus", refreshNow);
    });

    onBeforeUnmount(() => {
      if (refreshTimer !== undefined) {
        window.clearTimeout(refreshTimer);
      }

      window.removeEventListener("focus", refreshNow);
    });
  }

  function createItem(args: CreateItemArgs) {
    return runAction(() => createMutation(args), "Could not create this Want. Try again.");
  }

  function updateItem(args: UpdateItemArgs) {
    return runAction(() => updateMutation(args), "Could not update this Want. Try again.");
  }

  function changeStatus(args: ChangeStatusArgs) {
    return runAction(
      () => changeStatusMutation(args),
      "Could not change this Want's status. Try again.",
    );
  }

  function reorder(args: ReorderArgs) {
    return runAction(() => reorderMutation(args), "Could not reorder the Wants list. Try again.");
  }

  function purchase(args: PurchaseArgs) {
    return runAction(() => purchaseMutation(args), "Could not complete this purchase. Try again.");
  }

  function correctPurchase(args: CorrectPurchaseArgs) {
    return runAction(
      () => correctPurchaseMutation(args),
      "Could not correct this purchase. Try again.",
    );
  }

  function undoPurchase(args: UndoPurchaseArgs) {
    return runAction(() => undoPurchaseMutation(args), "Could not undo this purchase. Try again.");
  }

  return {
    sections,
    history,
    summary,
    isLoading,
    createItem,
    updateItem,
    changeStatus,
    reorder,
    purchase,
    correctPurchase,
    undoPurchase,
  };
}
