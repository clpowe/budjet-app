import { describe, expect, it } from "vite-plus/test";
import {
  allocateSavings,
  calculatePurchaseFunding,
  getBudgetImpact,
} from "../../convex/lib/want_savings";

describe("allocateSavings", () => {
  it("funds active items in queue order", () => {
    expect(
      allocateSavings(15_000n, [
        { id: "camera", estimatedCostCents: 10_000n },
        { id: "trip", estimatedCostCents: 8_000n },
      ]),
    ).toEqual([
      { id: "camera", allocatedCents: 10_000n, remainingCents: 0n },
      { id: "trip", allocatedCents: 5_000n, remainingCents: 3_000n },
    ]);
  });

  it("never allocates a negative savings position", () => {
    expect(allocateSavings(-1_200n, [{ id: "camera", estimatedCostCents: 10_000n }])).toEqual([
      { id: "camera", allocatedCents: 0n, remainingCents: 10_000n },
    ]);
  });

  it("rejects invalid costs and duplicate queue IDs", () => {
    expect(() => allocateSavings(100n, [{ id: "camera", estimatedCostCents: 0n }])).toThrow();

    expect(() =>
      allocateSavings(100n, [
        { id: "camera", estimatedCostCents: 50n },
        { id: "camera", estimatedCostCents: 50n },
      ]),
    ).toThrow();
  });

  it("preserves every cent over hundreds of allocations", () => {
    const items = Array.from({ length: 250 }, (_, index) => ({
      id: `item-${index}`,
      estimatedCostCents: 1n,
    }));

    for (let position = 0n; position <= 250n; position += 1n) {
      const totalAllocated = allocateSavings(position, items).reduce(
        (sum, allocation) => sum + allocation.allocatedCents,
        0n,
      );

      expect(totalAllocated).toBe(position);
    }
  });
});

describe("purchase funding", () => {
  it("uses available savings before impacting the ordinary budget", () => {
    expect(calculatePurchaseFunding(12_000n, 10_000n)).toEqual({
      savingsUsedCents: 10_000n,
      budgetImpactCents: 2_000n,
    });

    expect(calculatePurchaseFunding(12_000n, 15_000n)).toEqual({
      savingsUsedCents: 12_000n,
      budgetImpactCents: 0n,
    });

    expect(calculatePurchaseFunding(12_000n, 0n)).toEqual({
      savingsUsedCents: 0n,
      budgetImpactCents: 12_000n,
    });
  });

  it("derives the ordinary-budget impact exactly", () => {
    expect(getBudgetImpact(12_000n, 10_000n)).toBe(2_000n);
    expect(() => getBudgetImpact(1_000n, 1_001n)).toThrow();
    expect(() => calculatePurchaseFunding(0n, 0n)).toThrow();
  });
});
