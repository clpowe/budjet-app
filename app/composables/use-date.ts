import { addMonth, format, tzDate } from "@formkit/tempo";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import {
  getLocalDateKey,
  getLocalDayBounds,
  getNextLocalDate,
} from "../../convex/lib/want_reserve";
import { DEFAULT_HOUSEHOLD_TIME_ZONE } from "./use-households";

type TimeZoneInput = MaybeRefOrGetter<string | null | undefined>;

function getNextMonthStart(localDate: string): string {
  const year = Number(localDate.slice(0, 4));
  const month = Number(localDate.slice(5, 7));
  const nextMonth = new Date(Date.UTC(year, month, 1));

  return nextMonth.toISOString().slice(0, 10);
}

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

  const appDay = computed(() => {
    return format({
      date: currentDate.value,
      format: "MMM D, YYYY",
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

  function backDay() {
    const currentDayStart = getLocalDayBounds(localDate.value, timeZone.value).startTimestamp;
    const previousLocalDate = getLocalDateKey(currentDayStart - 1, timeZone.value);

    currentDate.value = new Date(
      getLocalDayBounds(previousLocalDate, timeZone.value).startTimestamp,
    );
  }

  function forwardDay() {
    const todayLocalDate = getLocalDateKey(Date.now(), timeZone.value);

    if (localDate.value >= todayLocalDate) return;

    const nextLocalDate = getNextLocalDate(localDate.value, timeZone.value);

    currentDate.value = new Date(getLocalDayBounds(nextLocalDate, timeZone.value).startTimestamp);
  }

  function backMonth() {
    currentDate.value = addMonth(currentDate.value, -1);
  }

  function forwardMonth() {
    currentDate.value = addMonth(currentDate.value, 1);
  }

  return {
    currentDate,
    timeZone,
    queryDayBounds,
    queryMonthBounds,
    appDay,
    backDay,
    forwardDay,
    backMonth,
    forwardMonth,
    setDate,
    elapsedDays,
    totalDaysInMonth,
    remainingDaysInMonth,
    formatDateInput,
    toTransactionTimestamp,
  };
}
