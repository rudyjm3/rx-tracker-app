// Shared look-and-feel for the Doctor Visit Report, used by both the PDF
// HTML (lib/report-html.ts) and the on-screen preview
// (components/export/report-summary.tsx). Values come from rx-tracker-web's
// components/export/DoctorVisitReportPdf.tsx so the two platforms match.
import type { MoodChartScheme } from "@/lib/app-settings";
import { levelColor, type WellbeingMetric } from "@/lib/pain-mood";
import type { FeedbackType, Medication, MedicationDoseChange, MedicationType } from "@/lib/types/medications";
import type { ReportDailyAverage } from "@/lib/export";
import { to12h } from "@/lib/utils";

export const REPORT_COLORS = {
  navy: "#102b57",
  darkNavy: "#071d3d",
  blue: "#0a8ac8",
  cyan: "#14cfe0",
  text: "#172033",
  muted: "#60708a",
  border: "#d7e6f8",
  success: "#18bfa6",
  warning: "#f5a524",
  danger: "#e5484d",
  purple: "#8b5cf6",
  cardBg: "#f6faff",
  headerSubtitle: "#cfe6f7",
} as const;

export const MED_TYPE_STYLES: Record<MedicationType, { bg: string; color: string; label: string }> = {
  prescription: { bg: "#0754a81a", color: "#0754a8", label: "Rx" },
  otc: { bg: "#0a8ac81a", color: REPORT_COLORS.blue, label: "OTC" },
  supplement: { bg: "#f5a5241a", color: REPORT_COLORS.warning, label: "Supplement" },
};

export function feedbackChips(feedbackType: FeedbackType): { label: string; color: string }[] {
  const chips: { label: string; color: string }[] = [];
  if (feedbackType === "pain" || feedbackType === "both") chips.push({ label: "Pain", color: REPORT_COLORS.warning });
  if (feedbackType === "mood" || feedbackType === "both") chips.push({ label: "Mood", color: REPORT_COLORS.purple });
  return chips;
}

export function adherenceColor(percent: number): string {
  if (percent >= 80) return REPORT_COLORS.success;
  if (percent >= 50) return REPORT_COLORS.warning;
  return REPORT_COLORS.danger;
}

export function allergyTypeLabel(type: string): string {
  return type === "allergy" ? "Allergy" : "Intolerance";
}

/** Same wording as web's report formatSchedule(). */
export function formatReportSchedule(med: Medication): string {
  if (med.as_needed) return "As needed";
  if (med.schedule_mode === "interval" && med.interval_hours && med.first_dose_time) {
    return `Every ${med.interval_hours}h from ${to12h(med.first_dose_time.slice(0, 5))}`;
  }
  const times = med.medication_schedule_times ?? [];
  if (times.length === 0) return "—";
  return times.map((t) => to12h(t.reminder_time.slice(0, 5))).join(", ");
}

export function formatDoseChange(change: MedicationDoseChange): string {
  const from = change.old_dose_amount != null ? `${change.old_dose_amount}${change.old_dose_unit}` : null;
  const to = change.new_dose_amount != null ? `${change.new_dose_amount}${change.new_dose_unit}` : null;
  if (from && to) return `${from} → ${to}`;
  if (to) return `Set to ${to}`;
  if (from) return `Removed from ${from}`;
  return "—";
}

// ── Adherence ring (arc path, as in the web PDF) ─────────────────────

function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

export function ringArcPath(cx: number, cy: number, r: number, percent: number): string | null {
  if (percent <= 0) return null;
  const sweep = Math.min(percent, 99.99) * 3.6;
  const start = polarPoint(cx, cy, r, 0);
  const end = polarPoint(cx, cy, r, sweep);
  const largeArcFlag = sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

// ── Trend chart geometry (as in the web PDF's TrendChartPdf) ─────────

export const TREND_Y_TICKS = [1, 3, 5, 7, 10];

export interface TrendChartGeometry {
  width: number;
  height: number;
  padX: number;
  tickY: { tick: number; y: number }[];
  dots: { x: number; y: number; color: string; hollow: boolean; date: string }[];
  polyline: string;
  lineColor: string;
}

export function trendChartGeometry(
  points: ReportDailyAverage[],
  metric: WellbeingMetric,
  width: number,
  height: number,
  scheme?: MoodChartScheme,
): TrendChartGeometry {
  const padX = 28;
  const padY = 14;
  const innerWidth = width - padX * 2;
  const innerHeight = height - padY * 2;
  const yFor = (level: number) => padY + (1 - (level - 1) / 9) * innerHeight;
  const minTime = points.length ? new Date(points[0].date).getTime() : 0;
  const maxTime = points.length ? new Date(points[points.length - 1].date).getTime() : 0;
  const span = Math.max(1, maxTime - minTime);
  const dots = points.map((p) => ({
    x: padX + ((new Date(p.date).getTime() - minTime) / span) * innerWidth,
    y: yFor(p.level),
    color: levelColor(metric, p.level, metric === "mood" ? scheme : "classic"),
    hollow: p.hasStandalone,
    date: p.date,
  }));
  return {
    width,
    height,
    padX,
    tickY: TREND_Y_TICKS.map((tick) => ({ tick, y: yFor(tick) })),
    dots,
    polyline: dots.map((d) => `${d.x},${d.y}`).join(" "),
    lineColor: metric === "mood" ? REPORT_COLORS.cyan : REPORT_COLORS.blue,
  };
}

export function averageLevel(points: ReportDailyAverage[]): string {
  return points.length ? (points.reduce((sum, p) => sum + p.level, 0) / points.length).toFixed(1) : "—";
}

export const REPORT_DISCLAIMER =
  "RxTracker is a self-tracking aid and does not provide medical advice or clinical decision support. This report reflects patient-logged data only and has not been independently verified. Always consult your healthcare provider.";

export const PAIN_SECTION_DESC =
  "Recorded after doses and as standalone logs for medications with pain tracking enabled. Chart shows daily pain level (1–10) over the reporting period. Hollow circles indicate standalone log entries.";
export const MOOD_SECTION_DESC =
  "Recorded after doses and as standalone logs for medications with mood tracking enabled. Chart shows daily mood level (1–10) over the reporting period. Hollow circles indicate standalone log entries.";
