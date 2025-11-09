export function formatDate(dateString: string) {
  const [year, month] = dateString.split('-').map(Number);
  if (!year || !month) return '';
  const date = new Date(year, month - 1);
  const monthName = date.toLocaleString('default', { month: 'long' });
  return `${monthName.toLowerCase()} ${year}`;
}
