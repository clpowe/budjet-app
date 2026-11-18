import { describe, expect, it } from "vite-plus/test";
import {
  buildMonthlySpendingRows,
  buildPreviousMonthSpendingRows,
} from "../../app/utils/monthly-spending";

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
    expect(rows.slice(0, 4)).toMatchObject([
      { budgetToDate: 50, day: 1, spentToDate: 15 },
      { budgetToDate: 100, day: 2, spentToDate: 15 },
      { budgetToDate: 150, day: 3, spentToDate: 30 },
      { budgetToDate: 200, day: 4, spentToDate: null },
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

    expect(rows[0]).toMatchObject({ budgetToDate: 0, spentToDate: 0 });
  });

  it("builds a full cumulative comparison for the previous month", () => {
    const rows = buildPreviousMonthSpendingRows(
      [
        { amount: 20, date: new Date(2026, 6, 1, 12).getTime() },
        { amount: 15, date: new Date(2026, 6, 31, 12).getTime() },
      ],
      new Date(2026, 7, 3, 20),
    );

    expect(rows).toHaveLength(31);
    expect(rows[0].spentToDate).toBe(20);
    expect(rows[2].spentToDate).toBe(20);
    expect(rows[30].spentToDate).toBe(35);
  });
});
