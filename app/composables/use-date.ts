import {
  format,
  addMonth,
  addDay,
  diffDays,
  monthStart,
  monthEnd,
  dayStart,
  tzDate,
  dayEnd
} from '@formkit/tempo'


export function useDate() {

  const currentDate = useState<Date>('currentDate', () => new Date())

  const queryDayBounds = computed(() => {
    return {
      from: dayStart(currentDate.value).getTime(),
      to: dayEnd(currentDate.value).getTime()
    }
  })

  const queryMonthBounds = computed(() => {
    return {
      from: monthStart(currentDate.value).getTime(),
      to: monthEnd(currentDate.value).getTime()
    }
  })


  const today = computed(() => {
    return format({
      date: currentDate.value,
      format: "MMM D, YYYY",
      tz: 'America/New_York',
    })
  })

  const elapsedDays = computed(() => {
    return diffDays(new Date(), monthStart(currentDate.value))
  })

  function setDate(date: Date) {
    currentDate.value = date
  }

  function backDay() {
    currentDate.value = addDay(currentDate.value, -1)
  }
  function forwardDay() {
    if (currentDate.value.getDate() === new Date().getDate()) return
    if (currentDate.value === monthEnd(new Date)) return
    currentDate.value = addDay(currentDate.value, 1)
  }

  return {
    currentDate,
    queryDayBounds,
    queryMonthBounds,
    appDay: today,
    backDay,
    forwardDay,
    setDate,
    elapsedDays
  }
}
