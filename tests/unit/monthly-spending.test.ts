import { describe, expect, it } from "vite-plus/test";
import { buildMonthlySpendingRows } from "../../app/utils/monthly-spending";

describe("buildMonthlySpendingRows", () => {
  it("builds cumulative spend and budget rows through the current day", () => {
    const rows = buildMonthlySpendingRows(
      [
        { amount: 15, date: new Date(2026, 7, 1, 12).getTime() },
        { amount: 10, date: new Date(2026, 7, 3, 12).getTime() },
        { amount: 5, date: new Date(2026, 7, 3, 18).getTime() },
      ],
      new Date(2026, 7, 3, 20),
      50,
    );

    expect(rows).toHaveLength(31);
    expect(rows.slice(0, 4).map(({ budget, day, spent }) => ({ budget, day, spent }))).toEqual([
      { budget: 50, day: 1, spent: 15 },
      { budget: 100, day: 2, spent: 15 },
      { budget: 150, day: 3, spent: 30 },
      { budget: 200, day: 4, spent: null },
    ]);
  });

  it("ignores expenses outside the selected month and invalid amounts", () => {
    const rows = buildMonthlySpendingRows(
      [
        { amount: 99, date: new Date(2026, 6, 31, 12).getTime() },
        { amount: Number.NaN, date: new Date(2026, 7, 1, 12).getTime() },
      ],
      new Date(2026, 7, 1, 20),
      Number.NaN,
    );

    expect(rows[0]).toMatchObject({ budget: 0, spent: 0 });
  });
});
