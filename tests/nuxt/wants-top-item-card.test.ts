import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vite-plus/test";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
// @ts-expect-error Nuxt transforms Vue SFC imports in this test project.
import TopItemCard from "../../app/components/wants/top-item-card.vue";

type HomeSummary = FunctionReturnType<typeof api.budget.getHomeSummary>;
type TopItem = NonNullable<HomeSummary["topItem"]>;

function makeSummary(): HomeSummary {
  return {
    dailyAllowanceCents: 10_000n,
    planAllowanceCents: 300_000n,
    expenseCents: 20_000n,
    reserveFundedExpenseCents: 0n,
    budgetImpactExpenseCents: 20_000n,
    currentPlanSetAsideCents: 2_500n,
    safeToSpendCents: 277_500n,
    todayExpenseCents: 0n,
    todayBudgetImpactExpenseCents: 0n,
    positionCents: 4_000n,
    availableReserveCents: 4_000n,
    recoveryAmountCents: 0n,
    liveNegativeAdjustmentCents: 0n,
    potentialTonightCents: 1_000n,
    elapsedDays: 10,
    averageDailySpendCents: 2_000n,
    varianceCents: 80_000n,
    topItem: {
      itemId: "want-camera" as TopItem["itemId"],
      name: "Camera",
      estimatedCostCents: 10_000n,
      allocatedCents: 4_000n,
      remainingCents: 6_000n,
      progressBasisPoints: 4_000,
      targetDate: Date.UTC(2026, 7, 29, 12),
    },
  };
}

function mountCard(summary = makeSummary()) {
  return mount(TopItemCard, {
    props: {
      summary,
      todayLocalDate: "2026-08-19",
      targetLocalDate: "2026-08-29",
    },
    global: {
      stubs: {
        NuxtLink: {
          props: ["to"],
          template: '<a :href="to"><slot /></a>',
        },
      },
    },
  });
}

describe("WantsTopItemCard", () => {
  it("offers a Wants link when no active item exists", () => {
    const summary = makeSummary();
    summary.topItem = null;

    const wrapper = mountCard(summary);

    expect(wrapper.text()).toContain("No active Want");
    expect(wrapper.get('a[href="/wants"]').text()).toContain("View Wants");
  });

  it("shows partial funding with progress and reserve labels", () => {
    const wrapper = mountCard();

    expect(wrapper.text()).toContain("Camera");
    expect(wrapper.text()).toContain("$40.00 of $100.00 funded");
    expect(wrapper.text()).toContain("Available reserve");
    expect(wrapper.text()).toContain("Potential tonight");
    expect(wrapper.get('a[href="/wants"]').text()).toContain("View Wants");

    const progress = wrapper.get('progress[aria-label="Camera funding progress"]');
    expect(progress.attributes("value")).toBe("4000");
    expect(progress.attributes("max")).toBe("10000");
  });

  it("announces a ready Want without a discouraging affordability message", () => {
    const summary = makeSummary();

    if (summary.topItem) {
      summary.topItem.allocatedCents = 10_000n;
      summary.topItem.remainingCents = 0n;
      summary.topItem.progressBasisPoints = 10_000;
    }

    const wrapper = mountCard(summary);

    expect(wrapper.text()).toContain("Camera is fully funded and ready when you are.");
    expect(wrapper.text()).not.toContain("can't afford");
  });

  it("explains reserve recovery constructively", () => {
    const summary = makeSummary();
    summary.recoveryAmountCents = 500n;
    summary.liveNegativeAdjustmentCents = -500n;

    const wrapper = mountCard(summary);

    expect(wrapper.text()).toContain("Reserve recovery");
    expect(wrapper.text()).toContain("$5.00");
    expect(wrapper.text()).toContain("before the reserve can grow again");
    expect(wrapper.text()).not.toContain("can't afford");
  });
});
