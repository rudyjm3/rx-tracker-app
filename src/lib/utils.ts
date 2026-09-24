// Ported from rx-tracker-web's lib/utils.ts (subset used by lib/schedule.ts
// and the dashboard screen).

// Local calendar date (YYYY-MM-DD), not UTC — toISOString() would shift
// the date for any user not on UTC, especially for several hours around
// local midnight (e.g. a UTC-7 user sees tomorrow's date after 5pm local).
export function localDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function to12h(time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  const hour = parseInt(hourStr, 10);
  const minute = (minuteStr ?? "00").padStart(2, "0");
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${period}`;
}

export function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}
