import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { getFunctionName, type FunctionReference } from "convex/server";
import { ref } from "vue";
import { api } from "../../convex/_generated/api";
// @ts-expect-error Nuxt transforms Vue SFC imports in this test project.
import DebtsAdd from "../../app/components/debts/add.vue";

const { mutate, endpoints } = vi.hoisted(() => ({
  mutate: vi.fn(),
  endpoints: [] as string[],
}));

mockNuxtImport("useConvexMutation", () => (endpoint: FunctionReference<"mutation">) => {
  endpoints.push(getFunctionName(endpoint));
  return { mutate, isPending: ref(false), error: ref(null) };
});

async function fillAndSubmit(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('input[name="name"]').setValue("Car loan");
  await wrapper.get('input[name="amount"]').setValue("250.50");
  await wrapper.get('input[name="isPriority"]').setValue(true);
  await wrapper.get("form").trigger("submit");
  await flushPromises();
}

describe("DebtsAdd", () => {
  beforeEach(() => {
    mutate.mockReset();
    endpoints.length = 0;
  });

  it("creates a debt, never an expense", async () => {
    mutate.mockResolvedValue({ success: true });
    const wrapper = mount(DebtsAdd);

    await fillAndSubmit(wrapper);

    expect(endpoints).toEqual([getFunctionName(api.debts.createDebt)]);
    expect(endpoints).not.toContain(getFunctionName(api.expenses.createExpense));
    expect(mutate).toHaveBeenCalledWith({
      creditor: "Car loan",
      paymentCents: 25_050n,
      isPriority: true,
    });
    wrapper.unmount();
  });

  it("resets the form after a successful save", async () => {
    mutate.mockResolvedValue({ success: true });
    const wrapper = mount(DebtsAdd);

    await fillAndSubmit(wrapper);

    expect(wrapper.get<HTMLInputElement>('input[name="name"]').element.value).toBe("");
    expect(wrapper.get<HTMLInputElement>('input[name="amount"]').element.value).toBe("");
    expect(wrapper.get<HTMLInputElement>('input[name="isPriority"]').element.checked).toBe(false);
    wrapper.unmount();
  });

  it("shows the server error and keeps the entered values", async () => {
    mutate.mockRejectedValue(new Error("Not authenticated"));
    const wrapper = mount(DebtsAdd);

    await fillAndSubmit(wrapper);

    expect(wrapper.text()).toContain("Not authenticated");
    expect(wrapper.get<HTMLInputElement>('input[name="name"]').element.value).toBe("Car loan");
    wrapper.unmount();
  });

  it("falls back to a safe message for non-Error failures", async () => {
    mutate.mockRejectedValue("offline");
    const wrapper = mount(DebtsAdd);

    await fillAndSubmit(wrapper);

    expect(wrapper.text()).toContain("Could not add debt. Try again.");
    wrapper.unmount();
  });
});
