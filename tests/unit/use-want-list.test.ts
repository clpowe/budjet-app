import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { getFunctionName, type FunctionReference } from "convex/server";
import { ref } from "vue";
import { useWantList } from "../../app/composables/use-want-list";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

type WantItem = Doc<"goals">;

const activeItem = {
  _id: "want-active" as Id<"goals">,
  name: "Camera",
  status: "saving",
} as WantItem;
const consideringItem = {
  _id: "want-considering" as Id<"goals">,
  name: "Bike",
  status: "idea",
} as WantItem;
const notNowItem = {
  _id: "want-not-now" as Id<"goals">,
  name: "Kayak",
  status: "on_hold",
} as WantItem;
const boughtItem = {
  _id: "want-bought" as Id<"goals">,
  name: "Headphones",
  status: "purchased",
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
});
const nowRef = ref(Date.UTC(2026, 7, 20, 16));
const summaryPending = ref(false);
const mutations = new Map([
  [getFunctionName(api.goals.create), vi.fn()],
  [getFunctionName(api.goals.update), vi.fn()],
  [getFunctionName(api.goals.changeStatus), vi.fn()],
  [getFunctionName(api.goals.reorder), vi.fn()],
  [getFunctionName(api.goals.purchase), vi.fn()],
  [getFunctionName(api.goals.correctPurchase), vi.fn()],
  [getFunctionName(api.goals.undoPurchase), vi.fn()],
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
        case getFunctionName(api.goals.list):
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
        idea: consideringRef.value,
        on_hold: notNowRef.value,
        purchased: boughtRef.value,
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

    for (const status of ["idea", "on_hold", "purchased"]) {
      expect(subscribeMock).toHaveBeenCalledWith(
        api.goals.listSection,
        { status, paginationOpts: { numItems: 25, cursor: null } },
        expect.any(Function),
        expect.any(Function),
      );
    }
  });

  it("pins the loaded Bought page and loads its continuation independently", () => {
    const firstPage = { page: [boughtItem], isDone: false, continueCursor: "next-bought" };
    subscribeMock.mockImplementation((_query, args, callback) => {
      if (args.status === "idea") callback(consideringRef.value);
      if (args.status === "on_hold") callback(notNowRef.value);
      if (args.status === "purchased" && args.paginationOpts.cursor === null) callback(firstPage);
      return vi.fn();
    });
    const wants = useWantList();
    const older = { ...boughtItem, _id: "older-purchase" as Id<"goals"> };

    wants.history.bought.loadMore();
    wants.history.bought.loadMore();
    expect(subscribeMock).toHaveBeenCalledTimes(5);
    expect(subscribeMock).toHaveBeenNthCalledWith(
      4,
      api.goals.listSection,
      {
        status: "purchased",
        paginationOpts: { numItems: 25, cursor: null, endCursor: "next-bought" },
      },
      expect.any(Function),
      expect.any(Function),
    );
    expect(subscribeMock).toHaveBeenNthCalledWith(
      5,
      api.goals.listSection,
      { status: "purchased", paginationOpts: { numItems: 25, cursor: "next-bought" } },
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
    const goalId = activeItem._id;
    const createArgs = {
      name: "Camera",
      estimatedCostCents: 10_000n,
      priority: "high" as const,
      notes: "",
    };
    const updateArgs = {
      goalId,
      name: "Camera",
      estimatedCostCents: 12_000n,
      priority: "medium" as const,
      targetDate: null,
      notes: "Updated",
    };

    const results = await Promise.all([
      wants.createItem(createArgs),
      wants.updateItem(updateArgs),
      wants.changeStatus({ goalId, status: "on_hold" }),
      wants.reorder({ goalIds: [goalId], expectedGoalIds: [goalId] }),
      wants.previewPurchase({ goalId, actualAmountCents: 10_000n }),
      wants.purchase({
        goalId,
        actualAmountCents: 10_000n,
        purchaseLocalDate: "2026-08-20",
      }),
      wants.correctPurchase({ goalId, actualAmountCents: 9_000n }),
      wants.undoPurchase({ goalId }),
    ]);

    results.forEach((result) => {
      expect(result.success).toBe(true);
    });
    expect(mutationFor(api.goals.create)).toHaveBeenCalledWith(createArgs);
    expect(mutationFor(api.goals.update)).toHaveBeenCalledWith(updateArgs);
    expect(mutationFor(api.goals.changeStatus)).toHaveBeenCalledWith({ goalId, status: "on_hold" });
    expect(mutationFor(api.goals.reorder)).toHaveBeenCalledWith({
      goalIds: [goalId],
      expectedGoalIds: [goalId],
    });
    expect(previewQueryMock).toHaveBeenCalledWith(api.goals.previewPurchase, {
      goalId,
      actualAmountCents: 10_000n,
      now: nowRef.value,
    });
    expect(mutationFor(api.goals.purchase)).toHaveBeenCalledWith({
      goalId,
      actualAmountCents: 10_000n,
      purchaseLocalDate: "2026-08-20",
    });
    expect(mutationFor(api.goals.correctPurchase)).toHaveBeenCalledWith({
      goalId,
      actualAmountCents: 9_000n,
    });
    expect(mutationFor(api.goals.undoPurchase)).toHaveBeenCalledWith({ goalId });
  });

  it("returns server messages and user-safe fallbacks instead of throwing from mutations", async () => {
    mutationFor(api.goals.create).mockRejectedValueOnce("offline");
    mutationFor(api.goals.update).mockRejectedValueOnce(new Error("Want item not found"));
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
        goalId: activeItem._id,
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
