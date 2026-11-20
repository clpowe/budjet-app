import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ref } from "vue";
import type { Doc, Id } from "../../convex/_generated/dataModel";
// @ts-expect-error Nuxt transforms Vue SFC imports in this test project.
import AppHeader from "../../app/components/app-header.vue";
// @ts-expect-error Nuxt transforms Vue SFC imports in this test project.
import WantsPage from "../../app/pages/wants.vue";

type WantItem = Doc<"goals">;
type WantStatus = WantItem["status"];

const mockFns = vi.hoisted(() => ({
  changeStatus: vi.fn(),
  correctPurchase: vi.fn(),
  createItem: vi.fn(),
  previewPurchase: vi.fn(),
  purchase: vi.fn(),
  reorder: vi.fn(),
  signOut: vi.fn(),
  undoPurchase: vi.fn(),
  updateItem: vi.fn(),
  useWantList: vi.fn(),
}));

const authUser = ref({
  email: "owner@example.com",
  name: "Alex Rivera",
});

mockNuxtImport("useWantList", () => {
  return () => mockFns.useWantList();
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

function makeWant(id: string, name: string, status: WantStatus, order?: number): WantItem {
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
  bought = [],
  considering = [],
  isLoading = false,
  notNow = [],
  loadMoreBought,
  summary = makeSummary(),
}: {
  active?: WantItem[];
  bought?: WantItem[];
  considering?: WantItem[];
  isLoading?: boolean;
  notNow?: WantItem[];
  loadMoreBought?: () => WantItem;
  summary?: ReturnType<typeof makeSummary>;
} = {}) {
  const sections = ref({ active, bought, considering, notNow });
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
  const history = { considering: section(), notNow: section(), bought: section() };
  if (loadMoreBought) {
    history.bought.canLoadMore.value = true;
    history.bought.loadMore.mockImplementation(() => {
      sections.value.bought.push(loadMoreBought());
      history.bought.canLoadMore.value = false;
    });
  }
  mockFns.useWantList.mockReturnValue({
    sections,
    history,
    summary: ref(summary),
    isLoading: ref(isLoading),
    createItem: mockFns.createItem,
    updateItem: mockFns.updateItem,
    changeStatus: mockFns.changeStatus,
    reorder: mockFns.reorder,
    previewPurchase: mockFns.previewPurchase,
    purchase: mockFns.purchase,
    correctPurchase: mockFns.correctPurchase,
    undoPurchase: mockFns.undoPurchase,
  });

  return mount(WantsPage, {
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

describe("WantsPage", () => {
  it("announces the loading state before rendering the queue", () => {
    const wrapper = arrangePage({ isLoading: true });

    expect(wrapper.get("main").attributes("aria-busy")).toBe("true");
    expect(wrapper.get('[role="status"]').text()).toContain("Loading Wants");
  });

  it("offers a clear first action when the household has no Wants", () => {
    const wrapper = arrangePage();

    expect(wrapper.get("h1").text()).toBe("Wants");
    expect(wrapper.text()).toContain("No Wants yet");
    expect(wrapper.get('button[aria-label="Add Want"]').text()).toContain("Add Want");
  });

  it("explains savings recovery without presenting a negative available balance", () => {
    const summary = makeSummary();
    summary.positionCents = 1_000n;
    summary.availableSavingsCents = 0n;
    summary.recoveryAmountCents = 500n;
    summary.todayOverageAdjustmentCents = -1_500n;
    summary.projectedEndOfDayContributionCents = 0n;

    const wrapper = arrangePage({ summary });

    expect(wrapper.text()).toContain("Savings recovery");
    expect(wrapper.text()).toContain("$5.00");
    expect(wrapper.text()).toContain("before new progress");
    expect(wrapper.text()).not.toContain("-$5.00 available");
  });

  it("derives active queue progress locally from available savings", () => {
    const camera = makeWant("want-camera", "Camera", "saving", 0);
    const headphones = makeWant("want-headphones", "Headphones", "saving", 1);

    const wrapper = arrangePage({ active: [camera, headphones] });
    const headphonesProgress = wrapper.get('progress[aria-label="Headphones funding progress"]');
    expect(Number(headphonesProgress.attributes("value"))).toBe(0);
    const progress = wrapper.get('progress[aria-label="Camera funding progress"]');

    expect(wrapper.text()).toContain("Plan for it");
    expect(wrapper.text()).toContain("Next: Camera");
    expect(wrapper.text()).toContain("$40.00 of $100.00");
    expect(Number(progress.attributes("value")) / Number(progress.attributes("max"))).toBe(0.4);
  });

  it("keeps Considering, Not now, and Bought items in distinct sections", () => {
    const wrapper = arrangePage({
      considering: [makeWant("want-bike", "Bike", "idea")],
      notNow: [makeWant("want-kayak", "Kayak", "on_hold")],
      bought: [makeWant("want-headphones", "Headphones", "purchased")],
    });

    const headings = wrapper.findAll("h2").map((heading) => heading.text());

    expect(headings).toEqual(expect.arrayContaining(["Considering", "Not now", "Bought history"]));
    expect(wrapper.text()).toContain("Bike");
    expect(wrapper.text()).toContain("Kayak");
    expect(wrapper.text()).toContain("Headphones");
  });

  it("offers purchase correction for an older Bought Want after loading the next page", async () => {
    const wrapper = arrangePage({
      considering: [makeWant("bike", "Bike", "idea")],
      bought: Array.from({ length: 25 }, (_, index) =>
        makeWant(`bought-${index}`, `Bought ${index}`, "purchased"),
      ),
      loadMoreBought: () => makeWant("older", "Older headphones", "purchased"),
    });
    expect(wrapper.find('[aria-label="Correct Older headphones purchase"]').exists()).toBe(false);
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Load more from Bought history")!
      .trigger("click");
    expect(wrapper.find('[aria-label="Considering"]').text()).toContain("Bike");
    await wrapper.get('[aria-label="Correct Older headphones purchase"]').trigger("click");
    expect(wrapper.text()).toContain("Correct Older headphones purchase");
  });

  it("distinguishes money available now from the amount that may arrive tonight", () => {
    const wrapper = arrangePage();
    const summary = wrapper.get('[aria-label="Savings summary"]');

    expect(summary.text()).toContain("Savings");
    expect(summary.text()).toContain("$40.00");
    expect(summary.text()).toContain("Potential tonight");
    expect(summary.text()).toContain("$25.00");
  });
});

describe("AppHeader Wants navigation", () => {
  it("includes Wants in the primary navigation", () => {
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

    expect(wrapper.find('nav[aria-label="Primary"] a[href="/wants"]').exists()).toBe(true);
  });
});
