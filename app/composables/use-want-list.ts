import type { FunctionArgs } from "convex/server";
import { computed, onBeforeUnmount, onMounted } from "vue";
import { api } from "../../convex/_generated/api";

const INACTIVE_PAGE_SIZE = 25;

type CreateItemArgs = FunctionArgs<typeof api.wants.create>;
type UpdateItemArgs = FunctionArgs<typeof api.wants.update>;
type ChangeStatusArgs = FunctionArgs<typeof api.wants.changeStatus>;
type ReorderArgs = FunctionArgs<typeof api.wants.reorder>;
type PreviewPurchaseArgs = Omit<FunctionArgs<typeof api.wants.previewPurchase>, "now">;
type PurchaseArgs = FunctionArgs<typeof api.wants.purchase>;
type CorrectPurchaseArgs = FunctionArgs<typeof api.wants.correctPurchase>;
type UndoPurchaseArgs = FunctionArgs<typeof api.wants.undoPurchase>;

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

  const { data: activeResult, isPending: isActivePending } = useConvexQuery(api.wants.list, {});

  const { data: consideringResult, isPending: isConsideringPending } = useConvexQuery(
    api.wants.listSection,
    {
      status: "considering",
      paginationOpts: {
        numItems: INACTIVE_PAGE_SIZE,
        cursor: null,
      },
    },
  );

  const { data: notNowResult, isPending: isNotNowPending } = useConvexQuery(api.wants.listSection, {
    status: "not_now",
    paginationOpts: {
      numItems: INACTIVE_PAGE_SIZE,
      cursor: null,
    },
  });

  const { data: boughtResult, isPending: isBoughtPending } = useConvexQuery(api.wants.listSection, {
    status: "bought",
    paginationOpts: {
      numItems: INACTIVE_PAGE_SIZE,
      cursor: null,
    },
  });

  const { data: summary, isPending: isSummaryPending } = useConvexQuery(
    api.reserve.getSummary,
    computed(() => ({
      now: now.value,
    })),
  );

  const { mutate: createMutation } = useConvexMutation(api.wants.create);
  const { mutate: updateMutation } = useConvexMutation(api.wants.update);
  const { mutate: changeStatusMutation } = useConvexMutation(api.wants.changeStatus);
  const { mutate: reorderMutation } = useConvexMutation(api.wants.reorder);
  const { mutate: purchaseMutation } = useConvexMutation(api.wants.purchase);
  const { mutate: correctPurchaseMutation } = useConvexMutation(api.wants.correctPurchase);
  const { mutate: undoPurchaseMutation } = useConvexMutation(api.wants.undoPurchase);

  const convex = useConvexClient();

  const sections = computed(() => ({
    active: activeResult.value?.active ?? [],
    considering: consideringResult.value?.page ?? [],
    notNow: notNowResult.value?.page ?? [],
    bought: boughtResult.value?.page ?? [],
  }));

  const isLoading = computed(
    () =>
      isActivePending.value ||
      isConsideringPending.value ||
      isNotNowPending.value ||
      isBoughtPending.value ||
      isSummaryPending.value,
  );

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

  function previewPurchase(args: PreviewPurchaseArgs) {
    return runAction(
      () =>
        convex.query(api.wants.previewPurchase, {
          ...args,
          now: now.value,
        }),
      "Could not preview this purchase. Try again.",
    );
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
    summary,
    isLoading,
    createItem,
    updateItem,
    changeStatus,
    reorder,
    previewPurchase,
    purchase,
    correctPurchase,
    undoPurchase,
  };
}
