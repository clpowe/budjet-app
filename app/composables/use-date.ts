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

  const currentDate = ref(new Date())

  const queryDayBounds = computed(() => {
    const date = currentDate.value
    return {
      from: dayStart(date).getTime(),
      to: dayEnd(date).getTime()
    }
  })

  const queryMonthBounds = computed(() => {
    const date = currentDate.value
    return {
      from: monthStart(date).getTime(),
      to: monthEnd(date).getTime()
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

  function backDay() {
    currentDate.value = addDay(currentDate.value, -1)
  }
  function forwardDay() {
    if (currentDate.value.getDate() === new Date().getDate()) return
    if (currentDate.value === monthEnd(new Date)) return
    currentDate.value = addDay(currentDate.value, 1)
  }

  return {
    queryDayBounds,
    queryMonthBounds,
    appDay: today,
    backDay,
    forwardDay,
    elapsedDays
  }
}
