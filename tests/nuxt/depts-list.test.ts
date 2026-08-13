import { mockComponent } from "@nuxt/test-utils/runtime";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { type PropType, defineComponent, h, nextTick, ref } from "vue";
import type { Doc } from "../../convex/_generated/dataModel";
// @ts-expect-error Nuxt transforms Vue SFC imports in this test project.
import DeptsList from "../../app/components/depts/list.vue";

type Debt = Doc<"debts">;

const mocks = vi.hoisted(() => ({
  useDepts: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  reorder: vi.fn(),
}));

vi.mock("../../app/composables/use-depts", () => ({
  useDepts: mocks.useDepts,
}));

const VueDraggableStub = defineComponent({
  name: "VueDraggable",
  props: {
    modelValue: {
      type: Array as PropType<Debt[]>,
      required: true,
    },
    tag: {
      type: String,
      default: "div",
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    animation: {
      type: Number,
      default: 0,
    },
    setData: {
      type: Function as PropType<(dataTransfer: DataTransfer) => void>,
      default: undefined,
    },
  },
  emits: ["update:modelValue", "start", "end"],
  setup(props, { slots }) {
    return () =>
      h(
        props.tag,
        {
          "data-test": "draggable",
          "data-disabled": String(props.disabled),
        },
        slots.default?.(),
      );
  },
});

const LazyDeptsEditStub = defineComponent({
  name: "LazyDeptsEdit",
  props: {
    depts: {
      type: Object as PropType<Debt>,
      required: true,
    },
  },
  emits: ["updated"],
  setup(props, { emit }) {
    return () =>
      h(
        "button",
        {
          "data-test": `save-${props.depts._id}`,
          onClick: () => emit("updated", props.depts._id),
        },
        "Save",
      );
  },
});

mockComponent("DeptsEdit", () => LazyDeptsEditStub);

function makeDebt(id: string, creditor: string, payment: number, isPriority = false): Debt {
  return {
    _id: id as Debt["_id"],
    _creationTime: 1,
    creditor,
    isPriority,
    householdId: "household-1" as Debt["householdId"],
    payment,
  };
}

function mountList(items: Debt[]) {
  const depts = ref(items);
  mocks.useDepts.mockReturnValue({
    depts,
    update: mocks.update,
    remove: mocks.remove,
    reorder: mocks.reorder,
  });

  return {
    depts,
    wrapper: mount(DeptsList, {
      global: {
        stubs: {
          Icon: true,
          LazyDeptsEdit: LazyDeptsEditStub,
          VueDraggable: VueDraggableStub,
        },
      },
    }),
  };
}

beforeEach(() => {
  mocks.useDepts.mockReset();
  mocks.update.mockReset();
  mocks.remove.mockReset();
  mocks.reorder.mockReset();
  mocks.reorder.mockResolvedValue({ success: true });
});

describe("DeptsList", () => {
  it("renders TanStack columns and reactive debt rows in source order", async () => {
    const first = makeDebt("debt-1", "Visa", 125.5, true);
    const second = makeDebt("debt-2", "Student loan", 300);
    const { depts, wrapper } = mountList([first, second]);

    expect(wrapper.findAll("thead th").map((header) => header.text())).toEqual([
      "Order",
      "In Snowball",
      "Creditor",
      "Payment",
      "Actions",
    ]);
    expect(wrapper.findAll("tbody tr").map((row) => row.text())).toEqual([
      expect.stringContaining("Visa$125.50"),
      expect.stringContaining("Student loan$300.00"),
    ]);
    expect(wrapper.findAll(".drag-handle")).toHaveLength(2);
    expect(wrapper.get(".drag-handle").attributes("aria-label")).toBe("Move Visa, position 1 of 2");
    expect(wrapper.get(".drag-handle").attributes("aria-keyshortcuts")).toBe("ArrowUp ArrowDown");

    depts.value = [makeDebt("debt-3", "Car loan", 450)];
    await nextTick();

    expect(wrapper.findAll("tbody tr")).toHaveLength(1);
    expect(wrapper.text()).toContain("Car loan");
    expect(wrapper.text()).not.toContain("Visa");
  });

  it("persists the VueDraggable order with branded debt ids", async () => {
    const first = makeDebt("debt-1", "Visa", 125.5);
    const second = makeDebt("debt-2", "Student loan", 300);
    const { wrapper } = mountList([first, second]);
    const draggable = wrapper.findComponent(VueDraggableStub);

    draggable.vm.$emit("start", { oldIndex: 0 });
    draggable.vm.$emit("update:modelValue", [second, first]);
    await nextTick();
    draggable.vm.$emit("end", { oldIndex: 0, newIndex: 1 });
    await flushPromises();

    expect(wrapper.findAll("tbody tr").map((row) => row.text())).toEqual([
      expect.stringContaining("Student loan"),
      expect.stringContaining("Visa"),
    ]);
    expect(mocks.reorder).toHaveBeenCalledOnce();
    expect(mocks.reorder).toHaveBeenCalledWith({
      orderedIds: ["debt-2", "debt-1"],
    });
    expect(wrapper.text()).toContain("Visa moved to position 2. Order saved.");
  });

  it("suppresses the browser's native row drag preview", () => {
    const { wrapper } = mountList([makeDebt("debt-1", "Visa", 125.5)]);
    const draggable = wrapper.findComponent(VueDraggableStub);
    const setData = draggable.props("setData");

    expect(setData).toEqual(expect.any(Function));
    if (typeof setData !== "function") return;

    const setDragImage = vi.fn();
    const setTransferData = vi.fn();

    setData({ setDragImage, setData: setTransferData } as unknown as DataTransfer);

    const [dragImage, offsetX, offsetY] = setDragImage.mock.calls[0] ?? [];
    expect(dragImage).toBeInstanceOf(HTMLCanvasElement);
    expect([offsetX, offsetY]).toEqual([0, 0]);
    expect(setTransferData).toHaveBeenCalledWith("text/plain", "");
  });

  it("does not save a drag that ends in the original position", async () => {
    const { wrapper } = mountList([
      makeDebt("debt-1", "Visa", 125.5),
      makeDebt("debt-2", "Student loan", 300),
    ]);
    const draggable = wrapper.findComponent(VueDraggableStub);

    draggable.vm.$emit("start", { oldIndex: 0 });
    draggable.vm.$emit("end", { oldIndex: 0, newIndex: 0 });
    await flushPromises();

    expect(mocks.reorder).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Order unchanged.");
  });

  it("supports keyboard reordering and keeps focusable handles named", async () => {
    const { wrapper } = mountList([
      makeDebt("debt-1", "Visa", 125.5),
      makeDebt("debt-2", "Student loan", 300),
    ]);

    await wrapper.get('button[aria-label="Move Visa, position 1 of 2"]').trigger("keydown", {
      key: "ArrowDown",
    });
    await flushPromises();

    expect(wrapper.findAll("tbody tr").map((row) => row.text())).toEqual([
      expect.stringContaining("Student loan"),
      expect.stringContaining("Visa"),
    ]);
    expect(mocks.reorder).toHaveBeenCalledWith({
      orderedIds: ["debt-2", "debt-1"],
    });
    expect(wrapper.get(".drag-handle").attributes("aria-label")).toBe(
      "Move Student loan, position 1 of 2",
    );
  });

  it("restores the last server order and announces a failed save", async () => {
    mocks.reorder.mockRejectedValueOnce(new Error("Network unavailable"));
    const first = makeDebt("debt-1", "Visa", 125.5);
    const second = makeDebt("debt-2", "Student loan", 300);
    const { wrapper } = mountList([first, second]);
    const draggable = wrapper.findComponent(VueDraggableStub);

    draggable.vm.$emit("start", { oldIndex: 0 });
    draggable.vm.$emit("update:modelValue", [second, first]);
    await nextTick();
    draggable.vm.$emit("end", { oldIndex: 0, newIndex: 1 });
    await flushPromises();

    expect(wrapper.findAll("tbody tr").map((row) => row.text())).toEqual([
      expect.stringContaining("Visa"),
      expect.stringContaining("Student loan"),
    ]);
    expect(wrapper.get('[role="alert"]').text()).toContain(
      "Order couldn’t be saved. The last saved order has been restored.",
    );
  });

  it("defers reactive server changes until an active drag ends", async () => {
    const first = makeDebt("debt-1", "Visa", 125.5);
    const second = makeDebt("debt-2", "Student loan", 300);
    const { depts, wrapper } = mountList([first, second]);
    const draggable = wrapper.findComponent(VueDraggableStub);

    draggable.vm.$emit("start", { oldIndex: 0 });
    depts.value = [makeDebt("debt-3", "Car loan", 450)];
    await nextTick();

    expect(wrapper.text()).toContain("Visa");
    expect(wrapper.text()).not.toContain("Car loan");

    draggable.vm.$emit("end", { oldIndex: 0, newIndex: 0 });
    await flushPromises();

    expect(wrapper.text()).toContain("Car loan");
    expect(wrapper.text()).not.toContain("Visa");
  });

  it("preserves priority toggling and deletion actions", async () => {
    const debt = makeDebt("debt-1", "Visa", 125.5, true);
    const { wrapper } = mountList([debt]);

    await wrapper.get('button[aria-label="Remove Visa from the snowball"]').trigger("click");
    await wrapper.get('button[aria-label="Delete Visa"]').trigger("click");

    expect(mocks.update).toHaveBeenCalledWith({ id: "debt-1", isPriority: false });
    expect(mocks.remove).toHaveBeenCalledWith({ id: "debt-1" });
  });

  it("closes the matching edit drawer after an update", async () => {
    const { wrapper } = mountList([makeDebt("debt-1", "Visa", 125.5)]);
    const drawerToggle = wrapper.get<HTMLInputElement>("#debt-1");
    drawerToggle.element.checked = true;
    await flushPromises();

    await wrapper.get('[data-test="save-debt-1"]').trigger("click");
    await nextTick();

    expect(drawerToggle.element.checked).toBe(false);
  });
});
