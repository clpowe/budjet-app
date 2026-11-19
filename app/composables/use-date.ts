import { addMonth, format, tzDate } from "@formkit/tempo";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { DEFAULT_HOUSEHOLD_TIME_ZONE } from "./use-households";
import {
  getLocalDateKey,
  getLocalDayBounds,
  getNextLocalDate,
  getNextMonthStart,
} from "../../shared/utils/local-date.ts";

type TimeZoneInput = MaybeRefOrGetter<string | null | undefined>;

export function useDate(timeZoneInput?: TimeZoneInput) {
  const { effectiveTimeZone } = useHousehold();
  const currentDate = useState<Date>("currentDate", () => new Date());

  const timeZone = computed(() => {
    return toValue(timeZoneInput) ?? effectiveTimeZone.value ?? DEFAULT_HOUSEHOLD_TIME_ZONE;
  });

  const localDate = computed(() => {
    return getLocalDateKey(currentDate.value.getTime(), timeZone.value);
  });

  const queryDayBounds = computed(() => {
    const bounds = getLocalDayBounds(localDate.value, timeZone.value);

    return {
      from: bounds.startTimestamp,
      to: bounds.endExclusiveTimestamp,
    };
  });

  const queryMonthBounds = computed(() => {
    const monthStart = `${localDate.value.slice(0, 7)}-01`;
    const nextMonthStart = getNextMonthStart(monthStart);

    return {
      from: getLocalDayBounds(monthStart, timeZone.value).startTimestamp,
      to: getLocalDayBounds(nextMonthStart, timeZone.value).startTimestamp,
    };
  });

  const displayDate = computed(() => {
    return format({
      date: currentDate.value,
      format: "MMM D, YYYY",
      tz: timeZone.value,
    });
  });

  const currentMonth = computed(() => {
    return format({
      date: new Date(currentDate.value),
      format: "MMMM",
      tz: timeZone.value,
    });
  });

  const elapsedDays = computed(() => Number(localDate.value.slice(8, 10)));

  const totalDaysInMonth = computed(() => {
    const year = Number(localDate.value.slice(0, 4));
    const month = Number(localDate.value.slice(5, 7));

    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  });

  const remainingDaysInMonth = computed(() => {
    return totalDaysInMonth.value - elapsedDays.value + 1;
  });

  function formatDateInput(date: Date): string {
    return format({
      date,
      format: "YYYY-MM-DD",
      tz: timeZone.value,
    });
  }

  function toTransactionTimestamp(date: string): number {
    return tzDate(`${date}T00:00:00`, timeZone.value).getTime();
  }

  function setDate(date: Date) {
    currentDate.value = date;
  }

  function goToPreviousDay() {
    const currentDayStart = getLocalDayBounds(localDate.value, timeZone.value).startTimestamp;
    const previousLocalDate = getLocalDateKey(currentDayStart - 1, timeZone.value);

    currentDate.value = new Date(
      getLocalDayBounds(previousLocalDate, timeZone.value).startTimestamp,
    );
  }

  function goToNextDay() {
    const todayLocalDate = getLocalDateKey(Date.now(), timeZone.value);

    if (localDate.value >= todayLocalDate) return;

    const nextLocalDate = getNextLocalDate(localDate.value, timeZone.value);

    currentDate.value = new Date(getLocalDayBounds(nextLocalDate, timeZone.value).startTimestamp);
  }

  function goToPreviousMonth() {
    currentDate.value = addMonth(currentDate.value, -1);
  }

  function goToNextMonth() {
    currentDate.value = addMonth(currentDate.value, 1);
  }

  return {
    currentDate,
    currentMonth,
    timeZone,
    localDate,
    queryDayBounds,
    queryMonthBounds,
    displayDate,
    goToPreviousDay,
    goToNextDay,
    goToPreviousMonth,
    goToNextMonth,
    setDate,
    elapsedDays,
    totalDaysInMonth,
    remainingDaysInMonth,
    formatDateInput,
    toTransactionTimestamp,
  };
}
