export function getMonth(offset = 0): string {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const month = target.toLocaleString("en-US", { month: "long" }).toLowerCase();
  const year = target.getFullYear();
  return `${month} ${year}`;
}
