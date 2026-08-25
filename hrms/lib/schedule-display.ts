export function taipeiDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Taipei",
    year: "numeric",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function getMonthBounds(dateKey: string): { dateFrom: string; dateTo: string } {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(dateKey);
  if (!match) throw new Error("Invalid date key");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    dateFrom: `${match[1]}-${match[2]}-01`,
    dateTo: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function formatScheduledHours(totalMinutes: number): string {
  const hours = totalMinutes / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}
