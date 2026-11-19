import { describe, expect, it } from "vite-plus/test";
import {
  buildMonthlySpendingRows,
  buildPreviousMonthSpendingRows,
} from "../../app/utils/monthly-spending";

describe("buildMonthlySpendingRows", () => {
  it("builds cumulative spend and budget rows through the current day", () => {
    const rows = buildMonthlySpendingRows(
      [
        { amountCents: 1_500n, localDate: "2026-08-01" },
        { amountCents: 1_000n, localDate: "2026-08-03" },
        { amountCents: 500n, localDate: "2026-08-03" },
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

  it("ignores expenses outside the selected month and an invalid budget", () => {
    const rows = buildMonthlySpendingRows(
      [{ amountCents: 9_900n, localDate: "2026-07-31" }],
      new Date(2026, 7, 1, 20),
      Number.NaN,
    );

    expect(rows[0]).toMatchObject({ budgetToDate: 0, spentToDate: 0 });
  });

  it("builds a full cumulative comparison for the previous month", () => {
    const rows = buildPreviousMonthSpendingRows(
      [
        { amountCents: 2_000n, localDate: "2026-07-01" },
        { amountCents: 1_500n, localDate: "2026-07-31" },
      ],
      new Date(2026, 7, 3, 20),
    );

    expect(rows).toHaveLength(31);
    expect(rows[0].spentToDate).toBe(20);
    expect(rows[2].spentToDate).toBe(20);
    expect(rows[30].spentToDate).toBe(35);
  });
});
