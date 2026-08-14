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
});
