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

  it("preserves empty amount as input state without emitting zero", async () => {
    const wrapper = mount(TransactionsForm, {
      props: {
        modelValue,
        showDate: true,
      },
    });

    await wrapper.find('input[type="number"]').setValue("");
    await wrapper.find("form").trigger("submit");

    const updates = wrapper.emitted("update:modelValue") ?? [];
    expect(updates).toHaveLength(0);
    expect(wrapper.emitted("submit")).toBeUndefined();
    expect(wrapper.text()).toContain("Enter an amount.");
  });

  it("uses mobile-friendly constraints for amount entry", () => {
    const wrapper = mount(TransactionsForm, {
      props: {
        modelValue,
        showPriority: true,
      },
    });

    const amountInput = wrapper.find('input[type="number"]');

    expect(amountInput.attributes("inputmode")).toBe("decimal");
    expect(amountInput.attributes("min")).toBe("0.01");
    expect(amountInput.attributes("step")).toBe("0.01");
    expect(amountInput.attributes("required")).toBeDefined();
  });

  it("explains the priority checkbox", () => {
    const wrapper = mount(TransactionsForm, {
      props: {
        modelValue,
        showPriority: true,
      },
    });

    const checkbox = wrapper.find('input[type="checkbox"]');
    const descriptionId = checkbox.attributes("aria-describedby");

    expect(descriptionId).toBeTruthy();
    expect(wrapper.text()).toContain("Mark as important");
    expect(wrapper.find(`#${descriptionId}`).text()).toBe(
      "Use for transactions you want to keep easy to spot.",
    );
  });

  it("disables submit and exposes busy state while submitting", async () => {
    const wrapper = mount(TransactionsForm, {
      props: {
        modelValue,
        isSubmitting: true,
      },
    });

    const button = wrapper.find('button[type="submit"]');
    await wrapper.find("form").trigger("submit");

    expect(button.attributes("disabled")).toBeDefined();
    expect(button.attributes("aria-busy")).toBe("true");
    expect(button.text()).toBe("Saving...");
    expect(wrapper.emitted("submit")).toBeUndefined();
  });
});
