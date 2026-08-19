import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vite-plus/test";
// @ts-expect-error Nuxt transforms Vue SFC imports in this test project.
import WantsForm from "../../app/components/wants/form.vue";

const { toTransactionTimestampMock } = vi.hoisted(() => ({
  toTransactionTimestampMock: vi.fn((date: string) => {
    return date === "2026-08-20" ? 1_776_316_400_000 : Number.NaN;
  }),
}));

mockNuxtImport("useDate", () => () => ({
  toTransactionTimestamp: toTransactionTimestampMock,
}));

function makeModel() {
  return {
    name: "Camera",
    estimatedCost: "120.05",
    priority: "high" as const,
    targetDate: "",
    notes: "",
  };
}

describe("WantsForm", () => {
  it("requires a name, exact estimated cost, and priority before submitting", async () => {
    const wrapper = mount(WantsForm, {
      props: {
        modelValue: {
          ...makeModel(),
          name: "",
          estimatedCost: "",
          priority: "",
        },
      },
    });

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.emitted("submit")).toBeUndefined();
    expect(wrapper.text()).toContain("Enter a name.");
    expect(wrapper.text()).toContain("Enter an estimated cost.");
    expect(wrapper.text()).toContain("Choose a priority.");
    expect(wrapper.findAll('[aria-invalid="true"]')).toHaveLength(3);
  });

  it("converts a decimal string to exact cents only when it emits submit", async () => {
    const wrapper = mount(WantsForm, {
      props: {
        modelValue: makeModel(),
      },
    });

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.emitted("submit")).toEqual([
      [
        {
          name: "Camera",
          estimatedCostCents: 12_005n,
          priority: "high",
          targetDate: undefined,
          notes: "",
        },
      ],
    ]);
  });

  it("rejects an estimated cost with more than two fractional digits", async () => {
    const wrapper = mount(WantsForm, {
      props: {
        modelValue: {
          ...makeModel(),
          estimatedCost: "12.345",
        },
      },
    });

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.emitted("submit")).toBeUndefined();
    expect(wrapper.text()).toContain("no more than two decimal places");
    expect(wrapper.find('input[name="estimatedCost"]').attributes("aria-invalid")).toBe("true");
  });

  it("keeps date and notes optional and interprets a supplied date through the household timezone", async () => {
    const wrapper = mount(WantsForm, {
      props: {
        modelValue: {
          ...makeModel(),
          targetDate: "2026-08-20",
          notes: "For the trip",
        },
      },
    });

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(toTransactionTimestampMock).toHaveBeenCalledWith("2026-08-20");
    expect(wrapper.emitted("submit")?.[0]?.[0]).toMatchObject({
      targetDate: 1_776_316_400_000,
      notes: "For the trip",
    });
  });

  it.each([
    { props: { isSubmitting: true }, expectedLabel: "Saving..." },
    { props: { disabled: true }, expectedLabel: "Save Want" },
  ])("blocks duplicate submission when unavailable", async ({ props, expectedLabel }) => {
    const wrapper = mount(WantsForm, {
      props: {
        modelValue: makeModel(),
        ...props,
      },
    });

    const button = wrapper.get('button[type="submit"]');
    await wrapper.find("form").trigger("submit");

    expect(button.attributes("disabled")).toBeDefined();
    expect(button.text()).toBe(expectedLabel);
    expect(wrapper.emitted("submit")).toBeUndefined();
  });

  it("announces an external mutation error without clearing parent-owned values", () => {
    const modelValue = makeModel();
    const wrapper = mount(WantsForm, {
      props: {
        modelValue,
        error: "Could not save this Want. Try again.",
      },
    });

    const alert = wrapper.get('[role="alert"]');

    expect(alert.text()).toBe("Could not save this Want. Try again.");
    expect(alert.attributes("aria-live")).toBe("polite");
    expect(wrapper.get<HTMLInputElement>('input[name="name"]').element.value).toBe("Camera");
    expect(wrapper.get<HTMLInputElement>('input[name="estimatedCost"]').element.value).toBe(
      "120.05",
    );
  });
});
