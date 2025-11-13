function getRemainingDaysInMonth(date = new Date()) {
  // Get the last day of the current month
  const year = date.getFullYear();
  const month = date.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();

  // Get current day of month
  const currentDay = date.getDate();

  // Calculate remaining days (including today)
  const remainingDays = lastDay - currentDay + 1;

  return remainingDays;
}
