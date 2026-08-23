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
  todayOverageAdjustmentCents: bigint;
};

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function localDateToTimestamp(localDate: string): number | undefined {
  if (!LOCAL_DATE_PATTERN.test(localDate)) {
    return undefined;
  }

  const timestamp = Date.parse(`${localDate}T00:00:00.000Z`);

  if (Number.isNaN(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== localDate) {
    return undefined;
  }

  return timestamp;
}

function dayDistance(fromLocalDate: string, toLocalDate: string): number | undefined {
  const fromTimestamp = localDateToTimestamp(fromLocalDate);
  const toTimestamp = localDateToTimestamp(toLocalDate);

  if (fromTimestamp === undefined || toTimestamp === undefined) return undefined;

  return Math.round((toTimestamp - fromTimestamp) / 86_400_000);
}

function addLocalDays(localDate: string, days: number): string | undefined {
  const timestamp = localDateToTimestamp(localDate);

  if (timestamp === undefined) return undefined;

  const date = new Date(timestamp);
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
  todayOverageAdjustmentCents,
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

  if (todayOverageAdjustmentCents < 0n) {
    return {
      kind: "negative_today",
      amountCents: -todayOverageAdjustmentCents,
    };
  }

  if (targetLocalDate) {
    const daysUntilTarget = dayDistance(todayLocalDate, targetLocalDate);

    if (daysUntilTarget !== undefined) {
      return {
        kind: "target",
        dailyCents:
          daysUntilTarget > 0
            ? ceilDivide(remainingCents, BigInt(daysUntilTarget))
            : remainingCents,
        targetLocalDate,
      };
    }
  }

  if (recentDailyPaceCents <= 0n) {
    return { kind: "starter" };
  }

  const daysToReady = Number(ceilDivide(remainingCents, recentDailyPaceCents));

  if (!Number.isSafeInteger(daysToReady)) {
    return { kind: "starter" };
  }

  const readyLocalDate = addLocalDays(todayLocalDate, daysToReady);

  if (readyLocalDate === undefined) {
    return { kind: "starter" };
  }

  return {
    kind: "pace",
    dailyCents: recentDailyPaceCents,
    daysToReady,
    readyLocalDate,
  };
}
