import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { computed, ref } from "vue";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

type WantItem = Doc<"wantItems">;

const activeItem = {
  _id: "want-active" as Id<"wantItems">,
  name: "Camera",
  status: "plan_for_it",
} as WantItem;
const consideringItem = {
  _id: "want-considering" as Id<"wantItems">,
  name: "Bike",
  status: "considering",
} as WantItem;
const notNowItem = {
  _id: "want-not-now" as Id<"wantItems">,
  name: "Kayak",
  status: "not_now",
} as WantItem;
const boughtItem = {
  _id: "want-bought" as Id<"wantItems">,
  name: "Headphones",
  status: "bought",
} as WantItem;

const wantsRef = ref({ active: [activeItem] });
const consideringRef = ref({
  page: [consideringItem],
  isDone: true,
  continueCursor: "",
});
const notNowRef = ref({
  page: [notNowItem],
  isDone: true,
  continueCursor: "",
});
const boughtRef = ref({
  page: [boughtItem],
  isDone: true,
  continueCursor: "",
});
const summaryRef = ref({
  positionCents: 5_000n,
  availableReserveCents: 4_000n,
  recoveryAmountCents: 0n,
  todayOverageAdjustmentCents: -1_000n,
  projectedEndOfDayContributionCents: 0n,
  activeAllocations: [],
});
const nowRef = ref(Date.UTC(2026, 7, 20, 16));
const queryPendingRefs = Array.from({ length: 5 }, () => ref(false));

const createMock = vi.fn();
const updateMock = vi.fn();
const changeStatusMock = vi.fn();
const reorderMock = vi.fn();
const purchaseMock = vi.fn();
const correctPurchaseMock = vi.fn();
const undoPurchaseMock = vi.fn();
const previewQueryMock = vi.fn();
const useConvexQueryMock = vi.fn();
const useConvexMutationMock = vi.fn();
const useConvexClientMock = vi.fn();

vi.mock("#imports", () => ({
  useConvexClient: () => useConvexClientMock(),
  useConvexMutation: (...args: unknown[]) => useConvexMutationMock(...args),
  useConvexQuery: (...args: unknown[]) => useConvexQueryMock(...args),
}));

let useWantList: typeof import("../../app/composables/use-want-list").useWantList;

describe("useWantList", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("useState", (_key: string, initialize: () => number) => {
      nowRef.value = initialize();
      return nowRef;
    });
    vi.stubGlobal("useConvexClient", () => useConvexClientMock());
    vi.stubGlobal("useConvexMutation", (...args: unknown[]) => useConvexMutationMock(...args));
    vi.stubGlobal("useConvexQuery", (...args: unknown[]) => useConvexQueryMock(...args));

    useConvexQueryMock.mockReset();
    useConvexMutationMock.mockReset();
    useConvexClientMock.mockReset();
    previewQueryMock.mockReset();
    createMock.mockReset();
    updateMock.mockReset();
    changeStatusMock.mockReset();
    reorderMock.mockReset();
    purchaseMock.mockReset();
    correctPurchaseMock.mockReset();
    undoPurchaseMock.mockReset();

    const queryResponses = [wantsRef, consideringRef, notNowRef, boughtRef, summaryRef];
    useConvexQueryMock.mockImplementation(() => {
      const index = useConvexQueryMock.mock.calls.length - 1;
      return {
        data: queryResponses[index],
        isPending: queryPendingRefs[index],
      };
    });

    const mutationMocks = [
      createMock,
      updateMock,
      changeStatusMock,
      reorderMock,
      purchaseMock,
      correctPurchaseMock,
      undoPurchaseMock,
    ];
    useConvexMutationMock.mockImplementation(() => {
      const index = useConvexMutationMock.mock.calls.length - 1;
      return { mutate: mutationMocks[index] };
    });
    useConvexClientMock.mockReturnValue({ query: previewQueryMock });

    createMock.mockResolvedValue({ _id: "created" });
    updateMock.mockResolvedValue({ _id: "updated" });
    changeStatusMock.mockResolvedValue({ kind: "updated" });
    reorderMock.mockResolvedValue({ success: true });
    purchaseMock.mockResolvedValue({ status: "purchased" });
    correctPurchaseMock.mockResolvedValue({ success: true });
    undoPurchaseMock.mockResolvedValue({ success: true });
    previewQueryMock.mockResolvedValue({
      reserveUsedCents: 8_000n,
      budgetImpactCents: 2_000n,
      lowerItemImpacts: [],
    });

    ({ useWantList } = await import("../../app/composables/use-want-list"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    queryPendingRefs.forEach((pending) => {
      pending.value = false;
    });
  });

  it("exposes one stable contract over the active queue, inactive pages, and reserve summary", () => {
    const wants = useWantList();

    expect(Object.keys(wants).sort()).toEqual(
      [
        "changeStatus",
        "correctPurchase",
        "createItem",
        "isLoading",
        "previewPurchase",
        "purchase",
        "reorder",
        "sections",
        "summary",
        "undoPurchase",
        "updateItem",
      ].sort(),
    );
    expect(wants.sections.value).toEqual({
      active: [activeItem],
      considering: [consideringItem],
      notNow: [notNowItem],
      bought: [boughtItem],
    });
    expect(wants.summary).toBe(summaryRef);
    expect(wants.isLoading.value).toBe(false);

    queryPendingRefs[2]!.value = true;
    expect(wants.isLoading.value).toBe(true);

    expect(useConvexQueryMock).toHaveBeenNthCalledWith(1, api.wants.list, {});
    expect(useConvexQueryMock).toHaveBeenNthCalledWith(2, api.wants.listSection, {
      status: "considering",
      paginationOpts: { numItems: 25, cursor: null },
    });
    expect(useConvexQueryMock).toHaveBeenNthCalledWith(3, api.wants.listSection, {
      status: "not_now",
      paginationOpts: { numItems: 25, cursor: null },
    });
    expect(useConvexQueryMock).toHaveBeenNthCalledWith(4, api.wants.listSection, {
      status: "bought",
      paginationOpts: { numItems: 25, cursor: null },
    });
    expect(useConvexQueryMock).toHaveBeenNthCalledWith(
      5,
      api.reserve.getSummary,
      expect.objectContaining({ value: { now: nowRef.value } }),
    );
  });

  it("runs focused network calls and never sends a client clock to a mutation", async () => {
    const wants = useWantList();
    const itemId = activeItem._id;
    const createArgs = {
      name: "Camera",
      estimatedCostCents: 10_000n,
      priority: "high" as const,
      notes: "",
    };
    const updateArgs = {
      itemId,
      name: "Camera",
      estimatedCostCents: 12_000n,
      priority: "medium" as const,
      targetDate: null,
      notes: "Updated",
    };

    const results = await Promise.all([
      wants.createItem(createArgs),
      wants.updateItem(updateArgs),
      wants.changeStatus({ itemId, status: "not_now" }),
      wants.reorder({ itemIds: [itemId] }),
      wants.previewPurchase({ itemId, actualAmountCents: 10_000n }),
      wants.purchase({
        itemId,
        actualAmountCents: 10_000n,
        purchaseLocalDate: "2026-08-20",
      }),
      wants.correctPurchase({ itemId, actualAmountCents: 9_000n }),
      wants.undoPurchase({ itemId }),
    ]);

    results.forEach((result) => {
      expect(result.success).toBe(true);
    });
    expect(createMock).toHaveBeenCalledWith(createArgs);
    expect(updateMock).toHaveBeenCalledWith(updateArgs);
    expect(changeStatusMock).toHaveBeenCalledWith({ itemId, status: "not_now" });
    expect(reorderMock).toHaveBeenCalledWith({ itemIds: [itemId] });
    expect(previewQueryMock).toHaveBeenCalledWith(api.wants.previewPurchase, {
      itemId,
      actualAmountCents: 10_000n,
      now: nowRef.value,
    });
    expect(purchaseMock).toHaveBeenCalledWith({
      itemId,
      actualAmountCents: 10_000n,
      purchaseLocalDate: "2026-08-20",
    });
    expect(correctPurchaseMock).toHaveBeenCalledWith({
      itemId,
      actualAmountCents: 9_000n,
    });
    expect(undoPurchaseMock).toHaveBeenCalledWith({ itemId });

    for (const mutationMock of [
      createMock,
      updateMock,
      changeStatusMock,
      reorderMock,
      purchaseMock,
      correctPurchaseMock,
      undoPurchaseMock,
    ]) {
      expect(mutationMock.mock.calls[0]?.[0]).not.toHaveProperty("now");
    }
  });

  it("returns server messages and user-safe fallbacks instead of throwing from mutations", async () => {
    createMock.mockRejectedValueOnce("offline");
    updateMock.mockRejectedValueOnce(new Error("Want item not found"));
    const wants = useWantList();

    await expect(
      wants.createItem({
        name: "Camera",
        estimatedCostCents: 10_000n,
        priority: "high",
        notes: "",
      }),
    ).resolves.toEqual({
      success: false,
      error: "Could not create this Want. Try again.",
    });
    await expect(
      wants.updateItem({
        itemId: activeItem._id,
        name: "Camera",
        estimatedCostCents: 10_000n,
        priority: "high",
        targetDate: null,
        notes: "",
      }),
    ).resolves.toEqual({
      success: false,
      error: "Want item not found",
    });
  });
});
