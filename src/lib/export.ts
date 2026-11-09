// Doctor Visit Report data — port of rx-tracker-web's ExportClient.tsx
// report assembly. The shape mirrors web's DoctorVisitReportData so the
// PDF (lib/report-html.ts) and the on-screen preview
// (components/export/report-summary.tsx) render the same sections, in the
// same order, as the web report.
//
// One deliberate difference from web: adherence and missed doses. This
// app never writes a finalized "missed" dose_logs row for a slot nobody
// touched (see lib/calendar.ts), so reading dose_logs alone would drop
// every untouched dose from both the adherence percentage and the missed
// list. Each date's required slots are regenerated the way the dashboard
// does (generateDaySlots) and any slot still pending past its due time +
// grace period counts as missed.
import { computeAdherence } from "@/lib/adherence";
import { getProfileAllergies } from "@/lib/allergies";
import { getMissedGraceMinutes, getMoodChartScheme, type MoodChartScheme } from "@/lib/app-settings";
import { getCalendarLogs, type CalendarLogRow } from "@/lib/dose-logs";
import { getDoseHistory } from "@/lib/medications";
import { wasActiveDuring } from "@/lib/medication-days";
import { medicationTracksMood, medicationTracksPain, type WellbeingMetric } from "@/lib/pain-mood";
import { generateDaySlots, slotDueTime } from "@/lib/schedule";
import { getSideEffects } from "@/lib/side-effects";
import { supabase } from "@/lib/supabase/client";
import type {
  DoseHistoryEntry,
  DoseLog,
  DoseLogStatus,
  Medication,
  MedicationDoseChange,
  MedicationStatusEvent,
  SideEffect,
  StandalonePainMoodLog,
} from "@/lib/types/medications";
import type { ProfileAllergyWithName } from "@/lib/types/profile";
import { formatLongDate, formatMedicationNameDose, localDateFromTimestamp, localDateString } from "@/lib/utils";

export const MISSED_DOSE_DISPLAY_CAP = 25;

export interface ReportOptions {
  profileId: string | null;
  patientName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  medications: Medication[]; // active + inactive, already scoped to the selected set
  includePain: boolean;
  includeMood: boolean;
}

export interface AdherenceBreakoutRow {
  medication: Medication;
  percent: number;
  scheduled: number;
  missed: number;
}

export interface CurrentMedicationRow {
  medication: Medication;
  /** Long date of the latest "resumed" event, if any. */
  resumedOn: string | null;
}

export interface DiscontinuedRow {
  medication: Medication;
  event: MedicationStatusEvent | null;
}

export interface DoseChangeRow {
  medication: Medication;
  change: MedicationDoseChange;
  /** Timestamp of the change. */
  at: string;
}

export interface MissedDoseRow {
  medication: Medication;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  status: "missed" | "skipped";
}

export type SideEffectRow = SideEffect & { medication: Medication };

export interface TrendNoteEntry {
  date: string;
  time: string;
  source: "dose" | "standalone";
  medicationName: string;
  note: string;
  editedAt: string | null;
}

export interface ReportDailyAverage {
  date: string;
  level: number;
  /** At least one of the day's entries was a standalone log (hollow dot). */
  hasStandalone: boolean;
}

export interface MedicationTrend {
  medication: Medication;
  points: ReportDailyAverage[];
  notes: TrendNoteEntry[];
}

export interface ReportData {
  patientName: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  allergies: ProfileAllergyWithName[];
  overallAdherencePercent: number;
  dosesScheduled: number;
  dosesTaken: number;
  dosesMissed: number;
  dosesSkipped: number;
  adherenceBreakout: AdherenceBreakoutRow[];
  currentMedications: CurrentMedicationRow[];
  sideEffects: SideEffectRow[];
  discontinuedMedications: DiscontinuedRow[];
  doseChanges: DoseChangeRow[];
  missedDoseDetail: MissedDoseRow[];
  missedDoseDetailTotal: number;
  painTrends: MedicationTrend[];
  moodTrends: MedicationTrend[];
  moodChartScheme: MoodChartScheme;
}

function latestStatusEvent(
  entries: DoseHistoryEntry[],
  event: "discontinued" | "resumed",
): MedicationStatusEvent | null {
  const matches = entries.filter(
    (e): e is Extract<DoseHistoryEntry, { type: "status_event" }> =>
      e.type === "status_event" && e.data.event === event,
  );
  if (matches.length === 0) return null;
  return matches.reduce((latest, cur) => (cur.at > latest.at ? cur : latest)).data;
}

function datesInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  while (cursor <= end) {
    dates.push(localDateString(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

interface ReportSlot {
  medicationId: string;
  date: string;
  scheduledTime: string;
  status: DoseLogStatus | "pending";
}

// See the header comment: regenerates each date's required slots for
// currently-active medications and reclassifies past-due pending slots as
// missed. Uses each medication's current `active` flag rather than
// replaying status history, matching lib/calendar.ts's simplification.
function reportSlotsForDate(
  date: string,
  medications: Medication[],
  logs: CalendarLogRow[],
  now: number,
  graceMinutes: number,
): ReportSlot[] {
  const medsForDate = medications.filter(
    (m) => m.active && !m.as_needed && date >= (m.start_date ?? m.created_at.slice(0, 10)),
  );
  if (medsForDate.length === 0) return [];
  const dayLogs = logs.filter((l) => l.scheduled_for_date === date);
  const slots = generateDaySlots(date, medsForDate, [], [], dayLogs, [], { ignoreDashboardVisibility: true });

  // generateDaySlots matches a log to its slot by exact medication+time. A
  // dose logged at a different time than scheduled (postponed, or logged
  // as 05:35 against a 05:30 slot) is therefore left unmatched and its slot
  // looks pending. Pair each such orphan log with that medication's
  // unmatched slots (in time order) so the resolved status isn't lost.
  const slotKeys = new Set(slots.map((s) => `${s.medicationId}|${s.scheduledTime.slice(0, 5)}`));
  const orphansByMed = new Map<string, CalendarLogRow[]>();
  for (const l of dayLogs) {
    if (slotKeys.has(`${l.medication_id}|${l.scheduled_time.slice(0, 5)}`)) continue;
    const list = orphansByMed.get(l.medication_id) ?? [];
    list.push(l);
    orphansByMed.set(l.medication_id, list);
  }
  for (const list of orphansByMed.values()) list.sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));
  const resolved = slots.map((s) => {
    if (s.status !== "pending") return s;
    const orphan = orphansByMed.get(s.medicationId)?.shift();
    return orphan ? { ...s, status: orphan.status } : s;
  });

  return resolved.map((s) => ({

    medicationId: s.medicationId,
    date,
    scheduledTime: s.scheduledTime,
    status: s.status === "pending" && now > slotDueTime(s, date) + graceMinutes * 60_000 ? "missed" : s.status,
  }));
}

// ── Per-medication pain/mood trend (matches web's getTrend(metric, medId)) ──

interface ReportTrendPoint {
  date: string;
  time: string;
  level: number;
  source: "dose" | "standalone";
  note: string;
  editedAt: string | null;
}

type TrendDoseRow = Pick<
  DoseLog,
  "scheduled_for_date" | "scheduled_time" | "pain_level" | "mood_level" | "note" | "feedback_edited_at"
>;

async function getMedicationTrendPoints(
  metric: WellbeingMetric,
  medicationId: string,
  startDate: string,
  endDate: string,
): Promise<ReportTrendPoint[]> {
  const col = metric === "pain" ? "pain_level" : "mood_level";
  // logged_at is a UTC instant; bound it by the local start/end of day.
  const startIso = new Date(`${startDate}T00:00:00`).toISOString();
  const endIso = new Date(`${endDate}T23:59:59.999`).toISOString();
  const [doseRes, standaloneRes] = await Promise.all([
    supabase
      .from("dose_logs")
      .select("scheduled_for_date, scheduled_time, pain_level, mood_level, note, feedback_edited_at")
      .eq("medication_id", medicationId)
      .not(col, "is", null)
      .gte("scheduled_for_date", startDate)
      .lte("scheduled_for_date", endDate),
    supabase
      .from("standalone_pain_mood_logs")
      .select("*")
      .eq("medication_id", medicationId)
      .not(col, "is", null)
      .gte("logged_at", startIso)
      .lte("logged_at", endIso),
  ]);
  if (doseRes.error) throw doseRes.error;
  if (standaloneRes.error) throw standaloneRes.error;

  const dosePoints = (doseRes.data as TrendDoseRow[]).map<ReportTrendPoint>((row) => ({
    date: row.scheduled_for_date,
    time: row.scheduled_time.slice(0, 5),
    level: row[col] as number,
    source: "dose",
    note: row.note ?? "",
    editedAt: row.feedback_edited_at,
  }));
  const standalonePoints = (standaloneRes.data as StandalonePainMoodLog[]).map<ReportTrendPoint>((log) => {
    const at = new Date(log.logged_at);
    return {
      date: localDateString(at),
      time: `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`,
      level: log[col] as number,
      source: "standalone",
      note: log.note ?? "",
      editedAt: log.updated_at,
    };
  });
  return [...dosePoints, ...standalonePoints].sort((a, b) =>
    `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`),
  );
}

function groupDailyAverages(points: ReportTrendPoint[]): ReportDailyAverage[] {
  const byDate = new Map<string, { sum: number; count: number; hasStandalone: boolean }>();
  for (const p of points) {
    const acc = byDate.get(p.date) ?? { sum: 0, count: 0, hasStandalone: false };
    acc.sum += p.level;
    acc.count += 1;
    if (p.source === "standalone") acc.hasStandalone = true;
    byDate.set(p.date, acc);
  }
  return Array.from(byDate.entries())
    .map(([date, { sum, count, hasStandalone }]) => ({ date, level: sum / count, hasStandalone }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildNotes(medicationName: string, points: ReportTrendPoint[]): TrendNoteEntry[] {
  return points
    .filter((p) => p.note.trim().length > 0)
    .map((p) => ({
      date: p.date,
      time: p.time,
      source: p.source,
      medicationName,
      note: p.note,
      editedAt: p.editedAt,
    }));
}

async function medicationTrends(
  metric: WellbeingMetric,
  medications: Medication[],
  startDate: string,
  endDate: string,
): Promise<MedicationTrend[]> {
  const raw = await Promise.all(medications.map((m) => getMedicationTrendPoints(metric, m.id, startDate, endDate)));
  return medications.map((medication, i) => ({
    medication,
    points: groupDailyAverages(raw[i]),
    notes: buildNotes(formatMedicationNameDose(medication), raw[i]),
  }));
}

export async function buildReportData(options: ReportOptions): Promise<ReportData> {
  const { profileId, patientName, startDate, endDate, includePain, includeMood } = options;

  // Only medications in use on at least one day of the reporting period
  // belong in the report; ones discontinued before it started (or started
  // after it ended) are left out of every section.
  const allDoseHistories = await Promise.all(options.medications.map((m) => getDoseHistory(m.id)));
  const medications = options.medications.filter((m, i) =>
    wasActiveDuring(
      m.start_date ?? m.created_at.slice(0, 10),
      allDoseHistories[i]
        .filter((e): e is Extract<DoseHistoryEntry, { type: "status_event" }> => e.type === "status_event")
        .map((e) => e.data),
      startDate,
      endDate,
      m.end_date,
    ),
  );
  const doseHistoryByMed = new Map(
    options.medications.map((m, i) => [m.id, allDoseHistories[i]] as const),
  );
  const medicationIds = medications.map((m) => m.id);
  const medById = new Map(medications.map((m) => [m.id, m]));

  const painMeds = includePain ? medications.filter(medicationTracksPain) : [];
  const moodMeds = includeMood ? medications.filter(medicationTracksMood) : [];

  const [logs, allergies, sideEffectLists, graceMinutes, moodChartScheme, painTrends, moodTrends] = await Promise.all([
    getCalendarLogs(startDate, endDate, medicationIds),
    getProfileAllergies(profileId),
    Promise.all(medications.map((m) => getSideEffects(m.id))),
    getMissedGraceMinutes(),
    getMoodChartScheme(),
    medicationTrends("pain", painMeds, startDate, endDate),
    medicationTrends("mood", moodMeds, startDate, endDate),
  ]);

  const currentMedications: CurrentMedicationRow[] = medications
    .filter((m) => m.active)
    .map((medication) => {
      const resumed = latestStatusEvent(doseHistoryByMed.get(medication.id) ?? [], "resumed");
      return {
        medication,
        resumedOn: resumed ? formatLongDate(localDateFromTimestamp(resumed.event_at)) : null,
      };
    });
  const discontinuedMedications: DiscontinuedRow[] = medications
    .filter((m) => !m.active)
    .map((medication) => ({
      medication,
      event: latestStatusEvent(doseHistoryByMed.get(medication.id) ?? [], "discontinued"),
    }));

  // Limited to the reporting period (the section says "during this period").
  const doseChanges: DoseChangeRow[] = medications
    .flatMap((medication) =>
      (doseHistoryByMed.get(medication.id) ?? [])
        .filter((e): e is Extract<DoseHistoryEntry, { type: "dose_change" }> => e.type === "dose_change")
        .filter((e) => {
          const day = localDateFromTimestamp(e.at);
          return day >= startDate && day <= endDate;
        })
        .map((e) => ({ medication, change: e.data, at: e.at })),
    )
    .sort((a, b) => b.at.localeCompare(a.at));

  const now = Date.now();
  const activeRequiredMeds = medications.filter((m) => m.active && !m.as_needed);
  const reportDates = datesInRange(startDate, endDate).filter((d) => d <= localDateString());
  const resolvedSlots = reportDates
    .flatMap((date) => reportSlotsForDate(date, activeRequiredMeds, logs, now, graceMinutes))
    .filter((s): s is ReportSlot & { status: DoseLogStatus } => s.status !== "pending");

  const adherenceEligibleIds = new Set(
    medications.filter((m) => m.active && !m.as_needed && m.adherence_enabled).map((m) => m.id),
  );
  const eligibleSlots = resolvedSlots.filter((s) => adherenceEligibleIds.has(s.medicationId));
  const overallAdherencePercent = computeAdherence(eligibleSlots);
  const adherenceBreakout: AdherenceBreakoutRow[] = medications
    .filter((m) => adherenceEligibleIds.has(m.id))
    .map((medication) => {
      const medSlots = eligibleSlots.filter((s) => s.medicationId === medication.id);
      return {
        medication,
        percent: computeAdherence(medSlots),
        scheduled: medSlots.length,
        missed: medSlots.filter((s) => s.status !== "taken").length,
      };
    })
    .filter((row) => row.scheduled > 0 && row.percent !== overallAdherencePercent);

  // Missed + skipped: regenerated slots for active required medications,
  // plus real dose_logs rows for any other medication in the report.
  const activeRequiredMedIds = new Set(activeRequiredMeds.map((m) => m.id));
  const fromSlots: MissedDoseRow[] = resolvedSlots.flatMap((s) => {
    const medication = medById.get(s.medicationId);
    return medication && (s.status === "missed" || s.status === "skipped")
      ? [{ medication, date: s.date, time: s.scheduledTime, status: s.status }]
      : [];
  });
  const fromLogs: MissedDoseRow[] = logs.flatMap((l) => {
    const medication = medById.get(l.medication_id);
    return medication && !activeRequiredMedIds.has(l.medication_id) && (l.status === "missed" || l.status === "skipped")
      ? [{ medication, date: l.scheduled_for_date, time: l.scheduled_time.slice(0, 5), status: l.status }]
      : [];
  });
  const missedDoseDetailAll = [...fromSlots, ...fromLogs].sort((a, b) =>
    a.date !== b.date ? b.date.localeCompare(a.date) : b.time.localeCompare(a.time),
  );

  const sideEffects: SideEffectRow[] = medications
    .flatMap((medication, i) =>
      sideEffectLists[i]
        .filter((se) => se.occurred_date >= startDate && se.occurred_date <= endDate)
        .map((se) => ({ ...se, medication })),
    )
    .sort((a, b) => b.occurred_date.localeCompare(a.occurred_date));

  return {
    patientName,
    startDate,
    endDate,
    generatedAt: new Date().toLocaleString(),
    allergies,
    overallAdherencePercent,
    dosesScheduled: eligibleSlots.length,
    dosesTaken: eligibleSlots.filter((s) => s.status === "taken").length,
    dosesMissed: eligibleSlots.filter((s) => s.status === "missed").length,
    dosesSkipped: eligibleSlots.filter((s) => s.status === "skipped").length,
    adherenceBreakout,
    currentMedications,
    sideEffects,
    discontinuedMedications,
    doseChanges,
    missedDoseDetail: missedDoseDetailAll.slice(0, MISSED_DOSE_DISPLAY_CAP),
    missedDoseDetailTotal: missedDoseDetailAll.length,
    painTrends,
    moodTrends,
    moodChartScheme,
  };
}
