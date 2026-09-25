// Ported from rx-tracker-web's lib/utils.ts (subset used by lib/schedule.ts
// and the dashboard/medications/calendar screens).
import type { Medication } from "@/lib/types/medications";

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

export function formatLate(minutes: number): string {
  if (minutes < 60) return `${minutes}mins late`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}hr ${mins}mins late` : `${hrs}hr late`;
}

interface LateCheckLog {
  status: string;
  taken_at: string | null;
  scheduled_for_date: string;
  scheduled_time: string;
}

export function isLate(log: LateCheckLog, graceMinutes: number): boolean {
  if (log.status !== "taken" || !log.taken_at) return false;
  const scheduled = new Date(`${log.scheduled_for_date}T${log.scheduled_time}`);
  const threshold = new Date(scheduled.getTime() + graceMinutes * 60000);
  return new Date(log.taken_at) > threshold;
}

// How many minutes past the grace threshold a taken dose was logged, or
// null if it wasn't late (or isn't a taken dose). Used where the actual
// "Xmins late" label is shown, not just a late/on-time boolean.
export function minutesLate(log: LateCheckLog, graceMinutes: number): number | null {
  if (log.status !== "taken" || !log.taken_at) return null;
  const scheduled = new Date(`${log.scheduled_for_date}T${log.scheduled_time}`);
  const threshold = new Date(scheduled.getTime() + graceMinutes * 60000);
  const diffMs = new Date(log.taken_at).getTime() - threshold.getTime();
  return diffMs > 0 ? Math.ceil(diffMs / 60000) : null;
}

// Single source of truth for "how many doses a day" a schedule implies.
export function dosesPerDay(
  scheduleMode: "fixed_times" | "interval",
  scheduleTimesCount: number,
  intervalHours: number | null | undefined,
): number {
  if (scheduleMode === "fixed_times") return scheduleTimesCount;
  return intervalHours ? Math.max(1, Math.round(24 / intervalHours)) : 0;
}

export interface GroupDoseOverride {
  scheduled_time: string;
  quantity_per_dose: number | null;
}

function doseUnitsForTime(
  medication: Medication,
  scheduledTime: string,
  scheduleTimeOverride: number | null | undefined,
  groupDoseOverrides: GroupDoseOverride[],
): number {
  const groupOverride = groupDoseOverrides.find(
    (override) => override.scheduled_time.slice(0, 5) === scheduledTime.slice(0, 5),
  );
  return groupOverride?.quantity_per_dose ?? scheduleTimeOverride ?? medication.quantity_per_dose;
}

// null = no supply projection possible (e.g. no inventory tracked, or no
// dose quantity to divide by).
export function daysUntilRunout(
  medication: Medication,
  groupDoseOverrides: GroupDoseOverride[] = [],
): number | null {
  const qty = medication.current_quantity ?? 0;
  if (qty <= 0) return 0;

  let dailyUnits = 0;
  if (medication.as_needed) {
    dailyUnits = groupDoseOverrides.reduce(
      (total, override) => total + (override.quantity_per_dose ?? medication.quantity_per_dose),
      0,
    );
  } else if (medication.schedule_mode === "fixed_times") {
    dailyUnits = (medication.medication_schedule_times ?? []).reduce(
      (total, scheduleTime) =>
        total +
        doseUnitsForTime(
          medication,
          scheduleTime.reminder_time,
          scheduleTime.quantity_per_dose,
          groupDoseOverrides,
        ),
      0,
    );
  } else {
    dailyUnits =
      dosesPerDay(
        medication.schedule_mode,
        medication.medication_schedule_times?.length ?? 0,
        medication.interval_hours,
      ) * medication.quantity_per_dose;
  }

  if (dailyUnits <= 0) return null;
  return Math.floor(qty / dailyUnits);
}

export function scheduleSummary(med: Medication): string {
  if (med.as_needed) return "As needed";
  if (med.schedule_mode === "interval") {
    return med.interval_hours
      ? `Every ${med.interval_hours}h${med.first_dose_time ? ` from ${to12h(med.first_dose_time)}` : ""}`
      : "Interval schedule";
  }
  const times = med.medication_schedule_times ?? [];
  if (times.length === 0) return "No schedule set";
  return times
    .slice()
    .sort((a, b) => a.reminder_time.localeCompare(b.reminder_time))
    .map((t) => to12h(t.reminder_time))
    .join(", ");
}
