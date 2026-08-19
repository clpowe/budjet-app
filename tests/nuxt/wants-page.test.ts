import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ref } from "vue";
import type { Doc, Id } from "../../convex/_generated/dataModel";
// @ts-expect-error Nuxt transforms Vue SFC imports in this test project.
import AppHeader from "../../app/components/app-header.vue";
// @ts-expect-error Nuxt transforms Vue SFC imports in this test project.
import WantsPage from "../../app/pages/wants.vue";

type WantItem = Doc<"wantItems">;
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
    _id: id as Id<"wantItems">,
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
    availableReserveCents: 4_000n,
    recoveryAmountCents: 0n,
    liveNegativeAdjustmentCents: 0n,
    potentialTonightCents: 2_500n,
    activeAllocations: [] as Array<{
      itemId: Id<"wantItems">;
      allocatedCents: bigint;
      remainingCents: bigint;
      progressBasisPoints: number;
    }>,
    topItem: null as null | {
      itemId: Id<"wantItems">;
      name: string;
      estimatedCostCents: bigint;
      allocatedCents: bigint;
      remainingCents: bigint;
      progressBasisPoints: number;
      targetDate?: number;
    },
  };
}

function arrangePage({
  active = [],
  bought = [],
  considering = [],
  isLoading = false,
  notNow = [],
  summary = makeSummary(),
}: {
  active?: WantItem[];
  bought?: WantItem[];
  considering?: WantItem[];
  isLoading?: boolean;
  notNow?: WantItem[];
  summary?: ReturnType<typeof makeSummary>;
} = {}) {
  mockFns.useWantList.mockReturnValue({
    sections: ref({ active, bought, considering, notNow }),
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

  it("explains reserve recovery without presenting a negative available balance", () => {
    const summary = makeSummary();
    summary.positionCents = 1_000n;
    summary.availableReserveCents = 0n;
    summary.recoveryAmountCents = 500n;
    summary.liveNegativeAdjustmentCents = -1_500n;
    summary.potentialTonightCents = 0n;

    const wrapper = arrangePage({ summary });

    expect(wrapper.text()).toContain("Reserve recovery");
    expect(wrapper.text()).toContain("$5.00");
    expect(wrapper.text()).toContain("before new progress");
    expect(wrapper.text()).not.toContain("-$5.00 available");
  });

  it("renders the active queue with accessible reserve progress", () => {
    const camera = makeWant("want-camera", "Camera", "plan_for_it", 0);
    const summary = makeSummary();
    summary.activeAllocations = [
      {
        itemId: camera._id,
        allocatedCents: 4_000n,
        remainingCents: 6_000n,
        progressBasisPoints: 4_000,
      },
    ];
    summary.topItem = {
      itemId: camera._id,
      name: camera.name,
      estimatedCostCents: camera.estimatedCostCents,
      allocatedCents: 4_000n,
      remainingCents: 6_000n,
      progressBasisPoints: 4_000,
    };

    const wrapper = arrangePage({ active: [camera], summary });
    const progress = wrapper.get('progress[aria-label="Camera funding progress"]');

    expect(wrapper.text()).toContain("Plan for it");
    expect(wrapper.text()).toContain("Camera");
    expect(wrapper.text()).toContain("$40.00 of $100.00");
    expect(Number(progress.attributes("value")) / Number(progress.attributes("max"))).toBe(0.4);
  });

  it("keeps Considering, Not now, and Bought items in distinct sections", () => {
    const wrapper = arrangePage({
      considering: [makeWant("want-bike", "Bike", "considering")],
      notNow: [makeWant("want-kayak", "Kayak", "not_now")],
      bought: [makeWant("want-headphones", "Headphones", "bought")],
    });

    const headings = wrapper.findAll("h2").map((heading) => heading.text());

    expect(headings).toEqual(expect.arrayContaining(["Considering", "Not now", "Bought history"]));
    expect(wrapper.text()).toContain("Bike");
    expect(wrapper.text()).toContain("Kayak");
    expect(wrapper.text()).toContain("Headphones");
  });

  it("distinguishes money available now from the amount that may arrive tonight", () => {
    const wrapper = arrangePage();
    const summary = wrapper.get('[aria-label="Goal reserve summary"]');

    expect(summary.text()).toContain("Available reserve");
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
          Icon: true,
          NuxtLink: {
            props: ["to"],
            template: '<a :href="to"><slot /></a>',
          },
        },
      },
    });

    const wantsLink = wrapper.get('nav[aria-label="Primary"] a[href="/wants"]');

    expect(wantsLink.text()).toBe("Wants");
  });
});
