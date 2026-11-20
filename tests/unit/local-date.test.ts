import { describe, expect, it } from "vite-plus/test";
import {
  addLocalDays,
  addMonthsInTimeZone,
  formatLocalDate,
  countLocalDays,
  getLocalDateKey,
  getLocalDayBounds,
  getLocalMonthPeriod,
  getNextLocalDate,
  getNextMonthStart,
} from "../../shared/utils/local-date";

const timeZone = "America/New_York";

describe("getLocalDateKey", () => {
  it("uses the correct local day around New York DST boundaries", () => {
    expect(getLocalDateKey(Date.UTC(2026, 2, 8, 4, 59), timeZone)).toBe("2026-03-07");
    expect(getLocalDateKey(Date.UTC(2026, 2, 8, 5), timeZone)).toBe("2026-03-08");
  });

  it("rejects a bad time zone or timestamp", () => {
    expect(() => getLocalDateKey(0, "Not/AZone")).toThrow("Invalid time zone");
    expect(() => getLocalDateKey(Number.NaN, timeZone)).toThrow("Timestamp must be finite");
  });
});

describe("getLocalDayBounds", () => {
  it("spans 23 and 25 hours on DST days", () => {
    const springForward = getLocalDayBounds("2026-03-08", timeZone);
    expect(springForward.endExclusiveTimestamp - springForward.startTimestamp).toBe(
      23 * 60 * 60 * 1_000,
    );

    const fallBack = getLocalDayBounds("2026-11-01", timeZone);
    expect(fallBack.endExclusiveTimestamp - fallBack.startTimestamp).toBe(25 * 60 * 60 * 1_000);
  });
});

describe("getNextLocalDate", () => {
  it("advances across DST and month and year ends", () => {
    expect(getNextLocalDate("2026-03-08", timeZone)).toBe("2026-03-09");
    expect(getNextLocalDate("2026-11-01", timeZone)).toBe("2026-11-02");
    expect(getNextLocalDate("2026-01-31", timeZone)).toBe("2026-02-01");
    expect(getNextLocalDate("2026-12-31", timeZone)).toBe("2027-01-01");
  });

  it("rejects malformed and impossible dates", () => {
    expect(() => getNextLocalDate("2026-3-8", timeZone)).toThrow("YYYY-MM-DD");
    expect(() => getNextLocalDate("2026-02-30", timeZone)).toThrow("invalid");
  });
});

describe("getNextMonthStart", () => {
  it("returns the first day of the following month", () => {
    expect(getNextMonthStart("2026-01-31")).toBe("2026-02-01");
    expect(getNextMonthStart("2026-12-15")).toBe("2027-01-01");
  });
});

describe("getLocalMonthPeriod", () => {
  it("describes the local month to date", () => {
    expect(getLocalMonthPeriod(Date.UTC(2026, 2, 10, 16), timeZone)).toEqual({
      localMonth: "2026-03",
      startLocalDate: "2026-03-01",
      toDateEndExclusiveLocalDate: "2026-03-11",
      currentLocalDate: "2026-03-10",
      elapsedDays: 10,
    });
  });
});

describe("countLocalDays", () => {
  it("counts whole days from start (inclusive) to end (exclusive)", () => {
    expect(countLocalDays("2026-01-31", "2026-02-03")).toBe(3);
    expect(countLocalDays("2026-02-27", "2026-03-02")).toBe(3);
    expect(countLocalDays("2026-03-07", "2026-03-10")).toBe(3);
  });

  it("is zero when the range is empty or reversed", () => {
    expect(countLocalDays("2026-03-10", "2026-03-10")).toBe(0);
    expect(countLocalDays("2026-03-11", "2026-03-10")).toBe(0);
  });
});

describe("addLocalDays", () => {
  it("moves across month, year and leap-day boundaries", () => {
    expect(addLocalDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addLocalDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addLocalDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addLocalDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addLocalDays("2026-03-10", 0)).toBe("2026-03-10");
  });

  it("rejects fractional days and invalid dates", () => {
    expect(() => addLocalDays("2026-03-10", 1.5)).toThrow("Days must be a whole number");
    expect(() => addLocalDays("2026-02-30", 1)).toThrow("Local date is invalid");
  });
});

describe("addMonthsInTimeZone", () => {
  it("keeps the household wall-clock time and clamps to the month's last day", () => {
    // Jan 31, 9:00 pm in New York is Feb 1 in UTC.
    const jan31Evening = Date.UTC(2026, 1, 1, 2);

    expect(addMonthsInTimeZone(jan31Evening, 1, timeZone)).toBe(Date.UTC(2026, 2, 1, 2));
    expect(getLocalDateKey(addMonthsInTimeZone(jan31Evening, 1, timeZone), timeZone)).toBe(
      "2026-02-28",
    );
    expect(getLocalDateKey(addMonthsInTimeZone(jan31Evening, -1, timeZone), timeZone)).toBe(
      "2025-12-31",
    );
  });

  it("crosses a DST change without shifting the local time", () => {
    const feb15Noon = Date.UTC(2026, 1, 15, 17);

    expect(addMonthsInTimeZone(feb15Noon, 1, timeZone)).toBe(Date.UTC(2026, 2, 15, 16));
  });
});

describe("formatLocalDate", () => {
  it("formats the calendar date without shifting it by a time zone", () => {
    expect(formatLocalDate("2026-03-08", { month: "short", day: "numeric", year: "numeric" })).toBe(
      "Mar 8, 2026",
    );
    expect(
      formatLocalDate("2026-11-20", {
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    ).toBe("Friday, Nov 20, 2026");
  });

  it("rejects invalid dates", () => {
    expect(() => formatLocalDate("2026-02-30", { month: "short" })).toThrow(
      "Local date is invalid",
    );
  });
});
