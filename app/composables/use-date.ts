import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { DEFAULT_HOUSEHOLD_TIME_ZONE } from "./use-households";
import {
  addMonthsInTimeZone,
  countLocalDays,
  formatLocalDate,
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

  const displayDate = computed(() => {
    return formatLocalDate(localDate.value, { month: "short", day: "numeric", year: "numeric" });
  });

  const currentMonth = computed(() => {
    return formatLocalDate(localDate.value, { month: "long" });
  });

  const elapsedDays = computed(() => Number(localDate.value.slice(8, 10)));

  const totalDaysInMonth = computed(() => {
    const monthStart = `${localDate.value.slice(0, 7)}-01`;

    return countLocalDays(monthStart, getNextMonthStart(monthStart));
  });

  const remainingDaysInMonth = computed(() => {
    return totalDaysInMonth.value - elapsedDays.value + 1;
  });

  function formatDateInput(date: Date): string {
    return getLocalDateKey(date.getTime(), timeZone.value);
  }

  function toTransactionTimestamp(date: string): number {
    return getLocalDayBounds(date, timeZone.value).startTimestamp;
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
    currentDate.value = new Date(
      addMonthsInTimeZone(currentDate.value.getTime(), -1, timeZone.value),
    );
  }

  function goToNextMonth() {
    currentDate.value = new Date(
      addMonthsInTimeZone(currentDate.value.getTime(), 1, timeZone.value),
    );
  }

  return {
    currentDate,
    currentMonth,
    timeZone,
    localDate,
    queryDayBounds,
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
