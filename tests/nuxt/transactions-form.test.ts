import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vite-plus/test";
// @ts-expect-error Nuxt transforms Vue SFC imports in this test project.
import TransactionsForm from "../../app/components/transactions/form.vue";

const modelValue = {
  name: "Paycheck",
  notes: "May",
  amount: 1200,
  isPriority: false,
  date: "2026-05-12",
};

describe("TransactionsForm", () => {
  it("blocks submit and announces field errors when required values are invalid", async () => {
    const wrapper = mount(TransactionsForm, {
      props: {
        modelValue: {
          ...modelValue,
          name: "",
          amount: 0,
          date: null,
        },
        showDate: true,
      },
    });

    await wrapper.find("form").trigger("submit");

    expect(wrapper.emitted("submit")).toBeUndefined();
    expect(wrapper.text()).toContain("Enter a name.");
    expect(wrapper.text()).toContain("Amount must be greater than $0.00.");
    expect(wrapper.text()).toContain("Choose a date.");
    expect(wrapper.find('input[aria-invalid="true"]').exists()).toBe(true);
  });

  it("emits submit when required values are valid", async () => {
    const wrapper = mount(TransactionsForm, {
      props: {
        modelValue,
        showDate: true,
      },
    });

    await wrapper.find("form").trigger("submit");

    expect(wrapper.emitted("submit")).toHaveLength(1);
  });
});
