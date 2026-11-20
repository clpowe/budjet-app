import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { getFunctionName, type FunctionReference } from "convex/server";
import { ref } from "vue";
import { useGoalList } from "../../app/composables/use-goal-list";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

type Goal = Doc<"goals">;

const activeItem = {
  _id: "goal-active" as Id<"goals">,
  name: "Camera",
  status: "saving",
} as Goal;
const consideringItem = {
  _id: "goal-ideas" as Id<"goals">,
  name: "Bike",
  status: "idea",
} as Goal;
const notNowItem = {
  _id: "goal-not-now" as Id<"goals">,
  name: "Kayak",
  status: "on_hold",
} as Goal;
const boughtItem = {
  _id: "goal-purchased" as Id<"goals">,
  name: "Headphones",
  status: "purchased",
} as Goal;

const goalsRef = ref({ active: [activeItem] });
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

const clientQueryMock = vi.fn();
const subscribeMock = vi.fn();

describe("useGoalList", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    summaryPending.value = false;
    vi.stubGlobal("useState", () => nowRef);
    vi.stubGlobal("useDate", () => ({ timeZone: ref("America/New_York") }));
    vi.stubGlobal("useConvexClient", () => ({ query: clientQueryMock, onUpdate: subscribeMock }));
    vi.stubGlobal("useConvexMutation", (endpoint: FunctionReference<"mutation">) => ({
      mutate: mutationFor(endpoint),
    }));
    vi.stubGlobal("useConvexQuery", (endpoint: FunctionReference<"query">, args: unknown) => {
      const name = getFunctionName(endpoint);
      switch (name) {
        case getFunctionName(api.goals.list):
          expect(args).toEqual({});
          return { data: goalsRef, isPending: ref(false) };
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
    const goalList = useGoalList();

    expect(goalList.sections.value).toEqual({
      active: [activeItem],
      ideas: [consideringItem],
      onHold: [notNowItem],
      purchased: [boughtItem],
    });
    expect(goalList.summary.value).toEqual(summaryRef.value);
    expect(goalList.isLoading.value).toBe(false);

    summaryPending.value = true;
    expect(goalList.isLoading.value).toBe(true);

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
    const firstPage = { page: [boughtItem], isDone: false, continueCursor: "next-purchased" };
    subscribeMock.mockImplementation((_query, args, callback) => {
      if (args.status === "idea") callback(consideringRef.value);
      if (args.status === "on_hold") callback(notNowRef.value);
      if (args.status === "purchased" && args.paginationOpts.cursor === null) callback(firstPage);
      return vi.fn();
    });
    const goalList = useGoalList();
    const older = { ...boughtItem, _id: "older-purchase" as Id<"goals"> };

    goalList.history.purchased.loadMore();
    goalList.history.purchased.loadMore();
    expect(subscribeMock).toHaveBeenCalledTimes(5);
    expect(subscribeMock).toHaveBeenNthCalledWith(
      4,
      api.goals.listSection,
      {
        status: "purchased",
        paginationOpts: { numItems: 25, cursor: null, endCursor: "next-purchased" },
      },
      expect.any(Function),
      expect.any(Function),
    );
    expect(subscribeMock).toHaveBeenNthCalledWith(
      5,
      api.goals.listSection,
      { status: "purchased", paginationOpts: { numItems: 25, cursor: "next-purchased" } },
      expect.any(Function),
      expect.any(Function),
    );
    expect(goalList.history.purchased.isLoadingMore.value).toBe(true);
    expect(goalList.sections.value.purchased).toEqual([boughtItem]);
    subscribeMock.mock.calls[4]![2]({ page: [older], isDone: true, continueCursor: "" });
    expect(goalList.sections.value.purchased).toEqual([boughtItem, older]);
    expect(goalList.sections.value.ideas).toEqual([consideringItem]);
    expect(goalList.history.purchased.canLoadMore.value).toBe(false);
  });

  it("runs focused network calls and never sends a client clock to a mutation", async () => {
    const goalList = useGoalList();
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
      goalList.createItem(createArgs),
      goalList.updateItem(updateArgs),
      goalList.changeStatus({ goalId, status: "on_hold" }),
      goalList.reorder({ goalIds: [goalId], expectedGoalIds: [goalId] }),
      goalList.purchase({
        goalId,
        actualAmountCents: 10_000n,
        purchaseLocalDate: "2026-08-20",
      }),
      goalList.correctPurchase({ goalId, actualAmountCents: 9_000n }),
      goalList.undoPurchase({ goalId }),
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
    expect(goalList).not.toHaveProperty("previewPurchase");
    expect(clientQueryMock).not.toHaveBeenCalled();
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
    mutationFor(api.goals.update).mockRejectedValueOnce(new Error("Goal not found"));
    const goalList = useGoalList();

    await expect(
      goalList.createItem({
        name: "Camera",
        estimatedCostCents: 10_000n,
        priority: "high",
        notes: "",
      }),
    ).resolves.toEqual({
      success: false,
      error: "Could not create this goal. Try again.",
    });
    await expect(
      goalList.updateItem({
        goalId: activeItem._id,
        name: "Camera",
        estimatedCostCents: 10_000n,
        priority: "high",
        targetDate: null,
        notes: "",
      }),
    ).resolves.toEqual({
      success: false,
      error: "Goal not found",
    });
  });
});
