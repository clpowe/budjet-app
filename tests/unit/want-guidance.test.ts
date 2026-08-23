import { describe, expect, it } from "vite-plus/test";
import { getWantGuidance } from "../../app/utils/want-guidance";

describe("getWantGuidance", () => {
  const todayLocalDate = "2026-08-19";

  it("calculates the daily amount needed to meet a future target", () => {
    expect(
      getWantGuidance({
        remainingCents: 10_000n,
        targetLocalDate: "2026-08-29",
        todayLocalDate,
        recentDailyPaceCents: 0n,
        recoveryAmountCents: 0n,
        todayOverageAdjustmentCents: 0n,
      }),
    ).toEqual({
      kind: "target",
      dailyCents: 1_000n,
      targetLocalDate: "2026-08-29",
    });
  });

  it("uses recent positive pace to estimate a ready date", () => {
    expect(
      getWantGuidance({
        remainingCents: 10_000n,
        todayLocalDate,
        recentDailyPaceCents: 1_250n,
        recoveryAmountCents: 0n,
        todayOverageAdjustmentCents: 0n,
      }),
    ).toEqual({
      kind: "pace",
      dailyCents: 1_250n,
      daysToReady: 8,
      readyLocalDate: "2026-08-27",
    });
  });

  it("keeps the forecast constructive when there is not enough positive history", () => {
    expect(
      getWantGuidance({
        remainingCents: 10_000n,
        todayLocalDate,
        recentDailyPaceCents: 0n,
        recoveryAmountCents: 0n,
        todayOverageAdjustmentCents: 0n,
      }),
    ).toEqual({ kind: "starter" });
  });

  it("identifies a fully funded Want before calculating forecasts", () => {
    expect(
      getWantGuidance({
        remainingCents: 0n,
        todayLocalDate,
        recentDailyPaceCents: 1_250n,
        recoveryAmountCents: 0n,
        todayOverageAdjustmentCents: 0n,
      }),
    ).toEqual({ kind: "ready" });
  });

  it("surfaces today's negative reserve movement without treating it as a forecast", () => {
    expect(
      getWantGuidance({
        remainingCents: 10_000n,
        todayLocalDate,
        recentDailyPaceCents: 1_250n,
        recoveryAmountCents: 0n,
        todayOverageAdjustmentCents: -350n,
      }),
    ).toEqual({
      kind: "negative_today",
      amountCents: 350n,
    });
  });

  it("prioritizes reserve recovery over a new funding forecast", () => {
    expect(
      getWantGuidance({
        remainingCents: 10_000n,
        targetLocalDate: "2026-08-29",
        todayLocalDate,
        recentDailyPaceCents: 1_250n,
        recoveryAmountCents: 500n,
        todayOverageAdjustmentCents: -500n,
      }),
    ).toEqual({
      kind: "recovery",
      amountCents: 500n,
    });
  });

  it("falls back to a pace forecast when a persisted target is not a local date", () => {
    expect(
      getWantGuidance({
        remainingCents: 10_000n,
        targetLocalDate: "2026-08-29T12:00:00.000Z",
        todayLocalDate,
        recentDailyPaceCents: 1_250n,
        recoveryAmountCents: 0n,
        todayOverageAdjustmentCents: 0n,
      }),
    ).toEqual({
      kind: "pace",
      dailyCents: 1_250n,
      daysToReady: 8,
      readyLocalDate: "2026-08-27",
    });
  });

  it("returns starter guidance instead of throwing for an invalid current local date", () => {
    expect(
      getWantGuidance({
        remainingCents: 10_000n,
        todayLocalDate: "August 19, 2026",
        recentDailyPaceCents: 1_250n,
        recoveryAmountCents: 0n,
        todayOverageAdjustmentCents: 0n,
      }),
    ).toEqual({ kind: "starter" });
  });
});
