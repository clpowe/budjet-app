import { Temporal } from "./temporal";

export const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function assertValidTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
  } catch {
    throw new Error("Invalid time zone");
  }
}

function parseLocalDate(localDate: string): Temporal.PlainDate {
  if (!LOCAL_DATE_PATTERN.test(localDate)) {
    throw new Error("Local date must use YYYY-MM-DD format");
  }

  try {
    return Temporal.PlainDate.from(localDate, { overflow: "reject" });
  } catch {
    throw new Error("Local date is invalid");
  }
}

export function getLocalDateKey(timestamp: number, timeZone: string): string {
  if (!Number.isFinite(timestamp)) {
    throw new Error("Timestamp must be finite");
  }

  assertValidTimeZone(timeZone);

  return Temporal.Instant.fromEpochMilliseconds(timestamp)
    .toZonedDateTimeISO(timeZone)
    .toPlainDate()
    .toString();
}

export function getNextLocalDate(localDate: string, timeZone: string): string {
  assertValidTimeZone(timeZone);

  return parseLocalDate(localDate).add({ days: 1 }).toString();
}

export function getNextMonthStart(localDate: string): string {
  return parseLocalDate(localDate).with({ day: 1 }).add({ months: 1 }).toString();
}

/** Calendar arithmetic on `YYYY-MM-DD`; time zones do not apply. */
export function addLocalDays(localDate: string, days: number): string {
  if (!Number.isInteger(days)) {
    throw new Error("Days must be a whole number");
  }

  return parseLocalDate(localDate).add({ days }).toString();
}

/** Whole calendar days from `startInclusive` to `endExclusive`; 0 when the range is empty or reversed. */
export function countLocalDays(startInclusive: string, endExclusive: string): number {
  const days = parseLocalDate(startInclusive).until(parseLocalDate(endExclusive), {
    largestUnit: "days",
  }).days;

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

/** Start of the local day and start of the next one; DST days are 23 or 25 hours long. */
export function getLocalDayBounds(
  localDate: string,
  timeZone: string,
): { startTimestamp: number; endExclusiveTimestamp: number } {
  assertValidTimeZone(timeZone);

  const day = parseLocalDate(localDate);

  return {
    startTimestamp: day.toZonedDateTime({ timeZone }).epochMilliseconds,
    endExclusiveTimestamp: day.add({ days: 1 }).toZonedDateTime({ timeZone }).epochMilliseconds,
  };
}

/** Moves a moment by whole months in `timeZone`, keeping the wall-clock time; clamps the day. */
export function addMonthsInTimeZone(timestamp: number, months: number, timeZone: string): number {
  assertValidTimeZone(timeZone);

  return Temporal.Instant.fromEpochMilliseconds(timestamp)
    .toZonedDateTimeISO(timeZone)
    .add({ months })
    .toInstant().epochMilliseconds;
}

/** Formats a `YYYY-MM-DD` date as a calendar date, independent of any time zone. */
export function formatLocalDate(localDate: string, options: Intl.DateTimeFormatOptions): string {
  parseLocalDate(localDate);

  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(
    new Date(`${localDate}T00:00:00Z`),
  );
}
