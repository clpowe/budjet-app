import { mockComponent } from "@nuxt/test-utils/runtime";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { Doc } from "../../convex/_generated/dataModel";
// @ts-expect-error Nuxt transforms Vue SFC imports in this test project.
import ExpensesList from "../../app/components/expenses/list.vue";

type Expense = Doc<"expenses">;

mockComponent("ExpensesEdit", {
  props: {
    expense: {
      type: Object,
      required: true,
    },
  },
  emits: ["updated"],
  template: "<div />",
});

function makeExpense(id: string, name: string, amount: number): Expense {
  return {
    _id: id as Expense["_id"],
    _creationTime: 1,
    name,
    notes: "",
    amount,
    householdId: "household-1" as Expense["householdId"],
    date: Date.UTC(2026, 7, 12),
  };
}

function mountList(expenses: Expense[], remove = vi.fn()) {
  return mount(ExpensesList, {
    props: { expenses, remove },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, "confirm");
});

describe("ExpensesList", () => {
  it("renders TanStack headers and rows with formatted amounts", () => {
    const wrapper = mountList([
      makeExpense("expense-1", "Coffee", 4.5),
      makeExpense("expense-2", "Groceries", 82.17),
    ]);

    expect(wrapper.findAll("thead th").map((header) => header.text())).toEqual([
      "Name",
      "Value",
      "Actions",
    ]);
    expect(wrapper.findAll("tbody tr")).toHaveLength(2);
    expect(wrapper.text()).toContain("Coffee");
    expect(wrapper.text()).toContain("$4.50");
    expect(wrapper.text()).toContain("Groceries");
    expect(wrapper.text()).toContain("$82.17");
  });

  it("updates rows when the expenses prop changes", async () => {
    const wrapper = mountList([makeExpense("expense-1", "Coffee", 4.5)]);

    await wrapper.setProps({
      expenses: [makeExpense("expense-2", "Lunch", 14.25)],
    });
    await flushPromises();

    expect(wrapper.findAll("tbody tr")).toHaveLength(1);
    expect(wrapper.text()).toContain("Lunch");
    expect(wrapper.text()).toContain("$14.25");
    expect(wrapper.text()).not.toContain("Coffee");
  });

  it("discloses Want purchase funding and omits generic edit and delete actions", () => {
    const wrapper = mountList([
      {
        ...makeExpense("expense-want", "Camera", 120.01),
        wantItemId: "want-camera" as NonNullable<Expense["wantItemId"]>,
        amountCents: 12_001n,
        savingsUsedCents: 10_002n,
      },
    ]);
    const row = wrapper.get("tbody tr");

    expect(row.find('button[aria-label="Edit Camera"]').exists()).toBe(false);
    expect(row.find('button[aria-label="Delete Camera"]').exists()).toBe(false);
    expect(row.find("dialog").exists()).toBe(false);
    expect(row.text()).toContain("Want purchase");
    expect(row.text()).toContain("$120.01 total");
    expect(row.text()).toContain("$100.02 from savings");
    expect(row.text()).toContain("$19.99 budget impact");
  });

  it("only removes an expense after confirmation", async () => {
    const remove = vi.fn();
    const confirm = vi.fn().mockReturnValue(false);
    Object.defineProperty(window, "confirm", {
      configurable: true,
      value: confirm,
    });
    const wrapper = mountList([makeExpense("expense-1", "Coffee", 4.5)], remove);
    const deleteButton = wrapper.get('button[aria-label="Delete Coffee"]');

    await deleteButton.trigger("click");
    expect(remove).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await deleteButton.trigger("click");

    expect(confirm).toHaveBeenCalledWith(`Delete "Coffee"? This can't be undone.`);
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith("expense-1");
  });

  it("opens the matching edit dialog using the stable row id", async () => {
    const wrapper = mountList([makeExpense("expense-1", "Coffee", 4.5)]);
    const dialog = wrapper.get<HTMLDialogElement>("#expense-1");

    await wrapper.get('button[aria-label="Edit Coffee"]').trigger("click");
    expect(dialog.element.open).toBe(true);
  });
});
