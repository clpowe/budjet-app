import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { getFunctionName, type FunctionReference } from "convex/server";
import { ref } from "vue";
import { useWantList } from "../../app/composables/use-want-list";
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
  availableSavingsCents: 4_000n,
  recoveryAmountCents: 0n,
  todayOverageAdjustmentCents: -1_000n,
  projectedEndOfDayContributionCents: 0n,
  activeAllocations: [],
});
const nowRef = ref(Date.UTC(2026, 7, 20, 16));
const summaryPending = ref(false);
const mutations = new Map([
  [getFunctionName(api.wants.create), vi.fn()],
  [getFunctionName(api.wants.update), vi.fn()],
  [getFunctionName(api.wants.changeStatus), vi.fn()],
  [getFunctionName(api.wants.reorder), vi.fn()],
  [getFunctionName(api.wants.purchase), vi.fn()],
  [getFunctionName(api.wants.correctPurchase), vi.fn()],
  [getFunctionName(api.wants.undoPurchase), vi.fn()],
]);

function mutationFor(endpoint: FunctionReference<"mutation">) {
  const name = getFunctionName(endpoint);
  const mutate = mutations.get(name);
  if (!mutate) throw new Error(`Unexpected mutation: ${name}`);
  return mutate;
}

const previewQueryMock = vi.fn();
const subscribeMock = vi.fn();

describe("useWantList", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    summaryPending.value = false;
    vi.stubGlobal("useState", () => nowRef);
    vi.stubGlobal("useConvexClient", () => ({ query: previewQueryMock, onUpdate: subscribeMock }));
    vi.stubGlobal("useConvexMutation", (endpoint: FunctionReference<"mutation">) => ({
      mutate: mutationFor(endpoint),
    }));
    vi.stubGlobal("useConvexQuery", (endpoint: FunctionReference<"query">, args: unknown) => {
      const name = getFunctionName(endpoint);
      switch (name) {
        case getFunctionName(api.wants.list):
          expect(args).toEqual({});
          return { data: wantsRef, isPending: ref(false) };
        case getFunctionName(api.savings.getSummary):
          expect(args).toMatchObject({ value: { now: nowRef.value } });
          return { data: summaryRef, isPending: summaryPending };
        default:
          throw new Error(`Unexpected query: ${name}`);
      }
    });
    subscribeMock.mockImplementation((_query, args, callback) => {
      const sections = {
        considering: consideringRef.value,
        not_now: notNowRef.value,
        bought: boughtRef.value,
      };
      callback(sections[args.status as keyof typeof sections]);
      return vi.fn();
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("combines the active queue, inactive sections and reactive savings summary", () => {
    const wants = useWantList();

    expect(wants.sections.value).toEqual({
      active: [activeItem],
      considering: [consideringItem],
      notNow: [notNowItem],
      bought: [boughtItem],
    });
    expect(wants.summary.value).toEqual(summaryRef.value);
    expect(wants.isLoading.value).toBe(false);

    summaryPending.value = true;
    expect(wants.isLoading.value).toBe(true);

    for (const status of ["considering", "not_now", "bought"]) {
      expect(subscribeMock).toHaveBeenCalledWith(
        api.wants.listSection,
        { status, paginationOpts: { numItems: 25, cursor: null } },
        expect.any(Function),
        expect.any(Function),
      );
    }
  });

  it("pins the loaded Bought page and loads its continuation independently", () => {
    const firstPage = { page: [boughtItem], isDone: false, continueCursor: "next-bought" };
    subscribeMock.mockImplementation((_query, args, callback) => {
      if (args.status === "considering") callback(consideringRef.value);
      if (args.status === "not_now") callback(notNowRef.value);
      if (args.status === "bought" && args.paginationOpts.cursor === null) callback(firstPage);
      return vi.fn();
    });
    const wants = useWantList();
    const older = { ...boughtItem, _id: "older-purchase" as Id<"wantItems"> };

    wants.history.bought.loadMore();
    wants.history.bought.loadMore();
    expect(subscribeMock).toHaveBeenCalledTimes(5);
    expect(subscribeMock).toHaveBeenNthCalledWith(
      4,
      api.wants.listSection,
      {
        status: "bought",
        paginationOpts: { numItems: 25, cursor: null, endCursor: "next-bought" },
      },
      expect.any(Function),
      expect.any(Function),
    );
    expect(subscribeMock).toHaveBeenNthCalledWith(
      5,
      api.wants.listSection,
      { status: "bought", paginationOpts: { numItems: 25, cursor: "next-bought" } },
      expect.any(Function),
      expect.any(Function),
    );
    expect(wants.history.bought.isLoadingMore.value).toBe(true);
    expect(wants.sections.value.bought).toEqual([boughtItem]);
    subscribeMock.mock.calls[4]![2]({ page: [older], isDone: true, continueCursor: "" });
    expect(wants.sections.value.bought).toEqual([boughtItem, older]);
    expect(wants.sections.value.considering).toEqual([consideringItem]);
    expect(wants.history.bought.canLoadMore.value).toBe(false);
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
      wants.reorder({ itemIds: [itemId], expectedItemIds: [itemId] }),
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
    expect(mutationFor(api.wants.create)).toHaveBeenCalledWith(createArgs);
    expect(mutationFor(api.wants.update)).toHaveBeenCalledWith(updateArgs);
    expect(mutationFor(api.wants.changeStatus)).toHaveBeenCalledWith({ itemId, status: "not_now" });
    expect(mutationFor(api.wants.reorder)).toHaveBeenCalledWith({
      itemIds: [itemId],
      expectedItemIds: [itemId],
    });
    expect(previewQueryMock).toHaveBeenCalledWith(api.wants.previewPurchase, {
      itemId,
      actualAmountCents: 10_000n,
      now: nowRef.value,
    });
    expect(mutationFor(api.wants.purchase)).toHaveBeenCalledWith({
      itemId,
      actualAmountCents: 10_000n,
      purchaseLocalDate: "2026-08-20",
    });
    expect(mutationFor(api.wants.correctPurchase)).toHaveBeenCalledWith({
      itemId,
      actualAmountCents: 9_000n,
    });
    expect(mutationFor(api.wants.undoPurchase)).toHaveBeenCalledWith({ itemId });
  });

  it("returns server messages and user-safe fallbacks instead of throwing from mutations", async () => {
    mutationFor(api.wants.create).mockRejectedValueOnce("offline");
    mutationFor(api.wants.update).mockRejectedValueOnce(new Error("Want item not found"));
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
