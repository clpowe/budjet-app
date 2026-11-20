import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { type PropType, defineComponent, h, nextTick } from "vue";
import type { Doc, Id } from "../../convex/_generated/dataModel";
// @ts-expect-error Nuxt transforms Vue SFC imports in this test project.
import GoalsList from "../../app/components/goals/list.vue";

type Goal = Doc<"goals">;

const householdId = "household-1" as Id<"households">;
const ownerId = "user-1" as Id<"users">;

const VueDraggableStub = defineComponent({
  name: "VueDraggable",
  props: {
    modelValue: {
      type: Array as PropType<Goal[]>,
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
  },
  emits: ["update:modelValue", "start", "end"],
  setup(props, { slots }) {
    return () => h(props.tag, slots.default?.());
  },
});

function makeGoal(id: string, name: string, order: number): Goal {
  return {
    _id: id as Id<"goals">,
    _creationTime: 1,
    householdId,
    name,
    estimatedCostCents: 10_000n,
    priority: "medium",
    notes: "",
    status: "saving",
    order,
    createdBy: ownerId,
    updatedBy: ownerId,
    createdAt: 1,
    updatedAt: 1,
  };
}

const camera = makeGoal("goal-camera", "Camera", 0);
const bike = makeGoal("goal-bike", "Bike", 1);
const trip = makeGoal("goal-trip", "Trip", 2);

function mountList(
  items: Goal[] = [camera, bike, trip],
  extraProps: {
    reorderError?: string;
    reorderPending?: boolean;
  } = {},
) {
  return mount(GoalsList, {
    props: {
      title: "Saving for",
      items,
      reorderable: true,
      ...extraProps,
    },
    global: {
      stubs: {
        Icon: true,
        VueDraggable: VueDraggableStub,
      },
    },
  });
}

function renderedNames(wrapper: ReturnType<typeof mountList>) {
  return wrapper.findAll('[data-test="goal-item"]').map((row) => row.text());
}

async function simulatePointerReorder(
  wrapper: ReturnType<typeof mountList>,
  nextItems: Goal[],
  oldIndex: number,
  newIndex: number,
) {
  const draggable = wrapper.findComponent(VueDraggableStub);

  draggable.vm.$emit("start", { oldIndex });
  draggable.vm.$emit("update:modelValue", nextItems);
  await nextTick();
  draggable.vm.$emit("end", { oldIndex, newIndex });
  await flushPromises();
}

function lastReorder(wrapper: ReturnType<typeof mountList>) {
  return wrapper.emitted("reorder")?.at(-1)?.[0];
}

beforeEach(() => {
  camera.order = 0;
  bike.order = 1;
  trip.order = 2;
});

describe("GoalsList reordering", () => {
  it("emits the complete active ID list after a pointer reorder", async () => {
    const wrapper = mountList();

    await simulatePointerReorder(wrapper, [bike, trip, camera], 0, 2);

    expect(lastReorder(wrapper)).toEqual({
      expectedGoalIds: [camera._id, bike._id, trip._id],
      goalIds: [bike._id, trip._id, camera._id],
    });
    expect(renderedNames(wrapper)).toEqual([
      expect.stringContaining("Bike"),
      expect.stringContaining("Trip"),
      expect.stringContaining("Camera"),
    ]);
  });

  it("labels purchase and status actions with the goal name", () => {
    const wrapper = mountList([camera]);

    const purchase = wrapper.get('button[aria-label="Record purchase of Camera"]');
    expect(purchase.text()).toBe("Record purchase");
    expect(wrapper.get('button[aria-label="Move to Ideas: Camera"]').text()).toBe("Move to Ideas");
    expect(wrapper.get('button[aria-label="Put on hold: Camera"]').text()).toBe("Put on hold");
  });

  it("offers named Move up and Move down buttons that emit a complete ID list", async () => {
    const wrapper = mountList();

    await wrapper.get('button[aria-label="Move Bike up"]').trigger("click");
    await flushPromises();

    expect(lastReorder(wrapper)).toEqual({
      expectedGoalIds: [camera._id, bike._id, trip._id],
      goalIds: [bike._id, camera._id, trip._id],
    });
    expect(renderedNames(wrapper)).toEqual([
      expect.stringContaining("Bike"),
      expect.stringContaining("Camera"),
      expect.stringContaining("Trip"),
    ]);
  });

  it("disables movement beyond the queue boundaries", () => {
    const wrapper = mountList();

    expect(wrapper.get('button[aria-label="Move Camera up"]').attributes("disabled")).toBeDefined();
    expect(
      wrapper.get('button[aria-label="Move Camera down"]').attributes("disabled"),
    ).toBeUndefined();
    expect(wrapper.get('button[aria-label="Move Trip up"]').attributes("disabled")).toBeUndefined();
    expect(wrapper.get('button[aria-label="Move Trip down"]').attributes("disabled")).toBeDefined();
  });

  it("blocks pointer and button reordering while a save is pending", async () => {
    const wrapper = mountList([camera, bike], { reorderPending: true });

    expect(wrapper.get('[aria-label="Saving for"]').attributes("aria-busy")).toBe("true");
    expect(
      wrapper.get('button[aria-label="Move Camera down"]').attributes("disabled"),
    ).toBeDefined();
    expect(wrapper.get('button[aria-label="Move Bike up"]').attributes("disabled")).toBeDefined();

    await simulatePointerReorder(wrapper, [bike, camera], 0, 1);

    expect(wrapper.emitted("reorder")).toBeUndefined();
  });

  it("restores the latest server order and announces a stale-order failure", async () => {
    const wrapper = mountList([camera, bike]);

    await simulatePointerReorder(wrapper, [bike, camera], 0, 1);
    await wrapper.setProps({
      items: [camera, bike],
      reorderError: "The queue changed. The latest order has been restored.",
    });
    await nextTick();

    expect(renderedNames(wrapper)).toEqual([
      expect.stringContaining("Camera"),
      expect.stringContaining("Bike"),
    ]);
    expect(wrapper.get('[role="alert"]').text()).toContain(
      "The queue changed. The latest order has been restored.",
    );
  });
});
