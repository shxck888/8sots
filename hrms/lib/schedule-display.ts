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

export function shiftCalendarMonth(monthKey: string, months: number): string {
  if (!/^(?:[1-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(monthKey)) throw new Error("Invalid month key");
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 7);
}

export function getMonthCalendarDates(monthKey: string): string[] {
  if (!/^(?:[1-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(monthKey)) throw new Error("Invalid month key");
  const { dateFrom, dateTo } = getMonthBounds(`${monthKey}-01`);
  const first = new Date(`${dateFrom}T00:00:00.000Z`);
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  first.setUTCDate(first.getUTCDate() - mondayOffset);
  const last = new Date(`${dateTo}T00:00:00.000Z`);
  const days = Math.ceil((Math.round((last.getTime() - first.getTime()) / 86400000) + 1) / 7) * 7;
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(first.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

export function formatScheduledHours(totalMinutes: number): string {
  const hours = totalMinutes / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

export function formatTaipeiDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "時間資料異常";

  return new Intl.DateTimeFormat("zh-TW", {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "numeric",
    second: "2-digit",
    timeZone: "Asia/Taipei",
    year: "numeric",
  }).format(date);
}
