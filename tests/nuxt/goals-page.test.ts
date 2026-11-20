import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ref } from "vue";
import type { Doc, Id } from "../../convex/_generated/dataModel";
// @ts-expect-error Nuxt transforms Vue SFC imports in this test project.
import AppHeader from "../../app/components/app-header.vue";
// @ts-expect-error Nuxt transforms Vue SFC imports in this test project.
import GoalsPage from "../../app/pages/goals.vue";

type Goal = Doc<"goals">;
type GoalStatus = Goal["status"];

const mockFns = vi.hoisted(() => ({
  changeStatus: vi.fn(),
  correctPurchase: vi.fn(),
  createItem: vi.fn(),
  purchase: vi.fn(),
  reorder: vi.fn(),
  signOut: vi.fn(),
  undoPurchase: vi.fn(),
  updateItem: vi.fn(),
  useGoalList: vi.fn(),
}));

const authUser = ref({
  email: "owner@example.com",
  name: "Alex Rivera",
});

mockNuxtImport("useGoalList", () => {
  return () => mockFns.useGoalList();
});
mockNuxtImport("useDate", () => {
  return () => ({
    formatDateInput: (date: Date) => date.toISOString().slice(0, 10),
    localDate: ref("2026-08-19"),
  });
});
mockNuxtImport("useBudgetAuth", () => {
  return () => ({
    user: authUser,
    signOut: mockFns.signOut,
  });
});

const householdId = "household-1" as Id<"households">;
const ownerId = "user-1" as Id<"users">;

function makeGoal(id: string, name: string, status: GoalStatus, order?: number): Goal {
  return {
    _id: id as Id<"goals">,
    _creationTime: 1,
    householdId,
    name,
    estimatedCostCents: 10_000n,
    priority: "medium",
    notes: "",
    status,
    order,
    createdBy: ownerId,
    updatedBy: ownerId,
    createdAt: 1,
    updatedAt: 1,
  };
}

function makeSummary() {
  return {
    positionCents: 4_000n,
    availableSavingsCents: 4_000n,
    recoveryAmountCents: 0n,
    todayOverageAdjustmentCents: 0n,
    projectedEndOfDayContributionCents: 2_500n,
  };
}

function arrangePage({
  active = [],
  purchased = [],
  ideas = [],
  isLoading = false,
  onHold = [],
  loadMoreBought,
  summary = makeSummary(),
}: {
  active?: Goal[];
  purchased?: Goal[];
  ideas?: Goal[];
  isLoading?: boolean;
  onHold?: Goal[];
  loadMoreBought?: () => Goal;
  summary?: ReturnType<typeof makeSummary>;
} = {}) {
  const sections = ref({ active, purchased, ideas, onHold });
  function section() {
    return {
      isInitialLoading: ref(false),
      isLoadingMore: ref(false),
      canLoadMore: ref(false),
      error: ref(""),
      loadMore: vi.fn(),
      retry: vi.fn(),
    };
  }
  const history = { ideas: section(), onHold: section(), purchased: section() };
  if (loadMoreBought) {
    history.purchased.canLoadMore.value = true;
    history.purchased.loadMore.mockImplementation(() => {
      sections.value.purchased.push(loadMoreBought());
      history.purchased.canLoadMore.value = false;
    });
  }
  mockFns.useGoalList.mockReturnValue({
    sections,
    history,
    summary: ref(summary),
    isLoading: ref(isLoading),
    createItem: mockFns.createItem,
    updateItem: mockFns.updateItem,
    changeStatus: mockFns.changeStatus,
    reorder: mockFns.reorder,
    purchase: mockFns.purchase,
    correctPurchase: mockFns.correctPurchase,
    undoPurchase: mockFns.undoPurchase,
  });

  return mount(GoalsPage, {
    global: {
      stubs: {
        Icon: true,
      },
    },
  });
}

beforeEach(() => {
  Object.values(mockFns).forEach((mock) => mock.mockReset());
  mockFns.signOut.mockResolvedValue({ success: true });
});

describe("GoalsPage", () => {
  it("announces the loading state before rendering the queue", () => {
    const wrapper = arrangePage({ isLoading: true });

    expect(wrapper.get("main").attributes("aria-busy")).toBe("true");
    expect(wrapper.get('[role="status"]').text()).toContain("Loading goals");
  });

  it("offers a clear first action when the household has no goals", () => {
    const wrapper = arrangePage();

    expect(wrapper.get("h1").text()).toBe("Goals");
    expect(wrapper.text()).toContain("No goals yet");
    expect(wrapper.get('button[aria-label="Add goal"]').text()).toContain("Add goal");
  });

  it("explains a savings shortfall without presenting a negative available balance", () => {
    const summary = makeSummary();
    summary.positionCents = 1_000n;
    summary.availableSavingsCents = 0n;
    summary.recoveryAmountCents = 500n;
    summary.todayOverageAdjustmentCents = -1_500n;
    summary.projectedEndOfDayContributionCents = 0n;

    const wrapper = arrangePage({ summary });

    expect(wrapper.text()).toContain("Savings shortfall");
    expect(wrapper.text()).toContain("Your next $5.00 of unused budget will cover this.");
    expect(wrapper.text()).not.toContain("-$5.00 available");
  });

  it("derives active queue progress locally from available savings", () => {
    const camera = makeGoal("goal-camera", "Camera", "saving", 0);
    const headphones = makeGoal("goal-headphones", "Headphones", "saving", 1);

    const wrapper = arrangePage({ active: [camera, headphones] });
    const headphonesProgress = wrapper.get('progress[aria-label="Headphones funding progress"]');
    expect(Number(headphonesProgress.attributes("value"))).toBe(0);
    const progress = wrapper.get('progress[aria-label="Camera funding progress"]');

    expect(wrapper.text()).toContain("Saving for");
    expect(wrapper.text()).toContain("Next: Camera");
    expect(wrapper.text()).toContain("$40.00 of $100.00");
    expect(Number(progress.attributes("value")) / Number(progress.attributes("max"))).toBe(0.4);
  });

  it("keeps Ideas, On hold and Purchase history in distinct sections", () => {
    const wrapper = arrangePage({
      ideas: [makeGoal("goal-bike", "Bike", "idea")],
      onHold: [makeGoal("goal-kayak", "Kayak", "on_hold")],
      purchased: [makeGoal("goal-headphones", "Headphones", "purchased")],
    });

    const headings = wrapper.findAll("h2").map((heading) => heading.text());

    expect(headings).toEqual(expect.arrayContaining(["Ideas", "On hold", "Purchase history"]));
    expect(wrapper.text()).toContain("Bike");
    expect(wrapper.text()).toContain("Kayak");
    expect(wrapper.text()).toContain("Headphones");
  });

  it("offers purchase correction for an older purchased goal after loading the next page", async () => {
    const wrapper = arrangePage({
      ideas: [makeGoal("bike", "Bike", "idea")],
      purchased: Array.from({ length: 25 }, (_, index) =>
        makeGoal(`purchased-${index}`, `Bought ${index}`, "purchased"),
      ),
      loadMoreBought: () => makeGoal("older", "Older headphones", "purchased"),
    });
    expect(wrapper.find('[aria-label="Correct Older headphones purchase"]').exists()).toBe(false);
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Load more from Purchase history")!
      .trigger("click");
    expect(wrapper.find('[aria-label="Ideas"]').text()).toContain("Bike");
    await wrapper.get('[aria-label="Correct Older headphones purchase"]').trigger("click");
    expect(wrapper.text()).toContain("Correct Older headphones purchase");
  });

  it("distinguishes available savings from the estimate for today", () => {
    const wrapper = arrangePage();
    const summary = wrapper.get('[aria-label="Savings summary"]');

    expect(summary.text()).toContain("Available savings$40.00");
    expect(summary.text()).toContain("Estimated savings from today");
    expect(summary.text()).not.toContain("Potential tonight");
    expect(summary.text()).toContain("$25.00");
  });
});

describe("AppHeader goals navigation", () => {
  it("includes Goals in the primary navigation", () => {
    const wrapper = mount(AppHeader, {
      global: {
        stubs: {
          // The add-transaction dialog subscribes to Convex; not under test here.
          ExpensesAdd: true,
          Icon: true,
          NuxtLink: {
            props: ["to"],
            template: '<a :href="to"><slot /></a>',
          },
        },
      },
    });

    expect(wrapper.find('nav[aria-label="Primary"] a[href="/goals"]').exists()).toBe(true);
    expect(wrapper.findAll('nav[aria-label="Primary"] a').map((link) => link.text())).toEqual([
      "Home",
      "Transactions",
      "Goals",
      "Household",
    ]);
    expect(wrapper.get('button[aria-label="Add expense"]').text()).toBe("+");
    expect(wrapper.get("#transaction-dialog h2").text()).toBe("Add expense");
  });
});
