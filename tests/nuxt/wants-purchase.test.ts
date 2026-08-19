import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vite-plus/test";
import type { Doc, Id } from "../../convex/_generated/dataModel";
// @ts-expect-error Nuxt transforms Vue SFC imports in this test project.
import BoughtList from "../../app/components/wants/bought-list.vue";
// @ts-expect-error Nuxt transforms Vue SFC imports in this test project.
import PurchaseDialog from "../../app/components/wants/purchase-dialog.vue";

type WantItem = Doc<"wantItems">;

const householdId = "household-1" as Id<"households">;
const ownerId = "user-1" as Id<"users">;

function makeWant(status: WantItem["status"] = "plan_for_it"): WantItem {
  return {
    _id: "want-camera" as Id<"wantItems">,
    _creationTime: 1,
    householdId,
    name: "Camera",
    estimatedCostCents: 10_000n,
    priority: "high",
    notes: "For the trip",
    status,
    ...(status === "plan_for_it" ? { order: 0 } : {}),
    ...(status === "bought"
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

function makePreview({
  actualAmountCents = 10_000n,
  budgetImpactCents = 0n,
  lowerItemImpacts = [],
  reserveUsedCents = 10_000n,
}: {
  actualAmountCents?: bigint;
  budgetImpactCents?: bigint;
  lowerItemImpacts?: Array<{
    itemId: Id<"wantItems">;
    name: string;
    lostCents: bigint;
    allocatedCentsAfter: bigint;
  }>;
  reserveUsedCents?: bigint;
} = {}) {
  return {
    actualAmountCents,
    reserveUsedCents,
    budgetImpactCents,
    lowerItemImpacts,
  };
}

function mountDialog(
  extraProps: {
    error?: string;
    isSubmitting?: boolean;
    preview?: ReturnType<typeof makePreview> | null;
    previewPending?: boolean;
  } = {},
) {
  return mount(PurchaseDialog, {
    props: {
      open: true,
      item: makeWant(),
      mode: "purchase",
      purchaseLocalDate: "2026-08-19",
      preview: makePreview(),
      ...extraProps,
    },
    attachTo: document.body,
  });
}

describe("WantsPurchaseDialog", () => {
  it.each([
    {
      name: "fully funded",
      preview: makePreview(),
      expected: ["Actual amount$100.00", "Reserve used$100.00", "General-budget impact$0.00"],
    },
    {
      name: "partially funded",
      preview: makePreview({
        actualAmountCents: 12_000n,
        reserveUsedCents: 10_000n,
        budgetImpactCents: 2_000n,
      }),
      expected: ["Actual amount$120.00", "Reserve used$100.00", "General-budget impact$20.00"],
    },
  ])("discloses a $name purchase breakdown", ({ preview, expected }) => {
    const wrapper = mountDialog({ preview });
    const breakdown = wrapper.get('[data-test="purchase-breakdown"]');

    expected.forEach((copy) => expect(breakdown.text()).toContain(copy));

    wrapper.unmount();
  });

  it("names progress taken from later Wants", () => {
    const wrapper = mountDialog({
      preview: makePreview({
        actualAmountCents: 12_000n,
        reserveUsedCents: 12_000n,
        lowerItemImpacts: [
          {
            itemId: "want-trip" as Id<"wantItems">,
            name: "Trip",
            lostCents: 2_000n,
            allocatedCentsAfter: 3_000n,
          },
        ],
      }),
    });

    const impact = wrapper.get('[data-test="lower-item-impacts"]');

    expect(impact.text()).toContain("Trip");
    expect(impact.text()).toContain("$20.00 progress used");
    expect(impact.text()).toContain("$30.00 remains allocated");

    wrapper.unmount();
  });

  it("requests a fresh preview when the amount changes and submits no preview authority", async () => {
    const wrapper = mountDialog();
    const input = wrapper.get<HTMLInputElement>('input[name="actualAmount"]');

    await input.setValue("120.00");

    expect(wrapper.emitted("request-preview")?.at(-1)?.[0]).toEqual({
      itemId: "want-camera",
      actualAmountCents: 12_000n,
    });
    expect(wrapper.find('[data-test="purchase-breakdown"]').exists()).toBe(false);

    await wrapper.get("form").trigger("submit");

    expect(wrapper.emitted("submit")?.at(-1)?.[0]).toEqual({
      itemId: "want-camera",
      actualAmountCents: 12_000n,
      purchaseLocalDate: "2026-08-19",
    });

    wrapper.unmount();
  });

  it("announces preview, mutation-pending, and mutation-error states", () => {
    const previewPending = mountDialog({
      preview: null,
      previewPending: true,
    });

    expect(previewPending.get('[role="status"]').text()).toContain("Refreshing purchase breakdown");
    expect(previewPending.get('button[type="submit"]').attributes("disabled")).toBeDefined();
    previewPending.unmount();

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

describe("WantsBoughtList", () => {
  function mountHistory() {
    return mount(BoughtList, {
      props: {
        items: [makeWant("bought")],
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
      _id: "want-camera",
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

    expect(wrapper.emitted("undo")?.[0]?.[0]).toBe("want-camera");
  });

  it("never exposes generic expense edit or delete actions", () => {
    const wrapper = mountHistory();

    expect(wrapper.find('button[aria-label="Edit Camera"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Delete Camera"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Edit expense");
    expect(wrapper.text()).not.toContain("Delete expense");
  });
});
