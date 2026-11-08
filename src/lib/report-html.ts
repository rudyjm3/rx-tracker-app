// Doctor Visit Report as a print-ready HTML document for
// Print.printToFileAsync — a port of rx-tracker-web's
// components/export/DoctorVisitReportPdf.tsx (A4, dark navy header with
// the app logo, stat tiles + adherence ring, badge/chip medication
// labels, per-medication SVG trend charts with patient notes, and the
// disclaimer footer). Section order, titles, descriptions, columns and
// empty-state text all match the web PDF.
import type { MoodChartScheme } from "@/lib/app-settings";
import type { MedicationTrend, ReportData, ReportDailyAverage, TrendNoteEntry } from "@/lib/export";
import type { WellbeingMetric } from "@/lib/pain-mood";
import { REPORT_LOGO_DATA_URI } from "@/lib/report-logo";
import {
  adherenceColor,
  averageLevel,
  allergyTypeLabel,
  feedbackChips,
  formatDoseChange,
  formatReportSchedule,
  MED_TYPE_STYLES,
  MOOD_SECTION_DESC,
  PAIN_SECTION_DESC,
  REPORT_COLORS as C,
  REPORT_DISCLAIMER,
  ringArcPath,
  trendChartGeometry,
} from "@/lib/report-visuals";
import type { Medication } from "@/lib/types/medications";
import { formatLongDate, formatPrescribedDose, formatShortDate, localDateFromTimestamp, to12h } from "@/lib/utils";

function esc(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain-text cell: escaped, or an em dash when empty (as web's PdfTable). */
function txt(value: string | number | null | undefined): string {
  const s = String(value ?? "").trim();
  return s ? esc(s) : "—";
}

function nameWithDose(med: Pick<Medication, "name" | "dose" | "dose_amount" | "dose_unit">): string {
  const dose = formatPrescribedDose(med);
  return `<span class="med-name">${esc(med.name)}</span>${dose ? ` <span class="med-dose">${esc(dose)}</span>` : ""}`;
}

function medicationLabel(med: Medication, annotation?: string | null): string {
  const type = MED_TYPE_STYLES[med.medication_type];
  const chips = feedbackChips(med.feedback_type)
    .map((c) => `<span class="chip" style="border-color:${c.color};color:${c.color}">${c.label}</span>`)
    .join("");
  return (
    `<div>${nameWithDose(med)}</div>` +
    `<div class="badges"><span class="badge" style="background:${type.bg};color:${type.color}">${type.label}</span>${chips}</div>` +
    (annotation ? `<div class="annotation">${esc(annotation)}</div>` : "")
  );
}

interface Column<T> {
  header: string;
  flex: number;
  render: (row: T) => string;
}

function table<T>(columns: Column<T>[], rows: T[], emptyLabel: string): string {
  if (rows.length === 0) return `<p class="empty">${esc(emptyLabel)}</p>`;
  const total = columns.reduce((sum, c) => sum + c.flex, 0);
  const cols = columns.map((c) => `<col style="width:${((c.flex / total) * 100).toFixed(2)}%">`).join("");
  const head = columns.map((c) => `<th>${esc(c.header)}</th>`).join("");
  const body = rows.map((r) => `<tr>${columns.map((c) => `<td>${c.render(r)}</td>`).join("")}</tr>`).join("");
  return `<table class="data"><colgroup>${cols}</colgroup><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// Sections whose table is at most this many rows are kept on one page so a
// heading is never stranded at the bottom of a page away from its rows.
const KEEP_TOGETHER_MAX_ROWS = 8;

function keepFor(rows: unknown[]): boolean {
  return rows.length <= KEEP_TOGETHER_MAX_ROWS;
}

function section(title: string, body: string, description?: string, keepTogether = false): string {
  return (
    `<section${keepTogether ? ' class="keep"' : ""}><h2>${esc(title)}</h2>` +
    (description ? `<p class="desc">${esc(description)}</p>` : "") +
    `${body}</section>`
  );
}

function statTile(label: string, value: number, color: string = C.text): string {
  return `<div class="tile"><div class="tile-value" style="color:${color}">${value}</div><div class="tile-label">${esc(label)}</div></div>`;
}

function adherenceRing(percent: number): string {
  const size = 64;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const color = adherenceColor(percent);
  const arc = ringArcPath(c, c, r, percent);
  return (
    `<div class="tile ring-tile">` +
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${c}" cy="${c}" r="${r}" stroke="${C.border}" stroke-width="${stroke}" fill="none"/>` +
    (arc ? `<path d="${arc}" stroke="${color}" stroke-width="${stroke}" fill="none" stroke-linecap="round"/>` : "") +
    `<text x="${c}" y="${c + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="${color}">${percent}%</text>` +
    `</svg><div class="tile-label ring-label">Overall adherence</div></div>`
  );
}

function trendChart(points: ReportDailyAverage[], metric: WellbeingMetric, scheme?: MoodChartScheme): string {
  if (points.length === 0) return `<p class="empty">No ${metric} level data recorded for this period.</p>`;
  const g = trendChartGeometry(points, metric, 480, 110, scheme);
  const grid = g.tickY
    .map(
      ({ tick, y }) =>
        `<line x1="${g.padX}" y1="${y}" x2="${g.width - g.padX}" y2="${y}" stroke="${C.border}" stroke-width="0.5"/>` +
        `<text x="2" y="${y + 3}" font-size="7" fill="${C.muted}">${tick}</text>`,
    )
    .join("");
  const dots = g.dots
    .map((d) =>
      d.hollow
        ? `<circle cx="${d.x}" cy="${d.y}" r="3" fill="#ffffff" stroke="${d.color}" stroke-width="1.5"/>`
        : `<circle cx="${d.x}" cy="${d.y}" r="3" fill="${d.color}"/>`,
    )
    .join("");
  return (
    `<div class="chart"><svg width="100%" viewBox="0 0 ${g.width} ${g.height}" preserveAspectRatio="xMinYMin meet">` +
    `${grid}<polyline points="${g.polyline}" stroke="${g.lineColor}" stroke-width="1.5" fill="none"/>${dots}</svg>` +
    `<div class="chart-axis"><span>${esc(formatShortDate(points[0].date))}</span><span>${esc(formatShortDate(points[points.length - 1].date))}</span></div></div>`
  );
}

function patientNotes(notes: TrendNoteEntry[]): string {
  if (notes.length === 0) return "";
  const byDate = new Map<string, TrendNoteEntry[]>();
  for (const n of notes) byDate.set(n.date, [...(byDate.get(n.date) ?? []), n]);
  const days = Array.from(byDate.keys())
    .sort()
    .map(
      (date) =>
        `<div class="note-day"><div class="note-date">${esc(formatLongDate(date))}</div>` +
        byDate
          .get(date)!
          .map(
            (n) =>
              `<div class="note">${esc(to12h(n.time))} <span class="muted">(${esc(n.source)} — ${esc(n.medicationName)}):</span> ${esc(n.note)}` +
              (n.editedAt ? ` <span class="edited">[edited ${esc(formatLongDate(n.editedAt.slice(0, 10)))}]</span>` : "") +
              `</div>`,
          )
          .join("") +
        `</div>`,
    )
    .join("");
  return `<div class="notes"><div class="notes-title">Patient notes:</div>${days}</div>`;
}

function trendSection(
  title: string,
  description: string,
  metric: WellbeingMetric,
  trends: MedicationTrend[],
  data: ReportData,
): string {
  if (trends.length === 0) return "";
  const label = metric === "pain" ? "Avg pain" : "Avg mood";
  // The section heading rides inside the first medication's keep-together
  // block, so it can't be stranded at a page bottom away from its chart.
  const heading = `<h2>${esc(title)}</h2><p class="desc">${esc(description)}</p>`;
  const blocks = trends
    .map(
      ({ medication, points, notes }, i) =>
        `<div class="trend"><div class="keep">${i === 0 ? heading : ""}${medicationLabel(medication)}` +
        `<p class="trend-meta">${esc(
          `Reporting period: ${formatShortDate(data.startDate)} – ${formatShortDate(data.endDate)}  |  ${label}: ${averageLevel(points)}/10  |  Days logged: ${points.length}`,
        )}</p>` +
        `${trendChart(points, metric, metric === "mood" ? data.moodChartScheme : undefined)}</div>${patientNotes(notes)}</div>`,
    )
    .join("");
  return `<section>${blocks}</section>`;
}

const STYLES = `
@page { size: A4; margin: 28pt 0 32pt; }
@page :first { margin-top: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: Helvetica, Arial, sans-serif; font-size: 9pt; color: ${C.text};
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.header { display: flex; align-items: center; gap: 16pt; background: ${C.darkNavy}; padding: 24pt 32pt; margin-bottom: 20pt; }
.logo { width: 48pt; height: 48pt; border-radius: 12pt; }
.title { font-size: 20pt; font-weight: 700; color: #fff; }
.subtitle { font-size: 9.5pt; color: ${C.headerSubtitle}; margin-top: 4pt; }
.body { padding: 0 32pt; }
section { margin-bottom: 16pt; }
.keep { page-break-inside: avoid; break-inside: avoid; }
h2, .desc { break-after: avoid; page-break-after: avoid; }
h2 { font-size: 12.5pt; font-weight: 700; color: ${C.navy}; margin: 0 0 4pt; }
.desc { font-size: 8.5pt; color: ${C.muted}; margin: 0 0 8pt; line-height: 1.4; }
.empty { font-size: 9pt; color: ${C.muted}; font-style: italic; margin: 0; }
table.data { width: 100%; border-collapse: collapse; table-layout: fixed; border-top: 1pt solid ${C.border}; }
table.data thead { display: table-header-group; }
table.data tr { page-break-inside: avoid; break-inside: avoid; }
table.data th { background: ${C.cardBg}; font-size: 7.5pt; font-weight: 700; color: ${C.muted}; text-transform: uppercase;
  text-align: left; padding: 6pt 4pt 6pt 8pt; }
table.data td { font-size: 8.5pt; color: ${C.text}; padding: 6pt 4pt 6pt 8pt; border-bottom: 1pt solid ${C.border};
  vertical-align: top; word-wrap: break-word; }
.med-name { font-size: 8.5pt; font-weight: 700; color: ${C.text}; }
.med-dose { font-size: 7.5pt; font-weight: 700; color: #6b7280; }
.badges { margin-top: 2pt; }
.badge { display: inline-block; font-size: 7pt; font-weight: 700; text-transform: uppercase; padding: 1.5pt 4pt;
  border-radius: 3pt; margin-right: 4pt; }
.chip { display: inline-block; font-size: 6.5pt; font-weight: 700; text-transform: uppercase; padding: 1pt 3.5pt;
  border-radius: 3pt; border: 1pt solid; margin-right: 3pt; }
.annotation { font-size: 7pt; color: ${C.muted}; margin-top: 1pt; }
.stats { display: flex; gap: 10pt; }
.tile { flex: 1; height: 90pt; background: ${C.cardBg}; border-radius: 8pt; overflow: hidden; display: flex; flex-direction: column; }
.tile-value { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 16pt; font-weight: 700; }
.tile-label { background: ${C.border}; padding: 4pt 2pt; font-size: 6.5pt; color: ${C.navy}; text-transform: uppercase; text-align: center; }
.ring-tile { flex: 1.3; align-items: center; justify-content: center; padding: 6pt; }
.ring-label { background: none; color: ${C.muted}; margin-top: 3pt; padding: 0; }
.trend { margin-bottom: 14pt; }
.trend-meta { font-size: 8.5pt; color: ${C.muted}; margin: 4pt 0 0; white-space: pre-wrap; }
.chart { margin-top: 4pt; }
.chart-axis { display: flex; justify-content: space-between; font-size: 8.5pt; color: ${C.muted}; margin-top: 2pt; }
.notes { margin-top: 8pt; }
.notes-title { font-size: 8.5pt; font-weight: 700; margin-bottom: 3pt; }
.note-day { margin-bottom: 4pt; page-break-inside: avoid; break-inside: avoid; }
.note-date { font-size: 8pt; font-weight: 700; color: ${C.navy}; margin-bottom: 1pt; }
.note { font-size: 8pt; margin-bottom: 1pt; }
.muted { color: ${C.muted}; }
.edited { font-size: 7pt; font-style: italic; color: ${C.muted}; }
.footer { margin: 8pt 32pt 20pt; border-top: 1pt solid ${C.border}; padding-top: 8pt; font-size: 7.5pt; color: ${C.muted}; line-height: 1.4; }
`;

export function renderReportHtml(data: ReportData): string {
  const header =
    `<div class="header"><img class="logo" src="${REPORT_LOGO_DATA_URI}" alt=""/><div>` +
    `<div class="title">Doctor Visit Report</div>` +
    `<div class="subtitle">Prepared by RxTracker • Patient: ${esc(data.patientName)}</div>` +
    `<div class="subtitle">Reporting period: ${esc(formatShortDate(data.startDate))} – ${esc(formatShortDate(data.endDate))} • Generated: ${esc(data.generatedAt)}</div>` +
    `</div></div>`;

  const allergies = section(
    "Known Allergies & Intolerances",
    table(
      [
        { header: "Substance", flex: 2, render: (a) => txt(a.name) },
        { header: "Type", flex: 1, render: (a) => allergyTypeLabel(a.allergy_type) },
      ],
      data.allergies,
      "No allergies recorded.",
    ),
    undefined,
    keepFor(data.allergies),
  );

  const adherence = section(
    "Adherence Summary",
    `<div class="stats">${adherenceRing(data.overallAdherencePercent)}` +
      statTile("Doses scheduled", data.dosesScheduled) +
      statTile("Doses taken", data.dosesTaken, C.success) +
      statTile("Doses missed", data.dosesMissed, C.danger) +
      statTile("Doses skipped", data.dosesSkipped, C.warning) +
      `</div>` +
      (data.adherenceBreakout.length > 0
        ? `<p class="desc" style="margin-top:8pt">Adherence by medication is broken out below where rates differ from the overall average.</p>` +
          table(
            [
              { header: "Medication", flex: 2, render: (r) => medicationLabel(r.medication) },
              {
                header: "Adherence",
                flex: 1,
                render: (r) => `<span style="font-weight:700;color:${adherenceColor(r.percent)}">${r.percent}%</span>`,
              },
              { header: "Missed", flex: 1, render: (r) => `${r.missed} of ${r.scheduled}` },
            ],
            data.adherenceBreakout,
            "",
          )
        : ""),
    undefined,
    true,
  );

  const current = section(
    "Current Medications",
    table(
      [
        {
          header: "Medication",
          flex: 2,
          render: (r) => medicationLabel(r.medication, r.resumedOn ? `(Resumed use on ${r.resumedOn})` : null),
        },
        { header: "Dose", flex: 1, render: (r) => txt(formatPrescribedDose(r.medication)) },
        {
          header: "Start Date",
          flex: 1,
          render: (r) => (r.medication.start_date ? esc(formatShortDate(r.medication.start_date)) : "—"),
        },
        { header: "Schedule", flex: 1.6, render: (r) => txt(formatReportSchedule(r.medication)) },
        { header: "Instructions", flex: 2, render: (r) => txt(r.medication.instructions) },
      ],
      data.currentMedications,
      "No medications selected for this report.",
    ),
    undefined,
    keepFor(data.currentMedications),
  );

  const sideEffects = section(
    "Reported Side Effects",
    table(
      [
        { header: "Date", flex: 1, render: (se) => esc(formatShortDate(se.occurred_date)) },
        { header: "Medication", flex: 1.4, render: (se) => nameWithDose(se.medication) },
        { header: "Severity", flex: 1, render: (se) => txt(se.severity) },
        { header: "Side Effect", flex: 1.6, render: (se) => txt(se.description) },
        { header: "Notes", flex: 1.6, render: (se) => txt(se.note) },
      ],
      data.sideEffects,
      "No side effects logged for this period.",
    ),
    "Patient-logged side effects for the reporting period, most recent first.",
    keepFor(data.sideEffects),
  );

  const discontinued = section(
    "Discontinued Medications",
    table(
      [
        { header: "Medication", flex: 2, render: (r) => medicationLabel(r.medication) },
        { header: "Dose", flex: 0.8, render: (r) => txt(formatPrescribedDose(r.medication)) },
        { header: "Reason", flex: 1, render: (r) => txt(r.event?.reason) },
        { header: "Notes", flex: 1.4, render: (r) => txt(r.event?.comment) },
        {
          header: "Date Discontinued",
          flex: 1,
          render: (r) => (r.event ? esc(formatShortDate(localDateFromTimestamp(r.event.event_at))) : "—"),
        },
      ],
      data.discontinuedMedications,
      "No discontinued medications for this profile.",
    ),
    "Medications the patient has stopped using, with the reason and notes recorded when use was discontinued.",
    keepFor(data.discontinuedMedications),
  );

  const doseChanges = section(
    "Dose Changes",
    table(
      [
        { header: "Date", flex: 1, render: (r) => esc(formatShortDate(localDateFromTimestamp(r.at))) },
        { header: "Medication", flex: 1.4, render: (r) => nameWithDose(r.medication) },
        { header: "Change", flex: 1, render: (r) => esc(formatDoseChange(r.change)) },
        { header: "Comment", flex: 1.6, render: (r) => txt(r.change.comment) },
      ],
      data.doseChanges,
      "No dose changes recorded during this period.",
    ),
    undefined,
    keepFor(data.doseChanges),
  );

  const extraMissed = data.missedDoseDetailTotal - data.missedDoseDetail.length;
  const missed = section(
    "Missed Dose Detail",
    table(
      [
        { header: "Date", flex: 1, render: (l) => esc(formatShortDate(l.date)) },
        { header: "Medication", flex: 1.6, render: (l) => nameWithDose(l.medication) },
        { header: "Scheduled Time", flex: 1, render: (l) => esc(to12h(l.time)) },
        {
          header: "Status",
          flex: 1,
          render: (l) =>
            `<span style="font-weight:700;color:${l.status === "missed" ? C.danger : C.warning}">${l.status === "missed" ? "Missed" : "Skipped"}</span>`,
        },
      ],
      data.missedDoseDetail,
      "No missed or skipped doses for this period.",
    ) +
      (extraMissed > 0
        ? `<p class="empty" style="margin-top:4pt">+ ${extraMissed} additional missed/skipped doses in this period (full list available in app).</p>`
        : ""),
    "Showing missed and skipped doses for the reporting period, most recent first.",
    keepFor(data.missedDoseDetail),
  );

  const pain = trendSection("Pain Level Tracking", PAIN_SECTION_DESC, "pain", data.painTrends, data);
  const mood = trendSection("Mood & Wellbeing Tracking", MOOD_SECTION_DESC, "mood", data.moodTrends, data);

  const footer =
    `<div class="footer"><div>${esc(REPORT_DISCLAIMER)}</div>` +
    `<div style="margin-top:3pt">Generated ${esc(data.generatedAt)}</div></div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>RxTracker Doctor Visit Report</title>
<style>${STYLES}</style>
</head>
<body>
${header}
<div class="body">
${allergies}
${adherence}
${current}
${sideEffects}
${discontinued}
${doseChanges}
${missed}
${pain}
${mood}
</div>
${footer}
</body>
</html>`;
}
