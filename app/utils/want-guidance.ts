export type WantGuidance =
  | { kind: "ready" }
  | { kind: "recovery"; amountCents: bigint }
  | { kind: "negative_today"; amountCents: bigint }
  | { kind: "target"; dailyCents: bigint; targetLocalDate: string }
  | {
      kind: "pace";
      dailyCents: bigint;
      daysToReady: number;
      readyLocalDate: string;
    }
  | { kind: "starter" };

export type WantGuidanceInput = {
  remainingCents: bigint;
  todayLocalDate: string;
  targetLocalDate?: string;
  recentDailyPaceCents: bigint;
  recoveryAmountCents: bigint;
  liveNegativeAdjustmentCents: bigint;
};

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function localDateToTimestamp(localDate: string): number {
  if (!LOCAL_DATE_PATTERN.test(localDate)) {
    throw new Error("Local dates must use YYYY-MM-DD format");
  }

  const timestamp = Date.parse(`${localDate}T00:00:00.000Z`);

  if (Number.isNaN(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== localDate) {
    throw new Error("Local date is invalid");
  }

  return timestamp;
}

function dayDistance(fromLocalDate: string, toLocalDate: string): number {
  return Math.round(
    (localDateToTimestamp(toLocalDate) - localDateToTimestamp(fromLocalDate)) / 86_400_000,
  );
}

function addLocalDays(localDate: string, days: number): string {
  const date = new Date(localDateToTimestamp(localDate));
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function ceilDivide(dividend: bigint, divisor: bigint): bigint {
  return (dividend + divisor - 1n) / divisor;
}

export function getWantGuidance({
  remainingCents,
  todayLocalDate,
  targetLocalDate,
  recentDailyPaceCents,
  recoveryAmountCents,
  liveNegativeAdjustmentCents,
}: WantGuidanceInput): WantGuidance {
  if (recoveryAmountCents > 0n) {
    return {
      kind: "recovery",
      amountCents: recoveryAmountCents,
    };
  }

  if (remainingCents <= 0n) {
    return { kind: "ready" };
  }

  if (liveNegativeAdjustmentCents < 0n) {
    return {
      kind: "negative_today",
      amountCents: -liveNegativeAdjustmentCents,
    };
  }

  if (targetLocalDate) {
    const daysUntilTarget = dayDistance(todayLocalDate, targetLocalDate);

    return {
      kind: "target",
      dailyCents:
        daysUntilTarget > 0 ? ceilDivide(remainingCents, BigInt(daysUntilTarget)) : remainingCents,
      targetLocalDate,
    };
  }

  if (recentDailyPaceCents <= 0n) {
    return { kind: "starter" };
  }

  const daysToReady = Number(ceilDivide(remainingCents, recentDailyPaceCents));

  if (!Number.isSafeInteger(daysToReady)) {
    return { kind: "starter" };
  }

  return {
    kind: "pace",
    dailyCents: recentDailyPaceCents,
    daysToReady,
    readyLocalDate: addLocalDays(todayLocalDate, daysToReady),
  };
}
