import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vite-plus/test";
// @ts-expect-error Nuxt transforms Vue SFC imports in this test project.
import GoalsSavingsChart from "../../app/components/goals/savings-chart.vue";

const points = [
  { localDate: "2026-03-07", balanceCents: 3_500n },
  { localDate: "2026-03-08", balanceCents: 0n },
  { localDate: "2026-03-09", balanceCents: -1_000n },
];

function mountChart(props: { points?: typeof points; availableCents?: bigint } = {}) {
  return mount(GoalsSavingsChart, {
    props: { points, availableCents: 0n, ...props },
    attachTo: document.body,
  });
}

describe("GoalsSavingsChart", () => {
  it("names the chart and shows available savings separately from the history", () => {
    const wrapper = mountChart({ availableCents: 4_250n });

    expect(wrapper.get("h2").text()).toBe("Savings balance at day end");
    expect(wrapper.text()).toContain("Available now$42.50");
    wrapper.unmount();
  });

  it("states the latest closed day's balance, including a shortfall", () => {
    const wrapper = mountChart();

    expect(wrapper.get('[data-test="savings-chart-latest"]').text()).toBe("Mar 9: -$10.00");
    expect(wrapper.find('[data-test="savings-chart-empty"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("renders an accessible chart with a zero line", () => {
    const wrapper = mountChart();

    expect(
      wrapper
        .find('[aria-label="Savings balance at the end of each day, with a line at zero"]')
        .exists(),
    ).toBe(true);
    wrapper.unmount();
  });

  it("explains the empty state before any day has closed", () => {
    const wrapper = mountChart({ points: [], availableCents: 0n });

    expect(wrapper.get('[data-test="savings-chart-empty"]').text()).toContain(
      "after the first full day of saving",
    );
    expect(wrapper.find('[data-test="savings-chart-latest"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
