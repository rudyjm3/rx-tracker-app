// On-screen Doctor Visit Report preview — port of rx-tracker-web's
// components/export/ReportSummary.tsx. Same sections, order, titles,
// descriptions and empty-state text as the web preview and the PDF. Web
// shows each section as a wide table that scrolls sideways on a phone;
// here each row is a stacked card (first column as the heading, the rest
// as label/value lines) so nothing needs horizontal scrolling.
import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Polyline, Text as SvgText } from 'react-native-svg';

import { Badge } from '@/components/ui/badge';
import { GradientFill } from '@/components/ui/gradient-fill';
import { MedTypeBadge } from '@/components/ui/med-type-badge';
import { Text } from '@/components/ui/text';
import type { MoodChartScheme } from '@/lib/app-settings';
import type { MedicationTrend, ReportData, ReportDailyAverage, TrendNoteEntry } from '@/lib/export';
import type { WellbeingMetric } from '@/lib/pain-mood';
import {
  adherenceColor,
  averageLevel,
  allergyTypeLabel,
  feedbackChips,
  formatDoseChange,
  formatReportSchedule,
  MOOD_SECTION_DESC,
  PAIN_SECTION_DESC,
  REPORT_COLORS,
  REPORT_DISCLAIMER,
  ringArcPath,
  trendChartGeometry,
} from '@/lib/report-visuals';
import type { Medication } from '@/lib/types/medications';
import { formatLongDate, formatPrescribedDose, formatShortDate, localDateFromTimestamp, to12h } from '@/lib/utils';

function NameWithDose({ medication }: { medication: Pick<Medication, 'name' | 'dose' | 'dose_amount' | 'dose_unit'> }) {
  const dose = formatPrescribedDose(medication);
  return (
    <Text className="text-sm font-semibold">
      {medication.name}
      {dose ? <Text className="text-xs font-bold text-gray-500 dark:text-night-muted"> {dose}</Text> : null}
    </Text>
  );
}

// Name first, then type badge + pain/mood chips on their own row (web's MedicationLabel).
function MedicationLabel({ medication, annotation }: { medication: Medication; annotation?: string | null }) {
  return (
    <View>
      <NameWithDose medication={medication} />
      <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
        <MedTypeBadge type={medication.medication_type} className="self-auto" />
        {feedbackChips(medication.feedback_type).map((chip) => (
          <View key={chip.label} className="rounded-full border px-2 py-0.5" style={{ borderColor: chip.color }}>
            <Text className="text-[10px] font-bold uppercase" style={{ color: chip.color }}>
              {chip.label}
            </Text>
          </View>
        ))}
      </View>
      {annotation ? (
        <Text muted className="mt-0.5 text-xs">
          {annotation}
        </Text>
      ) : null}
    </View>
  );
}

function ReportSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <View className="border-b border-brand-border px-4 py-5 dark:border-night-border">
      <Text accessibilityRole="header" className="text-base font-bold text-brand-navy dark:text-white">
        {title}
      </Text>
      {description ? (
        <Text muted className="mt-1 text-xs">
          {description}
        </Text>
      ) : null}
      <View className="mt-3">{children}</View>
    </View>
  );
}

function Empty({ children }: { children: string }) {
  return (
    <Text muted className="text-sm italic">
      {children}
    </Text>
  );
}

interface FieldDef {
  label: string;
  value: ReactNode;
}

function Field({ label, value }: FieldDef) {
  return (
    <View className="flex-row gap-3">
      <Text muted className="w-28 text-xs font-semibold uppercase">
        {label}
      </Text>
      <View className="flex-1">
        {typeof value === 'string' || typeof value === 'number' ? (
          <Text className="text-sm">{String(value).trim() || '—'}</Text>
        ) : (
          value
        )}
      </View>
    </View>
  );
}

function RowCards<T>({
  rows,
  rowKey,
  heading,
  fields,
  emptyLabel,
}: {
  rows: T[];
  rowKey: (row: T, i: number) => string;
  heading: (row: T) => ReactNode;
  fields: (row: T) => FieldDef[];
  emptyLabel: string;
}) {
  if (rows.length === 0) return <Empty>{emptyLabel}</Empty>;
  return (
    <View className="overflow-hidden rounded-control border border-brand-border dark:border-night-border">
      {rows.map((row, i) => (
        <View
          key={rowKey(row, i)}
          className={`gap-1.5 px-3 py-2.5 ${i > 0 ? 'border-t border-brand-border dark:border-night-border' : ''}`}>
          {heading(row)}
          {fields(row).map((f) => (
            <Field key={f.label} label={f.label} value={f.value} />
          ))}
        </View>
      ))}
    </View>
  );
}

function StatTile({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View className="h-[90px] min-w-[46%] flex-1 overflow-hidden rounded-control bg-brand-bg dark:bg-night-bg">
      <View className="flex-1 items-center justify-center">
        <Text className="text-xl font-bold" style={color ? { color } : undefined}>
          {value}
        </Text>
      </View>
      <View className="bg-brand-border px-1 py-1.5 dark:bg-night-border">
        <Text className="text-center text-[10px] uppercase tracking-wide text-brand-navy dark:text-white">{label}</Text>
      </View>
    </View>
  );
}

function AdherenceRing({ percent }: { percent: number }) {
  const size = 72;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const color = adherenceColor(percent);
  const arc = ringArcPath(c, c, r, percent);
  return (
    <View
      className="w-full items-center justify-center gap-1 rounded-control bg-brand-bg px-3 py-3 dark:bg-night-bg"
      accessible
      accessibilityLabel={`Overall adherence ${percent}%`}>
      <Svg width={size} height={size}>
        <Circle cx={c} cy={c} r={r} stroke={REPORT_COLORS.border} strokeWidth={stroke} fill="none" />
        {arc ? <Path d={arc} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" /> : null}
        <SvgText x={c} y={c + 5} fontSize={14} fontWeight="700" fill={color} textAnchor="middle">
          {`${percent}%`}
        </SvgText>
      </Svg>
      <Text muted className="text-center text-[10px] uppercase tracking-wide">
        Overall adherence
      </Text>
    </View>
  );
}

function ReportTrendChart({
  points,
  metric,
  scheme,
}: {
  points: ReportDailyAverage[];
  metric: WellbeingMetric;
  scheme?: MoodChartScheme;
}) {
  const [width, setWidth] = useState(0);
  if (points.length === 0) return <Empty>{`No ${metric} level data recorded for this period.`}</Empty>;
  const height = 120;
  const g = width > 0 ? trendChartGeometry(points, metric, width, height, scheme) : null;
  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {g ? (
        <Svg width={g.width} height={g.height}>
          {g.tickY.map(({ tick, y }) => (
            <G key={tick}>
              <Line x1={g.padX} y1={y} x2={g.width - g.padX} y2={y} stroke={REPORT_COLORS.border} strokeWidth={0.5} />
              <SvgText x={2} y={y + 3} fontSize={9} fill={REPORT_COLORS.muted}>
                {String(tick)}
              </SvgText>
            </G>
          ))}
          <Polyline points={g.polyline} stroke={g.lineColor} strokeWidth={1.5} fill="none" />
          {g.dots.map((d) =>
            d.hollow ? (
              <Circle key={d.date} cx={d.x} cy={d.y} r={3.5} fill="#ffffff" stroke={d.color} strokeWidth={1.5} />
            ) : (
              <Circle key={d.date} cx={d.x} cy={d.y} r={3.5} fill={d.color} />
            ),
          )}
        </Svg>
      ) : (
        <View style={{ height }} />
      )}
      <View className="mt-0.5 flex-row justify-between">
        <Text muted className="text-xs">
          {formatShortDate(points[0].date)}
        </Text>
        <Text muted className="text-xs">
          {formatShortDate(points[points.length - 1].date)}
        </Text>
      </View>
    </View>
  );
}

function PatientNotes({ notes }: { notes: TrendNoteEntry[] }) {
  if (notes.length === 0) return null;
  const byDate = new Map<string, TrendNoteEntry[]>();
  for (const n of notes) byDate.set(n.date, [...(byDate.get(n.date) ?? []), n]);
  return (
    <View className="mt-3 gap-2">
      <Text className="text-sm font-semibold">Patient notes:</Text>
      {Array.from(byDate.keys())
        .sort()
        .map((date) => (
          <View key={date}>
            <Text className="text-xs font-semibold text-brand-navy dark:text-white">{formatLongDate(date)}</Text>
            {byDate.get(date)!.map((n, i) => (
              <Text key={i} muted className="text-xs">
                <Text className="text-xs">{to12h(n.time)}</Text> ({n.source} — {n.medicationName}): {n.note}
                {n.editedAt ? <Text className="text-xs italic"> [edited {formatLongDate(n.editedAt.slice(0, 10))}]</Text> : null}
              </Text>
            ))}
          </View>
        ))}
    </View>
  );
}

function TrendSection({
  title,
  description,
  metric,
  trends,
  data,
}: {
  title: string;
  description: string;
  metric: WellbeingMetric;
  trends: MedicationTrend[];
  data: ReportData;
}) {
  if (trends.length === 0) return null;
  const avgLabel = metric === 'pain' ? 'Avg pain' : 'Avg mood';
  return (
    <ReportSection title={title} description={description}>
      <View className="gap-6">
        {trends.map(({ medication, points, notes }) => (
          <View key={medication.id}>
            <MedicationLabel medication={medication} />
            <Text muted className="mb-2 mt-1 text-xs">
              {`Reporting period: ${formatShortDate(data.startDate)} – ${formatShortDate(data.endDate)}  |  ${avgLabel}: ${averageLevel(points)}/10  |  Days logged: ${points.length}`}
            </Text>
            <ReportTrendChart points={points} metric={metric} scheme={metric === 'mood' ? data.moodChartScheme : undefined} />
            <PatientNotes notes={notes} />
          </View>
        ))}
      </View>
    </ReportSection>
  );
}

export function ReportSummary({ data }: { data: ReportData }) {
  const extraMissed = data.missedDoseDetailTotal - data.missedDoseDetail.length;
  return (
    <View className="overflow-hidden rounded-card border border-brand-border bg-brand-card shadow-card dark:border-night-border dark:bg-night-card">
      <View className="flex-row items-center gap-4 overflow-hidden px-4 py-5">
        <GradientFill name="brandDark" />
        <Image
          source={require('../../../assets/images/icon.png')}
          style={{ width: 48, height: 48, borderRadius: 12 }}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
        <View className="flex-1">
          <Text accessibilityRole="header" className="text-xl font-bold text-white dark:text-white">
            Doctor Visit Report
          </Text>
          <Text className="mt-1 text-sm text-white/85 dark:text-white/85">
            Prepared by RxTracker • Patient: {data.patientName}
          </Text>
          <Text className="text-sm text-white/85 dark:text-white/85">
            Reporting period: {formatShortDate(data.startDate)} – {formatShortDate(data.endDate)} • Generated:{' '}
            {data.generatedAt}
          </Text>
        </View>
      </View>

      <ReportSection title="Known Allergies & Intolerances">
        <RowCards
          rows={data.allergies}
          rowKey={(a) => a.id}
          heading={(a) => <Text className="text-sm font-semibold">{a.name}</Text>}
          fields={(a) => [{ label: 'Type', value: allergyTypeLabel(a.allergy_type) }]}
          emptyLabel="No allergies recorded."
        />
      </ReportSection>

      <ReportSection title="Adherence Summary">
        <View className="flex-row flex-wrap gap-3">
          <AdherenceRing percent={data.overallAdherencePercent} />
          <StatTile label="Doses scheduled" value={data.dosesScheduled} />
          <StatTile label="Doses taken" value={data.dosesTaken} color={REPORT_COLORS.success} />
          <StatTile label="Doses missed" value={data.dosesMissed} color={REPORT_COLORS.danger} />
          <StatTile label="Doses skipped" value={data.dosesSkipped} color={REPORT_COLORS.warning} />
        </View>
        {data.adherenceBreakout.length > 0 ? (
          <>
            <Text muted className="mb-2 mt-4 text-xs">
              Adherence by medication is broken out below where rates differ from the overall average.
            </Text>
            <RowCards
              rows={data.adherenceBreakout}
              rowKey={(r) => r.medication.id}
              heading={(r) => <MedicationLabel medication={r.medication} />}
              fields={(r) => [
                {
                  label: 'Adherence',
                  value: (
                    <Text className="text-sm font-semibold" style={{ color: adherenceColor(r.percent) }}>
                      {r.percent}%
                    </Text>
                  ),
                },
                { label: 'Missed', value: `${r.missed} of ${r.scheduled}` },
              ]}
              emptyLabel=""
            />
          </>
        ) : null}
      </ReportSection>

      <ReportSection title="Current Medications">
        <RowCards
          rows={data.currentMedications}
          rowKey={(r) => r.medication.id}
          heading={(r) => (
            <MedicationLabel
              medication={r.medication}
              annotation={r.resumedOn ? `(Resumed use on ${r.resumedOn})` : null}
            />
          )}
          fields={(r) => [
            { label: 'Dose', value: formatPrescribedDose(r.medication) },
            { label: 'Start date', value: r.medication.start_date ? formatShortDate(r.medication.start_date) : '—' },
            { label: 'Schedule', value: formatReportSchedule(r.medication) },
            { label: 'Instructions', value: r.medication.instructions },
          ]}
          emptyLabel="No medications selected for this report."
        />
      </ReportSection>

      <ReportSection
        title="Reported Side Effects"
        description="Patient-logged side effects for the reporting period, most recent first.">
        <RowCards
          rows={data.sideEffects}
          rowKey={(se) => se.id}
          heading={(se) => <NameWithDose medication={se.medication} />}
          fields={(se) => [
            { label: 'Date', value: formatShortDate(se.occurred_date) },
            { label: 'Severity', value: se.severity },
            { label: 'Side effect', value: se.description },
            { label: 'Notes', value: se.note },
          ]}
          emptyLabel="No side effects logged for this period."
        />
      </ReportSection>

      <ReportSection
        title="Discontinued Medications"
        description="Medications the patient has stopped using, with the reason and notes recorded when use was discontinued.">
        <RowCards
          rows={data.discontinuedMedications}
          rowKey={(r) => r.medication.id}
          heading={(r) => <MedicationLabel medication={r.medication} />}
          fields={(r) => [
            { label: 'Dose', value: formatPrescribedDose(r.medication) },
            { label: 'Reason', value: r.event?.reason ?? '' },
            { label: 'Notes', value: r.event?.comment ?? '' },
            {
              label: 'Discontinued',
              value: r.event ? formatShortDate(localDateFromTimestamp(r.event.event_at)) : '—',
            },
          ]}
          emptyLabel="No discontinued medications for this profile."
        />
      </ReportSection>

      <ReportSection title="Dose Changes">
        <RowCards
          rows={data.doseChanges}
          rowKey={(r) => r.change.id}
          heading={(r) => <NameWithDose medication={r.medication} />}
          fields={(r) => [
            { label: 'Date', value: formatShortDate(localDateFromTimestamp(r.at)) },
            { label: 'Change', value: formatDoseChange(r.change) },
            { label: 'Comment', value: r.change.comment },
          ]}
          emptyLabel="No dose changes recorded during this period."
        />
      </ReportSection>

      <ReportSection
        title="Missed Dose Detail"
        description="Showing missed and skipped doses for the reporting period, most recent first.">
        <RowCards
          rows={data.missedDoseDetail}
          rowKey={(l, i) => `${l.medication.id}-${l.date}-${l.time}-${i}`}
          heading={(l) => <NameWithDose medication={l.medication} />}
          fields={(l) => [
            { label: 'Date', value: formatShortDate(l.date) },
            { label: 'Scheduled time', value: to12h(l.time) },
            { label: 'Status', value: <Badge variant={l.status} /> },
          ]}
          emptyLabel="No missed or skipped doses for this period."
        />
        {extraMissed > 0 ? (
          <Text muted className="mt-2 text-xs italic">
            {`+ ${extraMissed} additional missed/skipped doses in this period (full list available in app).`}
          </Text>
        ) : null}
      </ReportSection>

      <TrendSection
        title="Pain Level Tracking"
        description={PAIN_SECTION_DESC}
        metric="pain"
        trends={data.painTrends}
        data={data}
      />
      <TrendSection
        title="Mood & Wellbeing Tracking"
        description={MOOD_SECTION_DESC}
        metric="mood"
        trends={data.moodTrends}
        data={data}
      />

      <View className="px-4 py-4">
        <Text muted className="text-xs">
          {REPORT_DISCLAIMER}
        </Text>
        <Text muted className="mt-1 text-xs">
          Generated {data.generatedAt}
        </Text>
      </View>
    </View>
  );
}
