import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises, mount } from "@vue/test-utils";
import { expect, it, vi } from "vite-plus/test";
import { ref } from "vue";
import type { Doc } from "../../convex/_generated/dataModel";
// @ts-expect-error Nuxt transforms Vue SFC imports in this test project.
import ExpenseEdit from "../../app/components/expenses/edit.vue";

const mutate = vi.hoisted(() => vi.fn().mockResolvedValue({ success: true }));

mockNuxtImport("useConvexMutation", () => () => ({ mutate, isPending: ref(false) }));
mockNuxtImport("useDate", () => () => ({
  formatDateInput: (date: Date) => date.toISOString().slice(0, 10),
}));

it("uses the stored date and only requests a move when the date field changes", async () => {
  const expense = {
    _id: "expense",
    name: "Late dinner",
    notes: "",
    amountCents: 2_000n,
    localDate: "2026-03-10",
  } as Doc<"expenses">;
  const wrapper = mount(ExpenseEdit, { props: { expense } });
  const dayInput = wrapper.get<HTMLInputElement>('input[type="date"]');
  expect(dayInput.element.value).toBe("2026-03-10");

  await wrapper.get("textarea").setValue("With tip");
  await wrapper.get("form").trigger("submit");
  await flushPromises();
  expect(mutate).toHaveBeenLastCalledWith({
    expenseId: expense._id,
    name: "Late dinner",
    notes: "With tip",
    amountCents: 2_000n,
  });

  await dayInput.setValue("2026-03-11");
  await wrapper.get("form").trigger("submit");
  await flushPromises();
  expect(mutate).toHaveBeenLastCalledWith(expect.objectContaining({ localDate: "2026-03-11" }));
});
