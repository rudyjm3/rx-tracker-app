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

/**
 * Parses a user-typed clock time ("8:30 PM", "8:30pm", "830 pm", "20:30")
 * into 24h "HH:MM", or null when it isn't a valid time.
 */
export function parseTimeInput(input: string): string | null {
  const m = input.trim().toLowerCase().match(/^(\d{1,2}):?(\d{2})?\s*([ap])?\.?m?\.?$/);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  if (minute > 59) return null;
  if (m[3]) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (m[3] === "p" ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function minutesToTime(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(Math.round(minutes % 60)).padStart(2, '0');
  return `${h}:${m}`;
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

// Wall-clock time (12h) a timestamp falls on, in the device's local
// timezone — used for "Snoozed until X:XX PM" labels.
export function formatClockTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return to12h(`${h}:${m}`);
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
          // Group-owned rows defer to the group member's override (or the
          // medication's own dose) — their copied quantity can go stale.
          scheduleTime.group_id ? null : scheduleTime.quantity_per_dose,
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

// Canonical spellings for the dose units the app already offers (see the
// unit <select> in components/medications/wizard/StepIdentity.tsx) plus the
// spellings openFDA's NDC directory uses for them ("[iU]", "[USP'U]").
const DOSE_UNIT_ALIASES: Record<string, string> = {
  mg: "mg",
  mcg: "mcg",
  ug: "mcg",
  "µg": "mcg",
  g: "g",
  ml: "mL",
  iu: "IU",
  "[iu]": "IU",
  unit: "units",
  units: "units",
  "[usp'u]": "units",
  "[arb'u]": "units",
};

export function canonicalDoseUnit(unit: string | null | undefined): string | null {
  if (!unit) return null;
  return DOSE_UNIT_ALIASES[unit.trim().toLowerCase()] ?? null;
}

export interface ParsedStrength {
  amount: number;
  unit: string;
}

// Splits a strength string such as "2 mg", "2mg", ".25 mg/1" (openFDA's
// per-unit form) or "500 mcg" into a numeric amount and a canonical unit.
// Returns null when the string isn't a plain per-dosage-unit strength:
// unknown units, or concentrations like "1 mg/mL" and "100 mg/.28mL", where
// the amount is per volume rather than per tablet/capsule and so isn't a dose.
export function parseStrength(value: string | null | undefined): ParsedStrength | null {
  if (!value) return null;
  const match = value
    .trim()
    .match(/^(\d+(?:\.\d+)?|\.\d+)\s*(\[[^\]]+\]|[a-zA-Zµ]+)(?:\s*\/\s*1)?$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = canonicalDoseUnit(match[2]);
  if (!Number.isFinite(amount) || amount <= 0 || !unit) return null;
  return { amount, unit };
}

const MASS_IN_MCG: Record<string, number> = { mcg: 1, mg: 1000, g: 1_000_000 };

// True when two dose strengths are the same, including across mass units
// (0.5 mg === 500 mcg).
export function strengthsEqual(
  a: { amount: number; unit: string },
  b: { amount: number; unit: string },
): boolean {
  const unitA = canonicalDoseUnit(a.unit);
  const unitB = canonicalDoseUnit(b.unit);
  if (!unitA || !unitB) return false;
  const factorA = MASS_IN_MCG[unitA];
  const factorB = MASS_IN_MCG[unitB];
  if (factorA && factorB) {
    return Math.abs(a.amount * factorA - b.amount * factorB) < 1e-6;
  }
  return unitA === unitB && Math.abs(a.amount - b.amount) < 1e-9;
}
