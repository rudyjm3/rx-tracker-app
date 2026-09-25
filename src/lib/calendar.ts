// Ported subset of rx-tracker-web's lib/calendar.ts — month arithmetic and
// day-cell coloring. The full version also backfills/finalizes missed
// doses for past dates and builds grouped day-detail views; this app
// doesn't write finalized "missed" logs yet, so past days without a
// dose_logs row just render empty rather than as missed. Day-detail here
// is a flat per-date list built client-side from getCalendarLogs, not the
// group-bucketed CalendarDayDetail the web app builds.
import { localDateString } from "@/lib/utils";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface MonthBounds {
  monthStart: string; // YYYY-MM-01
  monthEnd: string; // YYYY-MM-DD, the month's last day
  daysInMonth: number;
  firstDow: number; // 0 (Sun) .. 6 (Sat), weekday of the 1st
  prevMonth: string; // YYYY-MM
  nextMonth: string; // YYYY-MM
  label: string; // e.g. "August 2026"
}

/**
 * Local-time month arithmetic for the calendar grid — built from Date's
 * local-time constructor (never toISOString()) so it can't drift a day
 * near month boundaries the way UTC-based math would.
 */
export function monthBounds(month: string): MonthBounds {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstDow = new Date(year, monthIndex, 1).getDay();
  const prevDate = new Date(year, monthIndex - 1, 1);
  const nextDate = new Date(year, monthIndex + 1, 1);

  return {
    monthStart: `${month}-01`,
    monthEnd: `${month}-${String(daysInMonth).padStart(2, "0")}`,
    daysInMonth,
    firstDow,
    prevMonth: `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`,
    nextMonth: `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`,
    label: `${MONTH_NAMES[monthIndex]} ${year}`,
  };
}

export type CalendarDayColor = "future" | "missed" | "skipped" | "taken" | "empty";

/**
 * Day-cell color priority: future days are neutral regardless of data;
 * otherwise missed beats skipped-only beats taken beats no data at all.
 */
export function calendarDayColor(
  isFuture: boolean,
  marker: { taken: number; skipped: number; missed: number } | undefined,
): CalendarDayColor {
  if (isFuture) return "future";
  if (!marker) return "empty";
  if (marker.missed > 0) return "missed";
  if (marker.skipped > 0 && marker.taken === 0) return "skipped";
  if (marker.taken > 0) return "taken";
  return "empty";
}

export function currentMonth(): string {
  return localDateString().slice(0, 7);
}
