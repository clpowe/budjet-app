import { describe, expect, it } from "vite-plus/test";
import type { Id } from "../../convex/_generated/dataModel";
import { getDebtOrderUpdates, sumDebtPayments } from "../../convex/debts";

function debtId(id: string) {
  return id as Id<"debts">;
}

describe("sumDebtPayments", () => {
  it("sums every household debt payment, including debts outside the priority list", () => {
    expect(
      sumDebtPayments([
        { isPriority: false, paymentCents: 35_000n },
        { isPriority: false, paymentCents: 50_000n },
        { isPriority: true, paymentCents: 20_000n },
      ]),
    ).toBe(105_000n);
  });
});

describe("getDebtOrderUpdates", () => {
  it("normalizes a complete household order to consecutive positions", () => {
    expect(
      getDebtOrderUpdates(
        [debtId("debt-1"), debtId("debt-2"), debtId("debt-3")],
        [debtId("debt-3"), debtId("debt-1"), debtId("debt-2")],
      ),
    ).toEqual([
      { id: "debt-3", order: 0 },
      { id: "debt-1", order: 1 },
      { id: "debt-2", order: 2 },
    ]);
  });

  it("rejects duplicate, missing, and out-of-household ids", () => {
    const currentIds = [debtId("debt-1"), debtId("debt-2")];

    expect(() => getDebtOrderUpdates(currentIds, [debtId("debt-1"), debtId("debt-1")])).toThrow(
      "duplicate",
    );
    expect(() => getDebtOrderUpdates(currentIds, [debtId("debt-1")])).toThrow("Debt list changed");
    expect(() =>
      getDebtOrderUpdates(currentIds, [debtId("debt-1"), debtId("other-household-debt")]),
    ).toThrow("invalid item");
  });
});
