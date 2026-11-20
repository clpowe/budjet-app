import { describe, expect, it } from "vite-plus/test";
import {
  calculateSavings,
  calculateSavingsHistory,
  type SavingsInputs,
} from "../../shared/utils/savings";

const noSpendingToday = { totalSpentCents: 0n, spentFromSavingsCents: 0n };

function inputs(overrides: Partial<SavingsInputs> = {}): SavingsInputs {
  return {
    allowanceCents: 5_000n,
    firstEligibleLocalDate: "2026-03-01",
    todayLocalDate: "2026-03-04",
    closedSpentCents: 0n,
    today: noSpendingToday,
    ...overrides,
  };
}

describe("calculateSavings", () => {
  it("matches the worked example: 3 closed days, $125 spent, $8 over today -> $17 available", () => {
    // 3 x $50 = $150 earned. $125 spent on closed days ($110 budget + $15 savings) -> $25.
    // Today is $58 of budget spending against a $50 allowance -> $8 over.
    const result = calculateSavings(
      inputs({
        closedSpentCents: 12_500n,
        today: { totalSpentCents: 5_800n, spentFromSavingsCents: 0n },
      }),
    );

    expect(result.eligibleClosedDays).toBe(3);
    expect(result.closedPositionCents).toBe(2_500n);
    expect(result.todayOverageAdjustmentCents).toBe(-800n);
    expect(result.positionCents).toBe(2_500n);
    expect(result.availableCents).toBe(1_700n);
    expect(result.shortfallCents).toBe(0n);
  });

  it("credits the full allowance for no-spend days", () => {
    const result = calculateSavings(inputs());

    expect(result.eligibleClosedDays).toBe(3);
    expect(result.positionCents).toBe(15_000n);
    expect(result.availableCents).toBe(15_000n);
    expect(result.projectedEndOfDayContributionCents).toBe(5_000n);
  });

  it("lets an overspent closed day pull savings below zero and reports a shortfall", () => {
    const result = calculateSavings(
      inputs({ firstEligibleLocalDate: "2026-03-03", closedSpentCents: 7_000n }),
    );

    expect(result.eligibleClosedDays).toBe(1);
    expect(result.positionCents).toBe(-2_000n);
    expect(result.availableCents).toBe(0n);
    expect(result.shortfallCents).toBe(2_000n);
  });

  it("deducts savings spent today immediately but credits unused allowance only at close", () => {
    // $50 purchase: $30 from savings, $20 against today's budget.
    const result = calculateSavings(
      inputs({ today: { totalSpentCents: 5_000n, spentFromSavingsCents: 3_000n } }),
    );

    expect(result.positionCents).toBe(12_000n);
    expect(result.todayOverageAdjustmentCents).toBe(0n);
    expect(result.projectedEndOfDayContributionCents).toBe(3_000n);
    expect(result.availableCents).toBe(12_000n);
  });

  it("combines savings used today with an overage", () => {
    // $100 spent today: $40 from savings, $60 against a $50 budget -> $10 over.
    const result = calculateSavings(
      inputs({ today: { totalSpentCents: 10_000n, spentFromSavingsCents: 4_000n } }),
    );

    expect(result.positionCents).toBe(11_000n);
    expect(result.todayOverageAdjustmentCents).toBe(-1_000n);
    expect(result.availableCents).toBe(10_000n);
    expect(result.projectedEndOfDayContributionCents).toBe(0n);
  });

  it("earns nothing on the activation day or before savings are active", () => {
    expect(calculateSavings(inputs({ firstEligibleLocalDate: "2026-03-04" })).positionCents).toBe(
      0n,
    );
    expect(
      calculateSavings(inputs({ firstEligibleLocalDate: "2026-03-05" })).eligibleClosedDays,
    ).toBe(0);
    expect(calculateSavings(inputs({ firstEligibleLocalDate: undefined })).positionCents).toBe(0n);
  });

  it("reports a shortfall for today's overage even before savings start", () => {
    const result = calculateSavings(
      inputs({
        firstEligibleLocalDate: undefined,
        today: { totalSpentCents: 6_000n, spentFromSavingsCents: 0n },
      }),
    );

    expect(result.availableCents).toBe(0n);
    expect(result.shortfallCents).toBe(1_000n);
  });

  it("rejects impossible inputs", () => {
    expect(() => calculateSavings(inputs({ closedSpentCents: -1n }))).toThrow(
      "must not be negative",
    );
    expect(() => calculateSavings(inputs({ allowanceCents: -1n }))).toThrow("must not be negative");
    expect(() =>
      calculateSavings(
        inputs({ today: { totalSpentCents: 1_000n, spentFromSavingsCents: 2_000n } }),
      ),
    ).toThrow("cannot exceed");
  });
});

describe("calculateSavingsHistory", () => {
  const base = {
    allowanceCents: 2_500n,
    firstEligibleLocalDate: "2026-03-07",
    todayLocalDate: "2026-03-10",
    startLocalDate: "2026-03-07",
    spentBeforeStartCents: 0n,
  };

  it("reports the balance at the end of each closed day, excluding today", () => {
    const points = calculateSavingsHistory({
      ...base,
      dailySpentCents: new Map([
        ["2026-03-07", 1_000n],
        ["2026-03-08", 4_000n],
        ["2026-03-10", 9_999n],
      ]),
    });

    expect(points).toEqual([
      { localDate: "2026-03-07", balanceCents: 1_500n },
      { localDate: "2026-03-08", balanceCents: 0n },
      { localDate: "2026-03-09", balanceCents: 2_500n },
    ]);
  });

  it("goes below zero when a day overspends", () => {
    const points = calculateSavingsHistory({
      ...base,
      todayLocalDate: "2026-03-08",
      dailySpentCents: new Map([["2026-03-07", 4_000n]]),
    });

    expect(points).toEqual([{ localDate: "2026-03-07", balanceCents: -1_500n }]);
  });

  it("agrees with calculateSavings for the last closed day", () => {
    const dailySpentCents = new Map([
      ["2026-03-07", 700n],
      ["2026-03-09", 3_100n],
    ]);
    const last = calculateSavingsHistory({ ...base, dailySpentCents }).at(-1);
    const live = calculateSavings({
      allowanceCents: base.allowanceCents,
      firstEligibleLocalDate: base.firstEligibleLocalDate,
      todayLocalDate: base.todayLocalDate,
      closedSpentCents: 3_800n,
      today: { totalSpentCents: 0n, spentFromSavingsCents: 0n },
    });

    expect(last?.balanceCents).toBe(live.positionCents);
  });

  it("starts at savings start and carries spending from before the window", () => {
    const points = calculateSavingsHistory({
      ...base,
      firstEligibleLocalDate: "2026-03-01",
      startLocalDate: "2026-03-08",
      spentBeforeStartCents: 10_000n,
      dailySpentCents: new Map(),
    });

    // Mar 1-7 earned 7 x $25 = $175, minus $100 spent before the window.
    expect(points[0]).toEqual({ localDate: "2026-03-08", balanceCents: 10_000n });
    expect(points.map((point) => point.localDate)).toEqual(["2026-03-08", "2026-03-09"]);
  });

  it("skips window days before savings started", () => {
    const points = calculateSavingsHistory({
      ...base,
      firstEligibleLocalDate: "2026-03-09",
      startLocalDate: "2026-03-01",
      dailySpentCents: new Map(),
    });

    expect(points).toEqual([{ localDate: "2026-03-09", balanceCents: 2_500n }]);
  });

  it("returns nothing before savings start or with no closed days", () => {
    expect(
      calculateSavingsHistory({
        ...base,
        firstEligibleLocalDate: undefined,
        dailySpentCents: new Map(),
      }),
    ).toEqual([]);
    expect(
      calculateSavingsHistory({
        ...base,
        firstEligibleLocalDate: "2026-03-10",
        dailySpentCents: new Map(),
      }),
    ).toEqual([]);
  });
});
