import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import { mount } from "@vue/test-utils";
import { expect, it, vi } from "vite-plus/test";
import { nextTick, shallowRef } from "vue";
// @ts-expect-error Nuxt transforms Vue SFC imports in this test project.
import HomePage from "../../app/pages/home.vue";

const { useConvexQueryMock } = vi.hoisted(() => ({ useConvexQueryMock: vi.fn() }));
mockNuxtImport("useConvexQuery", () => useConvexQueryMock);
mockNuxtImport("useDate", () => () => ({
  setDate: () => {},
  displayDate: "",
  currentMonth: "",
  currentDate: shallowRef(new Date(0)),
}));

it("renders Home while loading and then shows the savings summary", async () => {
  const loaded = {
    plan: { dailyAllowanceCents: 5000n },
    spending: { today: { expenseCents: 1201n, budgetImpactCents: 801n } },
    savings: { projectedEndOfDayContributionCents: 4199n },
  };
  const summary = shallowRef<typeof loaded>();
  useConvexQueryMock.mockReturnValue({ data: summary });
  const wrapper = mount(HomePage, { global: { stubs: { NuxtPage: true, HouseholdChat: true } } });
  expect(wrapper.text()).toContain("Loading budget");
  expect(wrapper.text()).not.toContain("$0.00");

  summary.value = loaded;
  await nextTick();
  expect(wrapper.text()).toContain("$37.99");
  expect(wrapper.text()).toContain("$8.01");
  expect(wrapper.text()).toContain("$41.99");
  wrapper.unmount();
});

it("subscribes only to the Home summary", () => {
  useConvexQueryMock.mockReset();
  useConvexQueryMock.mockReturnValue({ data: shallowRef() });
  const wrapper = mount(HomePage, { global: { stubs: { NuxtPage: true, HouseholdChat: true } } });
  expect(useConvexQueryMock).toHaveBeenCalledTimes(1);
  wrapper.unmount();
});
