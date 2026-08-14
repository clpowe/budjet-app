export type Cents = bigint;

export interface ParseMoneyOptions {
  allowNegative?: boolean;
}

const MAX_INT64_CENTS = 9_223_372_036_854_775_807n;
const MIN_INT64_CENTS = -9_223_372_036_854_775_808n;
const NORMALIZED_MONEY_PATTERN = /^(-?)(0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

function assertInt64Cents(cents: Cents): Cents {
  if (cents < MIN_INT64_CENTS || cents > MAX_INT64_CENTS) {
    throw new RangeError("Amount is outside the signed 64-bit cent range");
  }

  return cents;
}

export function parseMoneyToCents(
  value: string,
  { allowNegative = false }: ParseMoneyOptions = {},
): Cents {
  const match = NORMALIZED_MONEY_PATTERN.exec(value);

  if (!match) {
    throw new Error("Enter a normalized dollar amount with no more than two decimal places");
  }

  const [, sign = "", wholeDollars, fractionalDollars = ""] = match;

  if (wholeDollars === undefined) {
    throw new Error("Money amount is missing whole dollars");
  }

  if (sign === "-" && !allowNegative) {
    throw new Error("Amount must not be negative");
  }

  const fractionCents = `${fractionalDollars}00`.slice(0, 2);
  const absoluteCents = BigInt(wholeDollars) * 100n + BigInt(fractionCents);
  const cents = sign === "-" ? -absoluteCents : absoluteCents;

  return assertInt64Cents(cents);
}

export function legacyDollarsToCents(value: number): Cents {
  if (!Number.isFinite(value)) {
    throw new Error("Legacy dollar amount must be finite");
  }

  const roundedCents = Math.round(value * 100);

  if (!Number.isSafeInteger(roundedCents)) {
    throw new RangeError("Legacy dollar amount is outside the exact cent range");
  }

  return assertInt64Cents(BigInt(roundedCents));
}

export function formatCents(cents: Cents): string {
  assertInt64Cents(cents);

  const isNegative = cents < 0n;
  const absoluteCents = isNegative ? -cents : cents;
  const wholeDollars = absoluteCents / 100n;
  const fractionalCents = (absoluteCents % 100n).toString().padStart(2, "0");
  const formattedDollars = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(wholeDollars);

  return `${isNegative ? "-" : ""}$${formattedDollars}.${fractionalCents}`;
}
