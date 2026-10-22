// Whether a medication was in use on any day of a date range. A medication
// is active from its start date until a "discontinued" event, and again
// from each "resumed" event until the next discontinue.

export interface MedicationStatusEventLike {
  event: string;
  event_at: string;
}

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

// Status events are timestamptz values, so convert to the viewer's local
// calendar date (matching the local start/range dates) before comparing.
function eventDayNumber(eventAt: string): number {
  if (!eventAt.includes("T")) return dayNumber(eventAt);
  const d = new Date(eventAt);
  if (Number.isNaN(d.getTime())) return dayNumber(eventAt);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

// `courseEnd` is the medication's end_date, the last day it is usable.
// Medications with no start date can't be placed in time, so they count as
// active.
export function wasActiveDuring(
  startDate: string | null,
  events: MedicationStatusEventLike[],
  rangeStart: string,
  rangeEnd: string,
  courseEnd: string | null = null,
): boolean {
  if (!startDate) return true;
  const from = dayNumber(rangeStart);
  if (courseEnd && dayNumber(courseEnd) < from) return false;
  const end = dayNumber(rangeEnd);
  const sorted = events
    .filter((e) => e.event === "discontinued" || e.event === "resumed")
    .sort((a, b) => a.event_at.localeCompare(b.event_at));

  let activeFrom: number | null = dayNumber(startDate);
  for (const e of sorted) {
    const day = eventDayNumber(e.event_at);
    if (day > end) break;
    if (e.event === "discontinued" && activeFrom !== null) {
      if (day >= from && activeFrom <= day) return true;
      activeFrom = null;
    } else if (e.event === "resumed" && activeFrom === null) {
      activeFrom = day;
    }
  }
  return activeFrom !== null && activeFrom <= end;
}
