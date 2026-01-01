import {
  format,
  addMonth,
  addDay,
  diffDays,
  monthStart,
  monthEnd,
  dayStart,
  tzDate,
  dayEnd,
} from "@formkit/tempo";

export function useDate() {
  const currentDate = useState<Date>("currentDate", () => new Date());

  const queryDayBounds = computed(() => {
    return {
      from: dayStart(currentDate.value).getTime(),
      to: dayEnd(currentDate.value).getTime(),
    };
  });

  const queryMonthBounds = computed(() => {
    return {
      from: monthStart(currentDate.value).getTime(),
      to: monthEnd(currentDate.value).getTime(),
    };
  });

  const today = computed(() => {
    return format({
      date: currentDate.value,
      format: "MMM D, YYYY",
      tz: "America/New_York",
    });
  });

  const elapsedDays = computed<number>(() => {
    const days = format({
      date: currentDate.value,
      format: "D",
      tz: "America/New_York",
    });
    return Number(days);
  });

  function setDate(date: Date) {
    currentDate.value = date;
  }

  function backDay() {
    currentDate.value = addDay(currentDate.value, -1);
  }
  function forwardDay() {
    const today = dayStart(new Date());
    const current = dayStart(currentDate.value);

    // Prevent going past today
    if (current.getTime() >= today.getTime()) return;

    currentDate.value = addDay(currentDate.value, 1);
  }

  return {
    currentDate,
    queryDayBounds,
    queryMonthBounds,
    appDay: today,
    backDay,
    forwardDay,
    setDate,
    elapsedDays,
  };
}
