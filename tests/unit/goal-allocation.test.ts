import { describe, expect, it } from "vite-plus/test";
import {
  allocateSavings,
  calculatePurchaseFunding,
  previewPurchase,
} from "../../shared/utils/goal-allocation";
import { budgetImpact } from "../../shared/utils/savings";

const camera = { _id: "camera", name: "Camera", estimatedCostCents: 10_000n };
const trip = { _id: "trip", name: "Trip", estimatedCostCents: 8_000n };
const desk = { _id: "desk", name: "Desk", estimatedCostCents: 6_000n };

describe("allocateSavings", () => {
  it("funds goals in order and keeps each goal attached", () => {
    expect(allocateSavings(15_000n, [camera, trip])).toEqual([
      {
        goal: camera,
        allocatedCents: 10_000n,
        remainingCents: 0n,
        progressBasisPoints: 10_000,
      },
      {
        goal: trip,
        allocatedCents: 5_000n,
        remainingCents: 3_000n,
        progressBasisPoints: 6_250,
      },
    ]);
  });

  it("never allocates a negative amount", () => {
    expect(allocateSavings(-1_200n, [camera])).toEqual([
      { goal: camera, allocatedCents: 0n, remainingCents: 10_000n, progressBasisPoints: 0 },
    ]);
  });

  it("rejects a nonpositive cost", () => {
    expect(() => allocateSavings(100n, [{ _id: "x", estimatedCostCents: 0n }])).toThrow(
      "Estimated cost must be greater than zero",
    );
  });

  it("preserves every cent over hundreds of allocations", () => {
    const goals = Array.from({ length: 250 }, (_, index) => ({
      _id: `goal-${index}`,
      estimatedCostCents: 1n,
    }));

    for (let available = 0n; available <= 250n; available += 1n) {
      const total = allocateSavings(available, goals).reduce(
        (sum, allocation) => sum + allocation.allocatedCents,
        0n,
      );

      expect(total).toBe(available);
    }
  });
});

describe("calculatePurchaseFunding", () => {
  it("uses available savings before the daily budget", () => {
    expect(calculatePurchaseFunding(12_000n, 10_000n)).toEqual({
      fromSavingsCents: 10_000n,
      fromDailyBudgetCents: 2_000n,
    });
    expect(calculatePurchaseFunding(4_000n, 10_000n)).toEqual({
      fromSavingsCents: 4_000n,
      fromDailyBudgetCents: 0n,
    });
    expect(calculatePurchaseFunding(4_000n, 0n)).toEqual({
      fromSavingsCents: 0n,
      fromDailyBudgetCents: 4_000n,
    });
  });

  it("rejects a nonpositive amount or negative savings", () => {
    expect(() => calculatePurchaseFunding(0n, 100n)).toThrow("must be greater than zero");
    expect(() => calculatePurchaseFunding(100n, -1n)).toThrow("must not be negative");
  });
});

describe("previewPurchase", () => {
  it("compares by goal, not by position, when a middle goal is bought", () => {
    // Before: camera 10_000, trip 5_000, desk 0. Buying the trip for 9_000 leaves 6_000 for [camera, desk].
    const preview = previewPurchase(15_000n, [camera, trip, desk], "trip", 9_000n);

    expect(preview.funding).toEqual({ fromSavingsCents: 9_000n, fromDailyBudgetCents: 0n });
    expect(preview.losses).toEqual([
      { goal: camera, lostCents: 4_000n, allocatedCentsAfter: 6_000n },
    ]);
  });

  it("reports no loss when the purchase frees up money for later goals", () => {
    // Buying the camera for 4_000 leaves 11_000 for [trip, desk]; both gain or stay level.
    expect(previewPurchase(15_000n, [camera, trip, desk], "camera", 4_000n).losses).toEqual([]);
  });

  it("takes everything from earlier goals when the purchase uses all savings", () => {
    const preview = previewPurchase(15_000n, [camera, trip, desk], "trip", 20_000n);

    expect(preview.funding).toEqual({ fromSavingsCents: 15_000n, fromDailyBudgetCents: 5_000n });
    expect(preview.losses).toEqual([{ goal: camera, lostCents: 10_000n, allocatedCentsAfter: 0n }]);
  });

  it("reports no loss when there is no savings", () => {
    expect(previewPurchase(0n, [camera, trip], "camera", 5_000n).losses).toEqual([]);
  });

  it("rejects a goal that is not in the plan", () => {
    expect(() => previewPurchase(100n, [camera], "trip", 100n)).toThrow("not in the plan");
  });
});

describe("budgetImpact", () => {
  it("is total spent minus the part paid from savings", () => {
    expect(budgetImpact(5_000n, 3_000n)).toBe(2_000n);
    expect(budgetImpact(5_000n, 0n)).toBe(5_000n);
    expect(budgetImpact(0n, 0n)).toBe(0n);
  });

  it("rejects negative or excessive savings", () => {
    expect(() => budgetImpact(-1n, 0n)).toThrow("must not be negative");
    expect(() => budgetImpact(1_000n, -1n)).toThrow("must not be negative");
    expect(() => budgetImpact(1_000n, 2_000n)).toThrow("cannot exceed");
  });
});
