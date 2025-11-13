export function useMonthNavigation() {
  // Nuxt useState for shared state across components
  const selectedMonth = useState('selectedMonth', () => {
    const now = new Date();
    const months = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'
    ];
    return `${months[now.getMonth()]} ${now.getFullYear()}`;
  });

  const setCurrentMonth = () => {
    const now = new Date();
    const months = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'
    ];
    selectedMonth.value = `${months[now.getMonth()]} ${now.getFullYear()}`;
  };

  const getPreviousMonth = () => {
    // Parse the month string (e.g., "november 2025")
    const [monthName, yearStr] = selectedMonth.value.toLowerCase().split(' ');
    const year = parseInt(yearStr);

    // Map month names to numbers (0-11)
    const months = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'
    ];

    const currentMonthIndex = months.indexOf(monthName);

    if (currentMonthIndex === -1) {
      throw new Error('Invalid month name');
    }

    // Calculate previous month
    let prevMonthIndex = currentMonthIndex - 1;
    let prevYear = year;

    // Handle year rollover
    if (prevMonthIndex < 0) {
      prevMonthIndex = 11; // December
      prevYear = year - 1;
    }

    // Update selectedMonth and return formatted string
    selectedMonth.value = `${months[prevMonthIndex]} ${prevYear}`;
  };

  const getNextMonth = () => {
    const [monthName, yearStr] = selectedMonth.value.toLowerCase().split(' ');
    const year = parseInt(yearStr);

    const months = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'
    ];

    const currentMonthIndex = months.indexOf(monthName);

    if (currentMonthIndex === -1) {
      throw new Error('Invalid month name');
    }

    // Calculate next month
    let nextMonthIndex = currentMonthIndex + 1;
    let nextYear = year;

    // Handle year rollover
    if (nextMonthIndex > 11) {
      nextMonthIndex = 0; // January
      nextYear = year + 1;
    }

    // Update selectedMonth and return formatted string
    selectedMonth.value = `${months[nextMonthIndex]} ${nextYear}`;
  };

  return {
    selectedMonth,
    setCurrentMonth,
    getPreviousMonth,
    getNextMonth
  };
}


