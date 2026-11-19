import { format, tzDate } from "@formkit/tempo";

export const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function assertValidTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
  } catch {
    throw new Error("Invalid time zone");
  }
}

function parseLocalDate(localDate: string): Date {
  const match = LOCAL_DATE_PATTERN.exec(localDate);

  if (!match) {
    throw new Error("Local date must use YYYY-MM-DD format");
  }

  const date = new Date(`${localDate}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== localDate) {
    throw new Error("Local date is invalid");
  }

  return date;
}

export function getLocalDateKey(timestamp: number, timeZone: string): string {
  if (!Number.isFinite(timestamp)) {
    throw new Error("Timestamp must be finite");
  }

  assertValidTimeZone(timeZone);

  return format({
    date: new Date(timestamp),
    format: "YYYY-MM-DD",
    tz: timeZone,
  });
}

export function getNextLocalDate(localDate: string, timeZone: string): string {
  assertValidTimeZone(timeZone);

  const date = parseLocalDate(localDate);
  date.setUTCDate(date.getUTCDate() + 1);

  return date.toISOString().slice(0, 10);
}

export function getNextMonthStart(localDate: string): string {
  const date = parseLocalDate(localDate);
  date.setUTCMonth(date.getUTCMonth() + 1, 1);
  return date.toISOString().slice(0, 10);
}

/** Whole calendar days from `startInclusive` to `endExclusive`; 0 when the range is empty or reversed. */
export function countLocalDays(startInclusive: string, endExclusive: string): number {
  const days =
    (parseLocalDate(endExclusive).getTime() - parseLocalDate(startInclusive).getTime()) /
    86_400_000;

  return days > 0 ? days : 0;
}

export interface LocalMonthPeriod {
  localMonth: string;
  startLocalDate: string;
  toDateEndExclusiveLocalDate: string;
  currentLocalDate: string;
  elapsedDays: number;
}

export function getLocalMonthPeriod(asOfTimestamp: number, timeZone: string): LocalMonthPeriod {
  const currentLocalDate = getLocalDateKey(asOfTimestamp, timeZone);
  const localMonth = currentLocalDate.slice(0, 7);

  return {
    localMonth,
    startLocalDate: `${localMonth}-01`,
    toDateEndExclusiveLocalDate: getNextLocalDate(currentLocalDate, timeZone),
    currentLocalDate,
    elapsedDays: Number(currentLocalDate.slice(8, 10)),
  };
}

export function getLocalDayBounds(
  localDate: string,
  timeZone: string,
): { startTimestamp: number; endExclusiveTimestamp: number } {
  assertValidTimeZone(timeZone);

  const startLocalDate = parseLocalDate(localDate).toISOString().slice(0, 10);
  const endLocalDate = getNextLocalDate(startLocalDate, timeZone);

  return {
    startTimestamp: tzDate(`${startLocalDate}T00:00:00`, timeZone).getTime(),
    endExclusiveTimestamp: tzDate(`${endLocalDate}T00:00:00`, timeZone).getTime(),
  };
}
