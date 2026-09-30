// Doctor visit report — port of rx-tracker-web's ExportClient.tsx +
// DoctorVisitReportPdf.tsx, scoped down for this app's first pass. Web
// renders a fully laid-out branded PDF (via @react-pdf/renderer) with
// per-medication pain/mood trend charts; this app instead builds a plain
// HTML document and hands it to expo-print, which is what actually
// produces the PDF — no charting library, so trend data is presented as a
// compact table (date → level) rather than a rendered chart image. Pain/
// mood trends are also a single merged summary rather than one block per
// tracked medication, consistent with this app's Pain & Mood tab already
// showing one merged feed instead of web's per-medication pages (see
// lib/pain-mood.ts's own header comment).
import { computeAdherence } from "@/lib/adherence";
import { getProfileAllergies } from "@/lib/allergies";
import { getMissedGraceMinutes } from "@/lib/app-settings";
import { getCalendarLogs, type CalendarLogRow } from "@/lib/dose-logs";
import { getDoseHistory } from "@/lib/medications";
import { getTrend, groupDailyAverages, type WellbeingMetric } from "@/lib/pain-mood";
import { generateDaySlots, slotDueTime } from "@/lib/schedule";
import { getSideEffects } from "@/lib/side-effects";
import type {
  DoseHistoryEntry,
  DoseLogStatus,
  Medication,
  MedicationDoseChange,
  MedicationStatusEvent,
  SideEffect,
} from "@/lib/types/medications";
import type { ProfileAllergyWithName } from "@/lib/types/profile";
import { localDateString, scheduleSummary } from "@/lib/utils";

const MISSED_DOSE_DISPLAY_CAP = 25;

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

export interface DoseChangeRow {
  medication: Medication;
  change: MedicationDoseChange;
}

export interface DiscontinuedRow {
  medication: Medication;
  event: MedicationStatusEvent | null;
}

export interface TrendSummary {
  metric: WellbeingMetric;
  points: { date: string; level: number }[];
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
  currentMedications: Medication[];
  discontinuedMedications: DiscontinuedRow[];
  doseChanges: DoseChangeRow[];
  missedDoseDetail: { medicationName: string; date: string; time: string }[];
  missedDoseDetailTotal: number;
  sideEffects: (SideEffect & { medicationName: string })[];
  painTrend: TrendSummary | null;
  moodTrend: TrendSummary | null;
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

// This app never writes a finalized "missed" dose_logs row for a slot the
// user never touched (see lib/calendar.ts's header comment) — a required
// dose nobody logged just has no row at all. Reading dose_logs alone (the
// original approach here) therefore silently drops every untouched dose
// from both the adherence percentage and the missed-dose list: a patient
// who took 1 of 10 scheduled doses and ignored the rest would read as
// "100% adherence, 1 scheduled." Regenerating each date's required slots
// the same way the dashboard does — via generateDaySlots, matched against
// the real dose_logs already fetched — and reclassifying any slot still
// "pending" once its due time plus the grace period has passed as
// "missed" recovers those untouched doses without needing a real
// finalized row. Scoped to *active* medications only (no groups needed,
// since a PRN medication's slots come from group membership but PRN is
// already excluded here) — matches lib/calendar.ts's own documented
// simplification of using each medication's current `active` flag rather
// than replaying status-event history for past dates.
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
  return slots.map((s) => ({
    medicationId: s.medicationId,
    date,
    scheduledTime: s.scheduledTime,
    status: s.status === "pending" && now > slotDueTime(s, date) + graceMinutes * 60_000 ? "missed" : s.status,
  }));
}

export async function buildReportData(options: ReportOptions): Promise<ReportData> {
  const { profileId, patientName, startDate, endDate, medications, includePain, includeMood } = options;
  const medicationIds = medications.map((m) => m.id);

  const [logs, allergies, doseHistories, sideEffectLists, graceMinutes] = await Promise.all([
    getCalendarLogs(startDate, endDate, medicationIds),
    getProfileAllergies(profileId),
    Promise.all(medications.map((m) => getDoseHistory(m.id))),
    Promise.all(medications.map((m) => getSideEffects(m.id))),
    getMissedGraceMinutes(),
  ]);

  const doseHistoryByMed = new Map(medications.map((m, i) => [m.id, doseHistories[i]]));
  const medNameById = new Map(medications.map((m) => [m.id, m.name]));

  const currentMedications = medications.filter((m) => m.active);
  const discontinuedMedications: DiscontinuedRow[] = medications
    .filter((m) => !m.active)
    .map((medication) => ({
      medication,
      event: latestStatusEvent(doseHistoryByMed.get(medication.id) ?? [], "discontinued"),
    }));

  const doseChanges: DoseChangeRow[] = medications
    .flatMap((medication) =>
      (doseHistoryByMed.get(medication.id) ?? [])
        .filter((e): e is Extract<DoseHistoryEntry, { type: "dose_change" }> => e.type === "dose_change")
        .filter((e) => e.at.slice(0, 10) >= startDate && e.at.slice(0, 10) <= endDate)
        .map((e) => ({ medication, change: e.data })),
    )
    .sort((a, b) => b.change.changed_at.localeCompare(a.change.changed_at));

  // Regenerated per-day slots (see reportSlotsForDate's doc comment) for
  // every currently-active required medication in the report range, so
  // untouched-but-due doses count as missed instead of vanishing. Scoped
  // to active medications only; a currently-inactive medication's real
  // dose_logs rows (still legitimate history) are folded back in below
  // for the missed-dose list, the same way it always was.
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
  const dosesScheduled = eligibleSlots.length;
  const dosesTaken = eligibleSlots.filter((s) => s.status === "taken").length;
  const dosesMissed = eligibleSlots.filter((s) => s.status === "missed").length;
  const dosesSkipped = eligibleSlots.filter((s) => s.status === "skipped").length;
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

  // Missed-dose detail: every resolved-missed slot across active required
  // medications (real dose_logs rows and untouched-past-grace slots
  // alike, per resolvedSlots above) plus real missed dose_logs rows
  // belonging to a currently-inactive medication, which resolvedSlots
  // deliberately doesn't regenerate slots for.
  const missedFromActive = resolvedSlots
    .filter((s) => s.status === "missed")
    .map((s) => ({
      medicationName: medNameById.get(s.medicationId) ?? "Medication",
      date: s.date,
      time: s.scheduledTime,
    }));
  const activeRequiredMedIds = new Set(activeRequiredMeds.map((m) => m.id));
  const missedFromInactive = logs
    .filter((l) => l.status === "missed" && !activeRequiredMedIds.has(l.medication_id))
    .map((l) => ({
      medicationName: l.medications.name,
      date: l.scheduled_for_date,
      time: l.scheduled_time.slice(0, 5),
    }));
  const missedDoseDetailAll = [...missedFromActive, ...missedFromInactive].sort((a, b) =>
    a.date !== b.date ? b.date.localeCompare(a.date) : b.time.localeCompare(a.time),
  );
  const missedDoseDetail = missedDoseDetailAll.slice(0, MISSED_DOSE_DISPLAY_CAP);

  const sideEffects = medications
    .flatMap((medication, i) =>
      sideEffectLists[i]
        .filter((se) => se.occurred_date >= startDate && se.occurred_date <= endDate)
        .map((se) => ({ ...se, medicationName: medNameById.get(medication.id) ?? medication.name })),
    )
    .sort((a, b) => b.occurred_date.localeCompare(a.occurred_date));

  async function trendSummary(metric: WellbeingMetric, enabled: boolean): Promise<TrendSummary | null> {
    if (!enabled) return null;
    // getTrend's default "All" scope (medicationFilter left undefined)
    // otherwise resolves every one of the profile's medications on its
    // own, ignoring which ones the report screen's checklist excluded —
    // passing medicationIds as the pre-resolved scope makes it use just
    // the selected set instead, while still including independent
    // (medication_id null) standalone entries regardless of the
    // selection, same as the Pain & Mood tab's own "All" filter.
    const points = await getTrend(metric, startDate, endDate, profileId, undefined, medicationIds);
    if (points.length === 0) return { metric, points: [] };
    return { metric, points: groupDailyAverages(points) };
  }
  const [painTrend, moodTrend] = await Promise.all([
    trendSummary("pain", includePain),
    trendSummary("mood", includeMood),
  ]);

  return {
    patientName,
    startDate,
    endDate,
    generatedAt: new Date().toLocaleString(),
    allergies,
    overallAdherencePercent,
    dosesScheduled,
    dosesTaken,
    dosesMissed,
    dosesSkipped,
    adherenceBreakout,
    currentMedications,
    discontinuedMedications,
    doseChanges,
    missedDoseDetail,
    missedDoseDetailTotal: missedDoseDetailAll.length,
    sideEffects,
    painTrend,
    moodTrend,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function medicationLabel(m: Medication): string {
  return escapeHtml(m.dose ? `${m.name} — ${m.dose}` : m.name);
}

function section(title: string, body: string): string {
  return `<section><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function table(headers: string[], rows: string[][]): string {
  const head = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
  return `<table>${head}${body}</table>`;
}

function trendTable(trend: TrendSummary): string {
  if (trend.points.length === 0) {
    return `<p class="muted">No ${trend.metric} data recorded for this period.</p>`;
  }
  return table(
    ["Date", "Level (avg)"],
    trend.points.map((p) => [escapeHtml(formatDate(p.date)), p.level.toFixed(1)]),
  );
}

// Renders the compiled report data as a standalone, print-friendly HTML
// document — the input Print.printToFileAsync({ html }) actually
// rasterizes into the PDF.
export function renderReportHtml(data: ReportData): string {
  const adherenceSection = section(
    "Adherence Summary",
    `<p><strong>${data.overallAdherencePercent}%</strong> overall (${data.dosesTaken} taken / ${data.dosesScheduled} scheduled — ${data.dosesMissed} missed, ${data.dosesSkipped} skipped)</p>` +
      (data.adherenceBreakout.length > 0
        ? table(
            ["Medication", "Adherence", "Scheduled", "Missed/Skipped"],
            data.adherenceBreakout.map((row) => [
              medicationLabel(row.medication),
              `${row.percent}%`,
              String(row.scheduled),
              String(row.missed),
            ]),
          )
        : ""),
  );

  const currentMedsSection = section(
    "Current Medications",
    data.currentMedications.length === 0
      ? `<p class="muted">No active medications.</p>`
      : table(
          ["Medication", "Schedule"],
          data.currentMedications.map((m) => [medicationLabel(m), escapeHtml(scheduleSummary(m))]),
        ),
  );

  const discontinuedSection =
    data.discontinuedMedications.length > 0
      ? section(
          "Discontinued Medications",
          table(
            ["Medication", "Discontinued on", "Reason"],
            data.discontinuedMedications.map(({ medication, event }) => [
              medicationLabel(medication),
              event ? escapeHtml(formatDate(event.event_at.slice(0, 10))) : "—",
              event?.reason ? escapeHtml(event.reason) : "—",
            ]),
          ),
        )
      : "";

  const doseChangesSection =
    data.doseChanges.length > 0
      ? section(
          "Dose Changes",
          table(
            ["Medication", "Date", "Change", "Comment"],
            data.doseChanges.map(({ medication, change }) => [
              medicationLabel(medication),
              escapeHtml(formatDate(change.changed_at.slice(0, 10))),
              `${change.old_dose_amount ?? "—"}${escapeHtml(change.old_dose_unit)} → ${change.new_dose_amount ?? "—"}${escapeHtml(change.new_dose_unit)}`,
              change.comment ? escapeHtml(change.comment) : "—",
            ]),
          ),
        )
      : "";

  const missedSection =
    data.missedDoseDetail.length > 0
      ? section(
          "Missed Doses",
          table(
            ["Medication", "Date", "Time"],
            data.missedDoseDetail.map((row) => [
              escapeHtml(row.medicationName),
              escapeHtml(formatDate(row.date)),
              escapeHtml(row.time),
            ]),
          ) +
            (data.missedDoseDetailTotal > data.missedDoseDetail.length
              ? `<p class="muted">Showing ${data.missedDoseDetail.length} of ${data.missedDoseDetailTotal} missed doses in this period.</p>`
              : ""),
        )
      : "";

  const sideEffectsSection =
    data.sideEffects.length > 0
      ? section(
          "Side Effects",
          table(
            ["Medication", "Date", "Severity", "Description"],
            data.sideEffects.map((se) => [
              escapeHtml(se.medicationName),
              escapeHtml(formatDate(se.occurred_date)),
              escapeHtml(se.severity),
              escapeHtml(se.description),
            ]),
          ),
        )
      : "";

  const allergiesSection = section(
    "Allergies",
    data.allergies.length === 0
      ? `<p class="muted">None recorded.</p>`
      : `<ul>${data.allergies
          .map(
            (a) =>
              `<li>${escapeHtml(a.name)}${a.life_threatening ? " (life-threatening)" : a.severity ? ` (${escapeHtml(a.severity)})` : ""}</li>`,
          )
          .join("")}</ul>`,
  );

  const painSection = data.painTrend ? section("Pain Trend", trendTable(data.painTrend)) : "";
  const moodSection = data.moodTrend ? section("Mood Trend", trendTable(data.moodTrend)) : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #172033; padding: 24px; font-size: 12px; }
  h1 { font-size: 20px; color: #102B57; margin-bottom: 2px; }
  .subtitle { color: #60708A; font-size: 12px; margin-bottom: 20px; }
  h2 { font-size: 14px; color: #102B57; border-bottom: 1px solid #D7E6F8; padding-bottom: 4px; margin-top: 20px; }
  section { margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #EAF4FF; font-size: 11px; }
  th { color: #60708A; font-weight: 600; }
  .muted { color: #60708A; font-style: italic; }
  ul { margin: 4px 0; padding-left: 18px; }
</style>
</head>
<body>
  <h1>RxTracker Doctor Visit Report</h1>
  <p class="subtitle">
    ${escapeHtml(data.patientName || "Patient")} · ${escapeHtml(formatDate(data.startDate))} – ${escapeHtml(formatDate(data.endDate))}
    · Generated ${escapeHtml(data.generatedAt)}
  </p>
  ${adherenceSection}
  ${currentMedsSection}
  ${discontinuedSection}
  ${doseChangesSection}
  ${missedSection}
  ${sideEffectsSection}
  ${allergiesSection}
  ${painSection}
  ${moodSection}
</body>
</html>`;
}
