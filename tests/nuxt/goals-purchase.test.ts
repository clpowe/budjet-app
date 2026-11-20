import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vite-plus/test";
import type { Doc, Id } from "../../convex/_generated/dataModel";
// @ts-expect-error Nuxt transforms Vue SFC imports in this test project.
import PurchaseHistory from "../../app/components/goals/purchase-history.vue";
// @ts-expect-error Nuxt transforms Vue SFC imports in this test project.
import PurchaseDialog from "../../app/components/goals/purchase-dialog.vue";

type Goal = Doc<"goals">;

const householdId = "household-1" as Id<"households">;
const ownerId = "user-1" as Id<"users">;

function makeGoal(status: Goal["status"] = "saving"): Goal {
  return {
    _id: "goal-camera" as Id<"goals">,
    _creationTime: 1,
    householdId,
    name: "Camera",
    estimatedCostCents: 10_000n,
    priority: "high",
    notes: "For the trip",
    status,
    ...(status === "saving" ? { order: 0 } : {}),
    ...(status === "purchased"
      ? {
          purchasedBy: ownerId,
          purchasedAt: Date.UTC(2026, 7, 18, 16),
          expenseId: "expense-camera" as Id<"expenses">,
        }
      : {}),
    createdBy: ownerId,
    updatedBy: ownerId,
    createdAt: 1,
    updatedAt: 1,
  };
}

const trip: Goal = {
  ...makeGoal(),
  _id: "goal-trip" as Id<"goals">,
  name: "Trip",
  estimatedCostCents: 5_000n,
  order: 1,
};

function mountDialog(
  extraProps: {
    activeGoals?: Goal[];
    availableSavingsCents?: bigint;
    error?: string;
    isSubmitting?: boolean;
    mode?: "purchase" | "correct";
  } = {},
) {
  return mount(PurchaseDialog, {
    props: {
      open: true,
      item: makeGoal(),
      mode: "purchase",
      purchaseLocalDate: "2026-08-19",
      activeGoals: [makeGoal(), trip],
      availableSavingsCents: 10_000n,
      ...extraProps,
    },
    attachTo: document.body,
  });
}

describe("GoalsPurchaseDialog", () => {
  it.each([
    {
      name: "fully funded",
      availableSavingsCents: 15_000n,
      expected: ["Actual amount$100.00", "Paid from savings$100.00", "General-budget impact$0.00"],
    },
    {
      name: "partially funded",
      availableSavingsCents: 8_000n,
      expected: ["Actual amount$100.00", "Paid from savings$80.00", "General-budget impact$20.00"],
    },
    {
      name: "unfunded",
      availableSavingsCents: -500n,
      expected: ["Actual amount$100.00", "Paid from savings$0.00", "General-budget impact$100.00"],
    },
  ])("computes a $name purchase breakdown locally", ({ availableSavingsCents, expected }) => {
    const wrapper = mountDialog({ availableSavingsCents });
    const breakdown = wrapper.get('[data-test="purchase-breakdown"]');

    expected.forEach((copy) => expect(breakdown.text()).toContain(copy));
    expect(wrapper.text()).not.toContain("Refreshing purchase breakdown");

    wrapper.unmount();
  });

  it("shows affected goals and their remaining progress", async () => {
    // $150 saved: Camera holds $100, Trip holds $50. Paying $120 leaves $30 for Trip.
    const wrapper = mountDialog({ availableSavingsCents: 15_000n });

    expect(wrapper.find('[data-test="progress-losses"]').exists()).toBe(false);

    await wrapper.get<HTMLInputElement>('input[name="actualAmount"]').setValue("120.00");

    const impact = wrapper.get('[data-test="progress-losses"]');

    expect(impact.get("h3").text()).toBe("Progress affected on other goals");
    expect(impact.text()).toContain("Trip");
    expect(impact.text()).toContain("$20.00 progress used");
    expect(impact.text()).toContain("$30.00 remains allocated");

    wrapper.unmount();
  });

  it("updates the breakdown as the amount changes and submits only the amount and date", async () => {
    const wrapper = mountDialog();
    const input = wrapper.get<HTMLInputElement>('input[name="actualAmount"]');

    await input.setValue("120.00");

    const breakdown = wrapper.get('[data-test="purchase-breakdown"]');
    expect(breakdown.text()).toContain("Actual amount$120.00");
    expect(breakdown.text()).toContain("Paid from savings$100.00");
    expect(breakdown.text()).toContain("General-budget impact$20.00");
    expect(wrapper.emitted("request-preview")).toBeUndefined();

    await wrapper.get("form").trigger("submit");

    expect(wrapper.emitted("submit")?.at(-1)?.[0]).toEqual({
      goalId: "goal-camera",
      actualAmountCents: 12_000n,
      purchaseLocalDate: "2026-08-19",
    });

    wrapper.unmount();
  });

  it("hides the breakdown for an invalid amount", async () => {
    const wrapper = mountDialog();

    await wrapper.get<HTMLInputElement>('input[name="actualAmount"]').setValue("abc");

    expect(wrapper.find('[data-test="purchase-breakdown"]').exists()).toBe(false);
    expect(wrapper.get('button[type="submit"]').attributes("disabled")).toBeDefined();

    wrapper.unmount();
  });

  it("hides the breakdown when the goal has left the active queue", () => {
    const wrapper = mountDialog({ activeGoals: [trip] });

    expect(wrapper.find('[data-test="purchase-breakdown"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="progress-losses"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it("shows no breakdown when correcting a purchase", () => {
    const wrapper = mountDialog({ mode: "correct" });

    expect(wrapper.find('[data-test="purchase-breakdown"]').exists()).toBe(false);
    expect(wrapper.get("h2").text()).toBe("Correct Camera purchase");

    wrapper.unmount();
  });

  it("announces mutation-pending and mutation-error states", () => {
    const submitting = mountDialog({
      error: "Could not complete this purchase. Try again.",
      isSubmitting: true,
    });

    expect(submitting.get('[role="alert"]').text()).toContain(
      "Could not complete this purchase. Try again.",
    );
    expect(submitting.get('button[type="submit"]').attributes("aria-busy")).toBe("true");
    expect(submitting.get<HTMLInputElement>('input[name="actualAmount"]').element.value).toBe(
      "100.00",
    );
    submitting.unmount();
  });
});

describe("GoalsPurchaseHistory", () => {
  function mountHistory() {
    return mount(PurchaseHistory, {
      props: {
        items: [makeGoal("purchased")],
      },
      global: {
        stubs: {
          NuxtLink: {
            props: ["to"],
            template: '<a :href="to"><slot /></a>',
          },
        },
      },
    });
  }

  it("shows linked ledger details and a dedicated correction entry point", async () => {
    const wrapper = mountHistory();

    expect(wrapper.text()).toContain("Bought history");
    expect(wrapper.text()).toContain("Camera");
    expect(wrapper.text()).toContain("Purchased");
    expect(wrapper.get('a[href="/monthly?expense=expense-camera"]').text()).toContain(
      "View linked ledger entry",
    );

    await wrapper.get('button[aria-label="Correct Camera purchase"]').trigger("click");

    expect(wrapper.emitted("correct")?.[0]?.[0]).toMatchObject({
      _id: "goal-camera",
      expenseId: "expense-camera",
    });
  });

  it("requires confirmation before undoing a purchase", async () => {
    const wrapper = mountHistory();

    await wrapper.get('button[aria-label="Undo Camera purchase"]').trigger("click");

    expect(wrapper.get('[role="alertdialog"]').text()).toContain(
      "This removes the linked expense and restores Camera to the bottom of Plan for it.",
    );
    expect(wrapper.emitted("undo")).toBeUndefined();

    await wrapper.get('button[aria-label="Confirm undo Camera purchase"]').trigger("click");

    expect(wrapper.emitted("undo")?.[0]?.[0]).toBe("goal-camera");
  });

  it("never exposes generic expense edit or delete actions", () => {
    const wrapper = mountHistory();

    expect(wrapper.find('button[aria-label="Edit Camera"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Delete Camera"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Edit expense");
    expect(wrapper.text()).not.toContain("Delete expense");
  });
});
