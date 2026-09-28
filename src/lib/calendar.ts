// Ported subset of rx-tracker-web's lib/calendar.ts — month arithmetic,
// day-cell coloring, and (as of the calendar enhancements) the
// group-bucketed day-detail view with planned required/non-required
// counts. This app doesn't write finalized "missed" logs yet, so past
// days without a dose_logs row just render empty rather than as missed,
// and medsForDate below uses each medication's current `active` flag
// rather than replaying status-event history — a deliberate
// simplification (the calendar spec's planned counts are explicitly not
// adjusted for one-off skips or pauses, so there's no need for the web
// app's fuller wasActiveOnDate/historicallyActiveMedications replay here).
import type { CalendarLogRow } from "@/lib/dose-logs";
import { generateDaySlots } from "@/lib/schedule";
import { formatLate, localDateString, minutesLate, to12h } from "@/lib/utils";
import type {
  DoseLogStatus,
  Medication,
  MedicationGroup,
  MedicationGroupMember,
} from "@/lib/types/medications";

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localDateString(d);
}

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

export interface CalendarDaySlot {
  logId: string;
  medicationId: string;
  time: string; // "HH:MM"
  displayTime: string; // 12h
  status: DoseLogStatus;
  isLate: boolean;
  lateLabel: string | null;
  takenAt: string | null;
  painLevel: number | null;
  moodLevel: number | null;
  note: string;
  deductedQuantity: number | null;
}

export interface CalendarDayMedicationSummary {
  medicationId: string;
  name: string;
  dose: string | null;
  dose_amount: number | null;
  dose_unit: string | null;
  total: number;
  taken: number;
  late: number;
  skipped: number;
  missed: number;
  slots: CalendarDaySlot[];
}

export interface CalendarDayGroupSummary {
  groupId: string;
  groupName: string;
  medications: CalendarDayMedicationSummary[];
}

// A schedule-driven occurrence for a date with no dose_logs to report on
// yet (a future date opened via the newly-clickable cells) — no
// taken/skipped/missed status exists, so this is deliberately a narrower
// shape than CalendarDayMedicationSummary rather than one padded with
// zeroed-out counts.
export interface CalendarDayPlannedSlot {
  medicationId: string;
  name: string;
  dose: string | null;
  dose_amount: number | null;
  dose_unit: string | null;
  scheduledTime: string; // "HH:MM"
  displayTime: string;
  isPrn: boolean;
}

export interface CalendarDayPlannedGroup {
  groupId: string;
  groupName: string;
  medications: CalendarDayPlannedSlot[];
}

export interface CalendarDayEndingMedication {
  medicationId: string;
  name: string;
  dose: string | null;
  dose_amount: number | null;
  dose_unit: string | null;
}

export interface CalendarDayDetail {
  date: string;
  dayName: string; // e.g. "Friday"
  displayDate: string; // e.g. "August 22, 2026"
  isFuture: boolean;
  // Raw recurring-schedule occurrence counts for this date, with no
  // adjustment for one-off skips or pauses — computed the same way for
  // past, today, and future dates via generateDaySlots. plannedNonRequired
  // reflects actual logged as-needed doses once any exist for the date
  // (past/today); it falls back to the schedule's own PRN-in-group
  // occurrence count for dates with nothing logged yet (typically 0 for a
  // future date).
  plannedRequired: number;
  plannedNonRequired: number;
  // Medications whose end_date falls on this date (natural end-date
  // rollover only — never a separate inactive/discontinued flag).
  endingMedications: CalendarDayEndingMedication[];
  medications: CalendarDayMedicationSummary[]; // medications with no single shared group that day
  groups: CalendarDayGroupSummary[]; // medications sharing a group that day, nested under it
  // Populated for a future date only: what the recurring schedule plans
  // to generate, since nothing has been logged yet to summarize instead.
  plannedMedications: CalendarDayPlannedSlot[];
  plannedGroups: CalendarDayPlannedGroup[];
}

/**
 * Groups a month's raw dose_logs into per-day, per-medication summaries
 * for the day-detail view, clusters medications sharing a group into
 * `day.groups`, and (new) ensures every date in [monthStart, monthEnd] has
 * an entry — including future ones — annotated with planned
 * required/non-required counts and any medication ending that day.
 *
 * A medication only lands in `day.groups` when *every* dose it logged
 * that day resolves to the exact same group — a medication with a mix of
 * grouped and individual (or multiple different groups') doses the same
 * day is left in the flat `medications` list instead of guessing which
 * single group it "belongs to" for the day.
 */
export function buildDayDetails(
  monthStart: string,
  monthEnd: string,
  todayDate: string,
  logs: CalendarLogRow[],
  graceMinutes: number,
  medications: Medication[],
  groups: MedicationGroup[],
  groupMembers: Pick<MedicationGroupMember, "group_id" | "medication_id" | "quantity_per_dose">[],
): Record<string, CalendarDayDetail> {
  const groupIdByMedTime = new Map<string, string>();
  for (const med of medications) {
    for (const st of med.medication_schedule_times ?? []) {
      if (st.group_id) {
        groupIdByMedTime.set(`${med.id}|${st.reminder_time.slice(0, 5)}`, st.group_id);
      }
    }
  }
  const groupsById = new Map(groups.map((g) => [g.id, g]));
  const medsById = new Map(medications.map((m) => [m.id, m]));

  const result: Record<string, CalendarDayDetail> = {};
  const groupIdsByDateAndMedication = new Map<string, Map<string, Set<string | null>>>();

  function blankDay(date: string): CalendarDayDetail {
    const d = new Date(`${date}T00:00:00`);
    return {
      date,
      dayName: d.toLocaleDateString(undefined, { weekday: "long" }),
      displayDate: d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }),
      isFuture: false,
      plannedRequired: 0,
      plannedNonRequired: 0,
      endingMedications: [],
      medications: [],
      groups: [],
      plannedMedications: [],
      plannedGroups: [],
    };
  }

  for (const log of logs) {
    const date = log.scheduled_for_date;
    let day = result[date];
    if (!day) {
      day = blankDay(date);
      result[date] = day;
    }

    let med = day.medications.find((m) => m.medicationId === log.medication_id);
    if (!med) {
      med = {
        medicationId: log.medication_id,
        name: log.medications.name,
        dose: log.medications.dose,
        dose_amount: log.medications.dose_amount,
        dose_unit: log.medications.dose_unit,
        total: 0,
        taken: 0,
        late: 0,
        skipped: 0,
        missed: 0,
        slots: [],
      };
      day.medications.push(med);
    }

    const lateMin = minutesLate(log, graceMinutes);
    med.total++;
    if (log.status === "taken") {
      med.taken++;
      if (lateMin !== null) med.late++;
    } else if (log.status === "skipped") {
      med.skipped++;
    } else if (log.status === "missed") {
      med.missed++;
    }

    const time = log.scheduled_time.slice(0, 5);
    med.slots.push({
      logId: log.id,
      medicationId: log.medication_id,
      time,
      displayTime: to12h(time),
      status: log.status,
      isLate: lateMin !== null,
      lateLabel: lateMin !== null ? formatLate(lateMin) : null,
      takenAt: log.taken_at,
      painLevel: log.pain_level,
      moodLevel: log.mood_level,
      note: log.note,
      deductedQuantity: log.deducted_quantity,
    });

    const groupId = groupIdByMedTime.get(`${log.medication_id}|${time}`) ?? null;
    let byMedication = groupIdsByDateAndMedication.get(date);
    if (!byMedication) {
      byMedication = new Map();
      groupIdsByDateAndMedication.set(date, byMedication);
    }
    const ids = byMedication.get(log.medication_id) ?? new Set<string | null>();
    ids.add(groupId);
    byMedication.set(log.medication_id, ids);
  }

  for (const [date, day] of Object.entries(result)) {
    const byMedication = groupIdsByDateAndMedication.get(date) ?? new Map();
    const ungrouped: CalendarDayMedicationSummary[] = [];
    const groupBuckets = new Map<string, CalendarDayMedicationSummary[]>();

    for (const med of day.medications) {
      const ids = byMedication.get(med.medicationId) ?? new Set<string | null>();
      const groupId = ids.size === 1 ? [...ids][0] : null;
      if (groupId && groupsById.has(groupId)) {
        const bucket = groupBuckets.get(groupId) ?? [];
        bucket.push(med);
        groupBuckets.set(groupId, bucket);
      } else {
        ungrouped.push(med);
      }
    }

    day.medications = ungrouped;
    day.groups = [...groupBuckets.entries()].map(([groupId, meds]) => ({
      groupId,
      groupName: groupsById.get(groupId)!.name,
      medications: meds,
    }));
  }

  // Ensure every date in the visible month has an entry — including future
  // ones, whose day-detail is driven entirely by the recurring schedule
  // since nothing has been logged yet — and annotate every date (past,
  // today, and future alike) with its planned required/non-required
  // counts and any medication ending that day.
  for (let date = monthStart; date <= monthEnd; date = addDays(date, 1)) {
    let day = result[date];
    if (!day) {
      day = blankDay(date);
      result[date] = day;
    }

    const isFuture = date > todayDate;
    day.isFuture = isFuture;

    // A medication with a null start_date has no explicit lower bound in
    // generateDaySlots, so without this it would report planned doses for
    // every date back to month zero — including dates before it even
    // existed. Fall back to its creation date as the effective start.
    const medsForDate = medications.filter((m) => m.active && date >= (m.start_date ?? m.created_at.slice(0, 10)));
    const slots = generateDaySlots(date, medsForDate, groups, groupMembers, [], [], {
      ignoreDashboardVisibility: true,
    });
    const requiredSlots = slots.filter((s) => !s.isPrn);
    const prnSlots = slots.filter((s) => s.isPrn);

    // Both counts are actual logged totals for the date, topped up with
    // any planned occurrence whose medication has no log yet — never the
    // current schedule's raw projection alone for a date with logs. A
    // medication's medication_schedule_times get deleted and reinserted on
    // every edit, so projecting *today's* schedule onto a past date after
    // the regimen changed would silently zero out doses that were
    // genuinely logged under the schedule that applied back then; the
    // actual per-medication totals already on `day` don't have that
    // problem. A date can also have one required dose already logged
    // (making groupIdsByDateAndMedication true) while its group's PRN
    // member is still unlogged, so the "topped up with unlogged planned
    // slots" half still matters even on a mostly-logged date.
    const sumTotals = (meds: CalendarDayMedicationSummary[], asNeeded: boolean) =>
      meds.reduce(
        (n, m) => n + ((medsById.get(m.medicationId)?.as_needed ?? false) === asNeeded ? m.total : 0),
        0,
      );
    const loggedRequired =
      sumTotals(day.medications, false) + day.groups.reduce((n, g) => n + sumTotals(g.medications, false), 0);
    const loggedNonRequired =
      sumTotals(day.medications, true) + day.groups.reduce((n, g) => n + sumTotals(g.medications, true), 0);
    const loggedMedicationIdsForDate = new Set([
      ...day.medications.map((m) => m.medicationId),
      ...day.groups.flatMap((g) => g.medications.map((m) => m.medicationId)),
    ]);
    const unloggedRequiredSlots = requiredSlots.filter((s) => !loggedMedicationIdsForDate.has(s.medicationId));
    const unloggedPrnSlots = prnSlots.filter((s) => !loggedMedicationIdsForDate.has(s.medicationId));
    day.plannedRequired = loggedRequired + unloggedRequiredSlots.length;
    day.plannedNonRequired = loggedNonRequired + unloggedPrnSlots.length;

    day.endingMedications = medications
      .filter((m) => m.end_date === date)
      .map((m) => ({
        medicationId: m.id,
        name: m.name,
        dose: m.dose,
        dose_amount: m.dose_amount,
        dose_unit: m.dose_unit,
      }));

    if (isFuture) {
      const ungroupedPlanned: CalendarDayPlannedSlot[] = [];
      const byGroup = new Map<string, CalendarDayPlannedSlot[]>();
      for (const slot of slots) {
        const planned: CalendarDayPlannedSlot = {
          medicationId: slot.medicationId,
          name: slot.medicationName,
          dose: slot.dose,
          dose_amount: medsById.get(slot.medicationId)?.dose_amount ?? null,
          dose_unit: medsById.get(slot.medicationId)?.dose_unit ?? null,
          scheduledTime: slot.scheduledTime,
          displayTime: to12h(slot.scheduledTime),
          isPrn: slot.isPrn,
        };
        if (slot.groupId) {
          const bucket = byGroup.get(slot.groupId) ?? [];
          bucket.push(planned);
          byGroup.set(slot.groupId, bucket);
        } else {
          ungroupedPlanned.push(planned);
        }
      }
      day.plannedMedications = ungroupedPlanned;
      day.plannedGroups = [...byGroup.entries()].map(([groupId, meds]) => ({
        groupId,
        groupName: groupsById.get(groupId)?.name ?? "",
        medications: meds,
      }));
    }
  }

  return result;
}
