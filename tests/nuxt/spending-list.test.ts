import { mockComponent, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { mount } from "@vue/test-utils";
import { nextTick, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Doc } from "../../convex/_generated/dataModel";
// @ts-expect-error Nuxt transforms Vue SFC imports in this test project.
import SpendingList from "../../app/components/spending/list.vue";

type Expense = Doc<"expenses">;

const { closePopoverByIdMock, useExpensesMock } = vi.hoisted(() => ({
  closePopoverByIdMock: vi.fn(),
  useExpensesMock: vi.fn(),
}));

mockNuxtImport("useExpenses", () => useExpensesMock);
mockNuxtImport("usePopoverClose", () => () => ({ closePopoverById: closePopoverByIdMock }));

mockComponent("SpendingEdit", {
  props: {
    expense: {
      type: Object,
      required: true,
    },
  },
  emits: ["updated"],
  template: `
    <button data-test="emit-update" @click="$emit('updated', expense._id)">
      Save edit
    </button>
  `,
});

function makeExpense(id: string, name: string, notes: string, amount: number): Expense {
  return {
    _id: id as Expense["_id"],
    _creationTime: 1,
    name,
    notes,
    amount,
    householdId: "household-1" as Expense["householdId"],
    date: Date.UTC(2026, 7, 12),
  };
}

function makeWantPurchase(): Expense {
  return {
    ...makeExpense("expense-want", "Camera", "Shared goal", 120),
    amountCents: 12_000n,
    reserveUsedCents: 10_000n,
    wantItemId: "want-camera" as Expense["wantItemId"],
  };
}

function mountList(items: Expense[]) {
  const expenses = ref<Expense[] | undefined>(items);
  const remove = vi.fn();

  useExpensesMock.mockReturnValue({ expenses, remove });

  const wrapper = mount(SpendingList);

  return { expenses, remove, wrapper };
}

beforeEach(() => {
  closePopoverByIdMock.mockReset();
  useExpensesMock.mockReset();
});

describe("SpendingList", () => {
  it("renders TanStack headers and rows while preserving spending content", () => {
    const { wrapper } = mountList([
      makeExpense("expense-1", "Coffee", "Morning", 4.5),
      makeExpense("expense-2", "Groceries", "Weekly shop", 82.17),
    ]);

    expect(wrapper.findAll("thead th").map((header) => header.text())).toEqual([
      "Name",
      "Notes",
      "Value",
      "Actions",
    ]);
    expect(wrapper.findAll("tbody tr")).toHaveLength(2);
    expect(wrapper.text()).toContain("Coffee");
    expect(wrapper.text()).toContain("Morning");
    expect(wrapper.text()).toContain("$4.50");
    expect(wrapper.text()).toContain("Groceries");
    expect(wrapper.text()).toContain("$82.17");
    expect(wrapper.get('button[popovertarget="expense-1"]').text()).toBe("Edit");
    expect(wrapper.get("#expense-1").attributes("popover")).toBe("");
  });

  it("reacts when the composable supplies a new expenses array", async () => {
    const { expenses, wrapper } = mountList([makeExpense("expense-1", "Coffee", "Morning", 4.5)]);

    expenses.value = [makeExpense("expense-2", "Lunch", "Cafe", 14.25)];
    await nextTick();

    expect(wrapper.findAll("tbody tr")).toHaveLength(1);
    expect(wrapper.text()).toContain("Lunch");
    expect(wrapper.text()).toContain("$14.25");
    expect(wrapper.text()).not.toContain("Coffee");
  });

  it("preserves delete and close-on-update behavior with stable row ids", async () => {
    const { remove, wrapper } = mountList([makeExpense("expense-1", "Coffee", "Morning", 4.5)]);

    await wrapper.get("tbody tr button").trigger("click");
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith("expense-1");

    await wrapper.get('[data-test="emit-update"]').trigger("click");
    expect(closePopoverByIdMock).toHaveBeenCalledOnce();
    expect(closePopoverByIdMock).toHaveBeenCalledWith("expense-1");
  });

  it("marks a Want purchase and discloses its exact reserve funding", () => {
    const { wrapper } = mountList([makeWantPurchase()]);

    expect(wrapper.text()).toContain("Want purchase");
    expect(wrapper.text()).toContain("$120.00 total");
    expect(wrapper.text()).toContain("$100.00 from reserve");
    expect(wrapper.text()).toContain("$20.00 budget impact");
    expect(wrapper.find('button[popovertarget="expense-want"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Delete");
  });
});
