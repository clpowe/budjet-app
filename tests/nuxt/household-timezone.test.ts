import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
// @ts-expect-error Nuxt transforms Vue SFC imports in this test project.
import HouseholdPage from "../../app/pages/household.vue";

const state = vi.hoisted(() => ({
  household: {
    value: {
      _id: "household-1",
      inviteCode: "ABC123",
      name: "Rivera family",
      timeZone: "America/New_York",
    },
  },
  members: { value: [] },
  effectiveTimeZone: { value: "America/New_York" },
  updateTimeZone: vi.fn(),
  user: {
    value: {
      _id: "user-1",
      role: "owner",
    },
  },
}));

mockNuxtImport("useHousehold", () => {
  return () => ({
    household: state.household,
    members: state.members,
    effectiveTimeZone: state.effectiveTimeZone,
    updateTimeZone: state.updateTimeZone,
  });
});

mockNuxtImport("useConvexUser", () => {
  return () => ({ user: state.user });
});

function mountPage() {
  return mount(HouseholdPage, {
    global: {
      stubs: {
        Icon: true,
      },
    },
  });
}

describe("Household timezone settings", () => {
  beforeEach(() => {
    state.household.value = {
      _id: "household-1",
      inviteCode: "ABC123",
      name: "Rivera family",
      timeZone: "America/New_York",
    };
    state.effectiveTimeZone.value = "America/New_York";
    state.user.value = {
      _id: "user-1",
      role: "owner",
    };
    state.updateTimeZone.mockReset();
    state.updateTimeZone.mockResolvedValue({
      success: true,
      currentTimeZone: "America/New_York",
      pendingTimeZone: "America/Los_Angeles",
      pendingTimeZoneEffectiveAt: Date.UTC(2026, 7, 15, 4),
    });
  });

  it("lets the owner schedule a household timezone change", async () => {
    const wrapper = mountPage();
    const select = wrapper.get<HTMLSelectElement>('[data-test="time-zone-select"]');

    expect(select.element.value).toBe("America/New_York");

    await select.setValue("America/Los_Angeles");
    await flushPromises();

    expect(state.updateTimeZone).toHaveBeenCalledWith("America/Los_Angeles");
    expect(wrapper.text()).toContain("Timezone update saved.");
  });

  it("shows members that only the owner can change the timezone", () => {
    state.user.value = {
      _id: "user-2",
      role: "member",
    };

    const wrapper = mountPage();

    expect(wrapper.find('[data-test="time-zone-select"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Only the household owner can change the budget timezone.");
  });
});
