import { mockComponent, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick, type Ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Doc } from "../../convex/_generated/dataModel";
// @ts-expect-error Nuxt transforms Vue SFC imports in this test project.
import WindfallList from "../../app/components/windfall/list.vue";

type Windfall = Doc<"income">;

const mockState = vi.hoisted(() => ({
  remove: vi.fn(),
  windfall: undefined as Ref<Windfall[] | undefined> | undefined,
}));

mockNuxtImport("useWindfall", async () => {
  const { ref } = await import("vue");
  mockState.windfall = ref<Windfall[] | undefined>([]);

  return () => ({
    windfall: mockState.windfall,
    remove: mockState.remove,
  });
});

mockComponent("WindfallEdit", async () => {
  const { defineComponent, h } = await import("vue");

  return defineComponent({
    props: {
      windfall: {
        type: Object,
        required: true,
      },
    },
    emits: ["updated"],
    setup(props, { emit }) {
      return () =>
        h(
          "button",
          {
            class: "windfall-edit-stub",
            onClick: () => emit("updated", (props.windfall as Windfall)._id),
          },
          "Save",
        );
    },
  });
});

const income = {
  _id: "income-id",
  source: "Paycheck",
  amountCents: 125_050n,
} as Windfall;

const outflow = {
  _id: "outflow-id",
  source: "Car repair",
  amountCents: -37_500n,
} as Windfall;

function mountList() {
  return mount(WindfallList, {
    global: {
      stubs: {
        Icon: true,
      },
    },
  });
}

describe("WindfallList", () => {
  beforeEach(() => {
    mockState.remove.mockReset();
    mockState.windfall!.value = [];
  });

  it("renders income and outflows through separate tables", async () => {
    mockState.windfall!.value = [income, outflow];

    const wrapper = mountList();
    await flushPromises();

    const sections = wrapper.findAll("section");
    expect(sections).toHaveLength(2);
    expect(sections[0]!.text()).toContain("Income");
    expect(sections[0]!.text()).toContain("Paycheck");
    expect(sections[0]!.text()).toContain("$1,250.50");
    expect(sections[1]!.text()).toContain("Outflows");
    expect(sections[1]!.text()).toContain("Car repair");
    expect(sections[1]!.text()).toContain("-$375.00");
    expect(wrapper.findAll("thead")).toHaveLength(2);
    expect(wrapper.findAll("thead")[0]!.text()).toContain("NameValueActions");
  });

  it("keeps delete and edit behavior connected to the original row", async () => {
    mockState.windfall!.value = [income, outflow];

    const wrapper = mountList();
    await wrapper.get('button[aria-label="Delete Paycheck"]').trigger("click");
    await wrapper.get('button[aria-label="Edit Paycheck"]').trigger("click");
    const dialog = wrapper.get<HTMLDialogElement>(`dialog#${income._id}`);
    expect(dialog.element.open).toBe(true);

    await wrapper.find(".windfall-edit-stub").trigger("click");

    expect(mockState.remove).toHaveBeenCalledWith(income._id);
    expect(dialog.element.open).toBe(false);
  });

  it("reacts when Convex replaces the windfall data", async () => {
    mockState.windfall!.value = [income];
    const wrapper = mountList();

    expect(wrapper.findAll("table")).toHaveLength(1);
    expect(wrapper.text()).toContain("Income");
    expect(wrapper.text()).not.toContain("Outflows");

    mockState.windfall!.value = [outflow];
    await nextTick();
    await flushPromises();

    const tables = wrapper.findAll("table");
    expect(tables).toHaveLength(1);
    expect(wrapper.text()).not.toContain("Income");
    expect(wrapper.text()).toContain("Outflows");
    expect(tables[0]!.findAll("tbody tr")).toHaveLength(1);
    expect(tables[0]!.text()).toContain("Car repair");
  });
});
