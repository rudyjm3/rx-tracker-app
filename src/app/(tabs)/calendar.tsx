import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, Spacing } from '@/constants/theme';
import { calendarDayColor, currentMonth, monthBounds, type CalendarDayColor } from '@/lib/calendar';
import { getCalendarLogs, getCalendarMarkers, type CalendarDayMarker, type CalendarLogRow } from '@/lib/dose-logs';
import { localDateString, to12h } from '@/lib/utils';

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const DAY_COLORS: Record<CalendarDayColor, { bg: string; text: string }> = {
  future: { bg: 'transparent', text: Brand.textMuted },
  missed: { bg: Brand.danger, text: '#ffffff' },
  skipped: { bg: Brand.warning, text: '#ffffff' },
  taken: { bg: Brand.success, text: '#ffffff' },
  empty: { bg: 'transparent', text: Brand.text },
};

export default function CalendarScreen() {
  const [month, setMonth] = useState(currentMonth());
  const [markers, setMarkers] = useState<Record<string, CalendarDayMarker>>({});
  const [logs, setLogs] = useState<CalendarLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const bounds = useMemo(() => monthBounds(month), [month]);
  const today = localDateString();

  const load = useCallback(async (m: string) => {
    setLoading(true);
    setError(null);
    try {
      const b = monthBounds(m);
      const [markerData, logData] = await Promise.all([
        getCalendarMarkers(b.monthStart, b.monthEnd),
        getCalendarLogs(b.monthStart, b.monthEnd),
      ]);
      setMarkers(markerData);
      setLogs(logData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load calendar');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(month);
      // month is a real dependency here — leaving it out let this effect
      // capture whatever month was selected when the screen first
      // mounted, so refocusing after navigating to a different month
      // silently reloaded the wrong one (grid/header showed the new
      // month, data was the old one).
    }, [load, month]),
  );

  function changeMonth(delta: 1 | -1) {
    // No explicit load() call here — the focus effect above now depends
    // on `month`, so it re-runs and fetches the new month itself while
    // this screen is focused.
    setMonth(delta === 1 ? bounds.nextMonth : bounds.prevMonth);
  }

  const cells: { date: string | null; day: number | null }[] = [];
  for (let i = 0; i < bounds.firstDow; i++) cells.push({ date: null, day: null });
  for (let day = 1; day <= bounds.daysInMonth; day++) {
    cells.push({ date: `${bounds.monthStart.slice(0, 7)}-${String(day).padStart(2, '0')}`, day });
  }

  const selectedLogs = selectedDate
    ? logs.filter((l) => l.scheduled_for_date === selectedDate).sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time))
    : [];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={() => changeMonth(-1)} hitSlop={12}>
            <ThemedText type="subtitle" style={styles.arrow}>
              ‹
            </ThemedText>
          </Pressable>
          <ThemedText type="subtitle" style={styles.monthLabel}>
            {bounds.label}
          </ThemedText>
          <Pressable onPress={() => changeMonth(1)} hitSlop={12}>
            <ThemedText type="subtitle" style={styles.arrow}>
              ›
            </ThemedText>
          </Pressable>
        </View>

        {error && <ThemedText style={styles.error}>{error}</ThemedText>}

        <View style={styles.weekdayRow}>
          {WEEKDAY_LABELS.map((label) => (
            <ThemedText key={label} type="small" themeColor="textSecondary" style={styles.weekdayLabel}>
              {label}
            </ThemedText>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator style={styles.loading} />
        ) : (
          <View style={styles.grid}>
            {cells.map((cell, i) => {
              if (!cell.date) return <View key={`blank-${i}`} style={styles.cell} />;
              const isFuture = cell.date > today;
              const color = DAY_COLORS[calendarDayColor(isFuture, markers[cell.date])];
              const isToday = cell.date === today;
              return (
                <Pressable
                  key={cell.date}
                  style={styles.cell}
                  onPress={() => setSelectedDate(cell.date)}
                >
                  <View style={[styles.dayCircle, { backgroundColor: color.bg }, isToday && styles.todayRing]}>
                    <ThemedText type="small" style={{ color: color.bg === 'transparent' ? undefined : color.text }}>
                      {cell.day}
                    </ThemedText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.legend}>
          <LegendItem color={DAY_COLORS.taken.bg} label="Taken" />
          <LegendItem color={DAY_COLORS.skipped.bg} label="Skipped" />
          <LegendItem color={DAY_COLORS.missed.bg} label="Missed" />
        </View>
      </SafeAreaView>

      <Modal
        visible={!!selectedDate}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedDate(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedDate(null)}>
          <Pressable style={styles.modalSheetWrapper} onPress={(e) => e.stopPropagation()}>
            <ThemedView style={styles.modalSheet}>
              <SafeAreaView>
                <ThemedText type="subtitle" style={styles.modalTitle}>
                  {selectedDate}
                </ThemedText>
                <ScrollView style={styles.modalList}>
                  {selectedLogs.length === 0 ? (
                    <ThemedText themeColor="textSecondary">No doses logged this day.</ThemedText>
                  ) : (
                    selectedLogs.map((log) => (
                      <View key={log.id} style={styles.logRow}>
                        <ThemedText type="small" style={styles.logTime}>
                          {to12h(log.scheduled_time.slice(0, 5))}
                        </ThemedText>
                        <ThemedText style={styles.logName}>{log.medications.name}</ThemedText>
                        <ThemedText
                          type="small"
                          style={[styles.logStatus, { color: DAY_COLORS[log.status === 'taken' ? 'taken' : log.status === 'skipped' ? 'skipped' : 'missed'].bg }]}
                        >
                          {log.status}
                        </ThemedText>
                      </View>
                    ))
                  )}
                </ScrollView>
                <Pressable style={styles.closeButton} onPress={() => setSelectedDate(null)}>
                  <ThemedText style={styles.closeButtonText}>Close</ThemedText>
                </Pressable>
              </SafeAreaView>
            </ThemedView>
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

const CELL_SIZE = '14.28%' as const;

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.three },
  arrow: { fontSize: 28, paddingHorizontal: Spacing.two },
  monthLabel: { fontSize: 20, lineHeight: 26 },
  error: { color: Brand.danger, marginBottom: Spacing.two },
  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: { width: CELL_SIZE, textAlign: 'center' },
  loading: { marginTop: Spacing.five },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL_SIZE, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  todayRing: { borderWidth: 2, borderColor: Brand.deepBlue },
  legend: { flexDirection: 'row', gap: Spacing.four, marginTop: Spacing.three, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheetWrapper: { maxHeight: '70%' },
  modalSheet: { borderTopLeftRadius: Spacing.four, borderTopRightRadius: Spacing.four, padding: Spacing.four },
  modalTitle: { fontSize: 18, lineHeight: 24, marginBottom: Spacing.three },
  modalList: { maxHeight: 320 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Brand.border },
  logTime: { width: 76 },
  logName: { flex: 1 },
  logStatus: { textTransform: 'capitalize', fontWeight: '600' },
  closeButton: { marginTop: Spacing.three, alignItems: 'center', paddingVertical: Spacing.two },
  closeButtonText: { fontWeight: '600', color: Brand.deepBlue },
});
