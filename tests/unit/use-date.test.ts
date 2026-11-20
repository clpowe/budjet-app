import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ref } from "vue";

const currentDate = ref(new Date("2026-03-08T06:30:00.000Z"));
const householdTimeZone = ref("America/New_York");

let useDate: typeof import("../../app/composables/use-date").useDate;

describe("useDate", () => {
  beforeEach(async () => {
    vi.resetModules();

    currentDate.value = new Date("2026-03-08T06:30:00.000Z");
    householdTimeZone.value = "America/New_York";

    vi.stubGlobal("useState", () => currentDate);
    vi.stubGlobal("useHousehold", () => ({
      effectiveTimeZone: householdTimeZone,
    }));

    ({ useDate } = await import("../../app/composables/use-date"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses an explicit reactive household timezone for labels and day bounds", () => {
    const timeZone = ref("America/Los_Angeles");
    const date = useDate(timeZone);

    expect(date.formatDateInput(currentDate.value)).toBe("2026-03-07");
    expect(date.queryDayBounds.value).toEqual({
      from: Date.UTC(2026, 2, 7, 8),
      to: Date.UTC(2026, 2, 8, 8),
    });

    timeZone.value = "America/New_York";

    expect(date.formatDateInput(currentDate.value)).toBe("2026-03-08");
    expect(date.queryDayBounds.value).toEqual({
      from: Date.UTC(2026, 2, 8, 5),
      to: Date.UTC(2026, 2, 9, 4),
    });
    expect(date.toTransactionTimestamp("2026-03-08")).toBe(Date.UTC(2026, 2, 8, 5));
  });

  it("labels the household-local date and month", () => {
    const date = useDate();

    // 06:30 UTC on Mar 8 is still Mar 8 in New York (01:30).
    expect(date.displayDate.value).toBe("Mar 8, 2026");
    expect(date.currentMonth.value).toBe("March");
    expect(date.totalDaysInMonth.value).toBe(31);
    expect(date.remainingDaysInMonth.value).toBe(24);
  });

  it("moves by whole months in the household time zone", () => {
    currentDate.value = new Date(Date.UTC(2026, 0, 31, 17));
    const date = useDate();

    date.goToNextMonth();
    expect(date.localDate.value).toBe("2026-02-28");
    expect(date.totalDaysInMonth.value).toBe(28);

    date.goToPreviousMonth();
    expect(date.localDate.value).toBe("2026-01-28");
  });
});
