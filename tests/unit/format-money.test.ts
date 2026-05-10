import { describe, it, expect } from "vite-plus/test";
import { formatMoney } from "../../shared/utils/format-money";

describe("formatMoney", () => {
  it("formats whole dollars with trailing cents", () => {
    expect(formatMoney(10)).toBe("$10.00");
  });

  it("adds thousands separators and rounds to two decimals", () => {
    expect(formatMoney(1234.567)).toBe("$1,234.57");
  });

  it("prefixes negatives with a minus sign", () => {
    expect(formatMoney(-42.5)).toBe("-$42.50");
  });
});
