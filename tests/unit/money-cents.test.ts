import { describe, expect, it } from "vite-plus/test";
import {
  formatCents,
  legacyDollarsToCents,
  parseMoneyToCents,
} from "../../shared/utils/money-cents";

describe("money cents", () => {
  it("parses normalized decimal strings exactly", () => {
    expect(parseMoneyToCents("140.05")).toBe(14_005n);
    expect(parseMoneyToCents("0")).toBe(0n);
    expect(parseMoneyToCents("0.1")).toBe(10n);
    expect(parseMoneyToCents("999999.99")).toBe(99_999_999n);
  });

  it("rejects non-normalized, negative, and out-of-range input by default", () => {
    for (const value of [
      "",
      " 12.00",
      "12.00 ",
      "$12.00",
      ".50",
      "12.",
      "01.00",
      "1e2",
      "NaN",
      "Infinity",
      "-12.00",
      "12.345",
      "92233720368547758.08",
    ]) {
      expect(() => parseMoneyToCents(value)).toThrow();
    }
  });

  it("allows signed values only when explicitly requested", () => {
    expect(parseMoneyToCents("-12.34", { allowNegative: true })).toBe(-1_234n);
    expect(parseMoneyToCents("-92233720368547758.08", { allowNegative: true })).toBe(
      -9_223_372_036_854_775_808n,
    );
  });

  it("formats cents without converting them to floating-point dollars", () => {
    expect(formatCents(14_005n)).toBe("$140.05");
    expect(formatCents(1_234_567_890n)).toBe("$12,345,678.90");
    expect(formatCents(-42n)).toBe("-$0.42");
  });

  it("quantizes legacy floating-dollar values once", () => {
    expect(legacyDollarsToCents(0.1 + 0.2)).toBe(30n);
    expect(legacyDollarsToCents(-12.345)).toBe(-1_234n);
    expect(() => legacyDollarsToCents(Number.NaN)).toThrow();
    expect(() => legacyDollarsToCents(Number.POSITIVE_INFINITY)).toThrow();
  });
});
