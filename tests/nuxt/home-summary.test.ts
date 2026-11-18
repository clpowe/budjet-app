import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import { mount } from "@vue/test-utils";
import { expect, it, vi } from "vite-plus/test";
import { nextTick, shallowRef } from "vue";
// @ts-expect-error Nuxt transforms Vue SFC imports in this test project.
import HomePage from "../../app/pages/home.vue";

const { useExpensesMock } = vi.hoisted(() => ({ useExpensesMock: vi.fn() }));
mockNuxtImport("useExpenses", () => useExpensesMock);
mockNuxtImport("useDate", () => () => ({ setDate: () => {} }));
mockNuxtImport("useWindfall", () => () => ({}));
mockNuxtImport("useConvexQuery", () => () => ({}));

it.each(["savings", "reserve"])(
  "renders Home while loading and then shows the %s summary",
  async (field) => {
    const loaded = {
      plan: { dailyAllowanceCents: 5000n },
      spending: { today: { expenseCents: 1201n, budgetImpactCents: 801n } },
      [field]: { projectedEndOfDayContributionCents: 4199n },
    };
    const summary = shallowRef<typeof loaded>();
    useExpensesMock.mockReturnValue({ summary });
    const wrapper = mount(HomePage, { global: { stubs: { NuxtPage: true, HouseholdChat: true } } });
    expect(wrapper.text()).toContain("Loading budget");
    expect(wrapper.text()).not.toContain("$0.00");

    summary.value = loaded;
    await nextTick();
    expect(wrapper.text()).toContain("$37.99");
    expect(wrapper.text()).toContain("$8.01");
    expect(wrapper.text()).toContain("$41.99");
    wrapper.unmount();
  },
);
