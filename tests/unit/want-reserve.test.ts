import { describe, expect, it } from "vite-plus/test";
import {
  allocateReserve,
  calculatePurchaseFunding,
  getBudgetImpact,
  getLocalDateKey,
  getLocalDayBounds,
  getNextLocalDate,
} from "../../convex/lib/want_reserve";

describe("allocateReserve", () => {
  it("funds active items in queue order", () => {
    expect(
      allocateReserve(15_000n, [
        { id: "camera", estimatedCostCents: 10_000n },
        { id: "trip", estimatedCostCents: 8_000n },
      ]),
    ).toEqual([
      { id: "camera", allocatedCents: 10_000n, remainingCents: 0n },
      { id: "trip", allocatedCents: 5_000n, remainingCents: 3_000n },
    ]);
  });

  it("never allocates a negative reserve position", () => {
    expect(allocateReserve(-1_200n, [{ id: "camera", estimatedCostCents: 10_000n }])).toEqual([
      { id: "camera", allocatedCents: 0n, remainingCents: 10_000n },
    ]);
  });

  it("rejects invalid costs and duplicate queue IDs", () => {
    expect(() => allocateReserve(100n, [{ id: "camera", estimatedCostCents: 0n }])).toThrow();

    expect(() =>
      allocateReserve(100n, [
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
      const totalAllocated = allocateReserve(position, items).reduce(
        (sum, allocation) => sum + allocation.allocatedCents,
        0n,
      );

      expect(totalAllocated).toBe(position);
    }
  });
});

describe("purchase funding", () => {
  it("uses available reserve before impacting the ordinary budget", () => {
    expect(calculatePurchaseFunding(12_000n, 10_000n)).toEqual({
      reserveUsedCents: 10_000n,
      budgetImpactCents: 2_000n,
    });

    expect(calculatePurchaseFunding(12_000n, 15_000n)).toEqual({
      reserveUsedCents: 12_000n,
      budgetImpactCents: 0n,
    });

    expect(calculatePurchaseFunding(12_000n, 0n)).toEqual({
      reserveUsedCents: 0n,
      budgetImpactCents: 12_000n,
    });
  });

  it("derives the ordinary-budget impact exactly", () => {
    expect(getBudgetImpact(12_000n, 10_000n)).toBe(2_000n);
    expect(() => getBudgetImpact(1_000n, 1_001n)).toThrow();
    expect(() => calculatePurchaseFunding(0n, 0n)).toThrow();
  });
});

describe("household-local dates and forecasting", () => {
  const timeZone = "America/New_York";

  it("uses the correct local day around New York DST boundaries", () => {
    expect(getLocalDateKey(Date.UTC(2026, 2, 8, 4, 59), timeZone)).toBe("2026-03-07");
    expect(getLocalDateKey(Date.UTC(2026, 2, 8, 5), timeZone)).toBe("2026-03-08");

    const springForward = getLocalDayBounds("2026-03-08", timeZone);
    expect(springForward.endExclusiveTimestamp - springForward.startTimestamp).toBe(
      23 * 60 * 60 * 1_000,
    );

    const fallBack = getLocalDayBounds("2026-11-01", timeZone);
    expect(fallBack.endExclusiveTimestamp - fallBack.startTimestamp).toBe(25 * 60 * 60 * 1_000);
  });

  it("selects the first full local day after activation", () => {
    expect(getNextLocalDate("2026-03-08", timeZone)).toBe("2026-03-09");
    expect(getNextLocalDate("2026-11-01", timeZone)).toBe("2026-11-02");
  });
});
