// Hand-rolled SVG trend chart for the Pain & Mood screen — this app has no
// charting library and no DOM, so rx-tracker-web's TrendChart.tsx (Recharts)
// isn't portable directly. Behavior (multi-day averages, tap-to-drill into a
// day, back control, per-prop reset) mirrors that component; the rendering
// is react-native-svg primitives instead.
import { useState } from 'react';
import { LayoutChangeEvent, Pressable, View } from 'react-native';
import Svg, { Circle, Line as SvgLine, Polyline, Text as SvgText } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import {
  groupDailyAverages,
  levelColor,
  type RangeDays,
  type TrendPoint,
  type WellbeingMetric,
} from '@/lib/pain-mood';
import { minutesToTime, timeToMinutes, to12h } from '@/lib/utils';

const CHART_HEIGHT = 220;
const PADDING_LEFT = 32;
const PADDING_RIGHT = 12;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 28;
const Y_TICKS = [1, 3, 5, 7, 10];
const Y_MIN = 1;
const Y_MAX = 10;
const MAX_X_LABELS = 6;

function yToPixel(level: number, innerHeight: number): number {
  const ratio = (level - Y_MIN) / (Y_MAX - Y_MIN);
  return PADDING_TOP + (1 - ratio) * innerHeight;
}

interface TrendChartProps {
  metric: WellbeingMetric;
  points: TrendPoint[];
  rangeDays: RangeDays;
}

export function TrendChart({ metric, points, rangeDays }: TrendChartProps) {
  const [width, setWidth] = useState(0);
  const [drillDate, setDrillDate] = useState<string | null>(null);

  // Reset the drill-down whenever rangeDays or metric changes — otherwise a
  // stale drilled-into date from a previous selection would keep showing
  // under a range/metric it no longer belongs to. Same "reset state during
  // render" pattern History uses for its profile-switch reset.
  const [lastKey, setLastKey] = useState(`${metric}:${rangeDays}`);
  const key = `${metric}:${rangeDays}`;
  if (key !== lastKey) {
    setLastKey(key);
    setDrillDate(null);
  }

  function handleLayout(e: LayoutChangeEvent) {
    setWidth(e.nativeEvent.layout.width);
  }

  const showingDay = rangeDays === 0 ? (points[0]?.date ?? null) : drillDate;

  const dayPoints = showingDay
    ? points
        .filter((p) => p.date === showingDay)
        .map((p) => ({ ...p, x: timeToMinutes(p.time) }))
        .sort((a, b) => a.x - b.x)
    : [];

  const dailyAverages = showingDay ? [] : groupDailyAverages(points);

  const hasData = showingDay ? dayPoints.length > 0 : dailyAverages.length > 0;
  const metricLabel = metric === 'pain' ? 'Pain' : 'Mood';
  const showingDayLabel = showingDay
    ? new Date(`${showingDay}T00:00:00`).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  const innerWidth = Math.max(width - PADDING_LEFT - PADDING_RIGHT, 0);
  const innerHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  return (
    <View style={{ gap: Spacing.two }}>
      {rangeDays > 0 && drillDate && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two }}>
          <ThemedText type="smallBold">Showing {showingDayLabel}</ThemedText>
          <Pressable onPress={() => setDrillDate(null)} hitSlop={8}>
            <ThemedText type="small" style={{ color: Brand.deepBlue, fontWeight: '600' }}>
              ← Back to trend
            </ThemedText>
          </Pressable>
        </View>
      )}

      <View onLayout={handleLayout} style={{ height: CHART_HEIGHT }}>
        {!hasData ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.four }}>
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              No {metric} data recorded for this period.
            </ThemedText>
          </View>
        ) : width === 0 ? null : showingDay ? (
          <Svg width={width} height={CHART_HEIGHT}>
            {Y_TICKS.map((tick) => {
              const y = yToPixel(tick, innerHeight);
              return (
                <SvgLine
                  key={tick}
                  x1={PADDING_LEFT}
                  y1={y}
                  x2={width - PADDING_RIGHT}
                  y2={y}
                  stroke={Brand.border}
                  strokeWidth={1}
                />
              );
            })}
            {Y_TICKS.map((tick) => (
              <SvgText
                key={tick}
                x={PADDING_LEFT - 6}
                y={yToPixel(tick, innerHeight) + 4}
                fontSize={11}
                fill={Brand.textMuted}
                textAnchor="end"
              >
                {tick}
              </SvgText>
            ))}
            {[0, 360, 720, 1080, 1440].map((mins) => {
              const x = PADDING_LEFT + (mins / 1440) * innerWidth;
              return (
                <SvgText
                  key={mins}
                  x={x}
                  y={CHART_HEIGHT - PADDING_BOTTOM + 18}
                  fontSize={10}
                  fill={Brand.textMuted}
                  textAnchor="middle"
                >
                  {to12h(minutesToTime(mins))}
                </SvgText>
              );
            })}
            <Polyline
              points={dayPoints
                .map((p) => `${PADDING_LEFT + (p.x / 1440) * innerWidth},${yToPixel(p.level, innerHeight)}`)
                .join(' ')}
              fill="none"
              stroke={Brand.deepBlue}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {dayPoints.map((p) => (
              <Circle
                key={p.id}
                cx={PADDING_LEFT + (p.x / 1440) * innerWidth}
                cy={yToPixel(p.level, innerHeight)}
                r={5}
                fill={levelColor(metric, p.level)}
                stroke={Brand.card}
                strokeWidth={2}
              />
            ))}
          </Svg>
        ) : (
          <Svg width={width} height={CHART_HEIGHT}>
            {Y_TICKS.map((tick) => {
              const y = yToPixel(tick, innerHeight);
              return (
                <SvgLine
                  key={tick}
                  x1={PADDING_LEFT}
                  y1={y}
                  x2={width - PADDING_RIGHT}
                  y2={y}
                  stroke={Brand.border}
                  strokeWidth={1}
                />
              );
            })}
            {Y_TICKS.map((tick) => (
              <SvgText
                key={tick}
                x={PADDING_LEFT - 6}
                y={yToPixel(tick, innerHeight) + 4}
                fontSize={11}
                fill={Brand.textMuted}
                textAnchor="end"
              >
                {tick}
              </SvgText>
            ))}
            {dailyAverages.map((d, i) => {
              // Cap the number of date labels drawn — one per day would
              // overlap into an unreadable smear on a phone-width chart
              // once the range (30/90 days) has more points than fit.
              const step = Math.max(1, Math.ceil(dailyAverages.length / MAX_X_LABELS));
              const isLast = i === dailyAverages.length - 1;
              if (i % step !== 0 && !isLast) return null;
              const x =
                dailyAverages.length > 1
                  ? PADDING_LEFT + (i / (dailyAverages.length - 1)) * innerWidth
                  : PADDING_LEFT + innerWidth / 2;
              return (
                <SvgText
                  key={d.date}
                  x={x}
                  y={CHART_HEIGHT - PADDING_BOTTOM + 18}
                  fontSize={10}
                  fill={Brand.textMuted}
                  textAnchor="middle"
                >
                  {d.date.slice(5)}
                </SvgText>
              );
            })}
            <Polyline
              points={dailyAverages
                .map((d, i) => {
                  const x =
                    dailyAverages.length > 1
                      ? PADDING_LEFT + (i / (dailyAverages.length - 1)) * innerWidth
                      : PADDING_LEFT + innerWidth / 2;
                  return `${x},${yToPixel(d.level, innerHeight)}`;
                })
                .join(' ')}
              fill="none"
              stroke={Brand.deepBlue}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {dailyAverages.map((d, i) => {
              const x =
                dailyAverages.length > 1
                  ? PADDING_LEFT + (i / (dailyAverages.length - 1)) * innerWidth
                  : PADDING_LEFT + innerWidth / 2;
              const y = yToPixel(d.level, innerHeight);
              return (
                <Circle
                  key={d.date}
                  // Hit target larger than the visible mark, per the
                  // dataviz skill's interaction guidance — the visible
                  // dot stays 10px across, but taps land within ~24px.
                  cx={x}
                  cy={y}
                  r={12}
                  fill="transparent"
                  onPress={() => setDrillDate(d.date)}
                />
              );
            })}
            {dailyAverages.map((d, i) => {
              const x =
                dailyAverages.length > 1
                  ? PADDING_LEFT + (i / (dailyAverages.length - 1)) * innerWidth
                  : PADDING_LEFT + innerWidth / 2;
              return (
                <Circle
                  key={`dot-${d.date}`}
                  cx={x}
                  cy={yToPixel(d.level, innerHeight)}
                  r={5}
                  fill={levelColor(metric, d.level)}
                  stroke={Brand.card}
                  strokeWidth={2}
                  onPress={() => setDrillDate(d.date)}
                />
              );
            })}
          </Svg>
        )}
      </View>

      {!showingDay && hasData && (
        <ThemedText type="small" themeColor="textSecondary">
          Tip: tap a point to see that day&apos;s {metricLabel.toLowerCase()} levels throughout the day.
        </ThemedText>
      )}
    </View>
  );
}
