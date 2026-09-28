import { useCallback, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
import { useActiveProfile } from '@/lib/active-profile';
import {
  buildDayDetails,
  calendarDayColor,
  currentMonth,
  monthBounds,
  type CalendarDayColor,
  type CalendarDayDetail,
} from '@/lib/calendar';
import { getMissedGraceMinutes } from '@/lib/app-settings';
import { getCalendarLogs, getCalendarMarkers, type CalendarDayMarker } from '@/lib/dose-logs';
import { getActiveMedications, getGroupMembers, getGroups, getInactiveMedications } from '@/lib/medications';
import type { Medication, MedicationGroupMember } from '@/lib/types/medications';
import { localDateString } from '@/lib/utils';

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const DAY_COLORS: Record<CalendarDayColor, { bg: string; text: string }> = {
  future: { bg: 'transparent', text: Brand.textMuted },
  missed: { bg: Brand.danger, text: '#ffffff' },
  skipped: { bg: Brand.warning, text: '#ffffff' },
  taken: { bg: Brand.success, text: '#ffffff' },
  empty: { bg: 'transparent', text: Brand.text },
};

const COUNT_COLORS = {
  taken: Brand.success,
  skipped: Brand.warning,
  missed: Brand.danger,
};

export default function CalendarScreen() {
  const { activeProfileId } = useActiveProfile();
  const [month, setMonth] = useState(currentMonth());
  const [markers, setMarkers] = useState<Record<string, CalendarDayMarker>>({});
  const [dayDetails, setDayDetails] = useState<Record<string, CalendarDayDetail>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const bounds = useMemo(() => monthBounds(month), [month]);
  const today = localDateString();

  // See the Dashboard's identical guard: bumped on every load() call so a
  // slower, stale response (e.g. from a profile that's no longer selected)
  // can't overwrite state a newer call already set.
  const requestIdRef = useRef(0);

  const load = useCallback(async (m: string) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const b = monthBounds(m);
      const [activeMeds, inactiveMeds, groups, groupMembers, graceMinutes] = await Promise.all([
        getActiveMedications(activeProfileId),
        getInactiveMedications(activeProfileId),
        getGroups(activeProfileId),
        getGroupMembers(),
        getMissedGraceMinutes(),
      ]);
      if (requestIdRef.current !== requestId) return;
      const allMedications: Medication[] = [...activeMeds, ...inactiveMeds];
      const medicationIds = allMedications.map((med) => med.id);
      const [markerData, logData] = await Promise.all([
        getCalendarMarkers(b.monthStart, b.monthEnd, medicationIds),
        getCalendarLogs(b.monthStart, b.monthEnd, medicationIds),
      ]);
      if (requestIdRef.current !== requestId) return;
      const details = buildDayDetails(
        b.monthStart,
        b.monthEnd,
        localDateString(),
        logData,
        graceMinutes,
        allMedications,
        groups,
        groupMembers as Pick<MedicationGroupMember, 'group_id' | 'medication_id' | 'quantity_per_dose'>[],
      );
      setMarkers(markerData);
      setDayDetails(details);
    } catch (e) {
      if (requestIdRef.current !== requestId) return;
      setError(e instanceof Error ? e.message : 'Failed to load calendar');
    } finally {
      if (requestIdRef.current !== requestId) return;
      setLoading(false);
    }
  }, [activeProfileId]);

  // load() (and this callback) changes identity whenever activeProfileId
  // or month changes, and useFocusEffect re-invokes its callback on
  // identity changes while the screen is already focused (not just on
  // focus transitions) — so switching profiles or navigating to a
  // different month reloads immediately, not just the next time this
  // screen regains focus.
  useFocusEffect(
    useCallback(() => {
      load(month);
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

  const selectedDay = selectedDate ? (dayDetails[selectedDate] ?? null) : null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.titleRow}>
          <ThemedText type="title" style={styles.pageTitle}>
            Calendar
          </ThemedText>
          <Pressable style={styles.historyButton} onPress={() => router.push('/history')} hitSlop={8}>
            <ThemedText type="small" style={styles.historyButtonText}>
              View history
            </ThemedText>
          </Pressable>
        </View>

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
          <ScrollView>
            <View style={styles.grid}>
              {cells.map((cell, i) => {
                if (!cell.date) return <View key={`blank-${i}`} style={styles.cell} />;
                const detail = dayDetails[cell.date];
                const isFuture = detail ? detail.isFuture : cell.date > today;
                const marker = markers[cell.date];
                const color = DAY_COLORS[calendarDayColor(isFuture, marker)];
                const onColoredBg = color.bg !== 'transparent';
                const isToday = cell.date === today;
                const hasMarkerCounts =
                  !isFuture && marker && (marker.taken > 0 || marker.skipped > 0 || marker.missed > 0);
                const endingMedications = detail?.endingMedications ?? [];

                return (
                  <Pressable
                    key={cell.date}
                    style={styles.cell}
                    onPress={() => setSelectedDate(cell.date)}
                  >
                    <View style={[styles.dayBox, { backgroundColor: color.bg }, isToday && styles.todayRing]}>
                      <ThemedText type="small" style={onColoredBg ? { color: color.text } : undefined}>
                        {cell.day}
                      </ThemedText>
                      {detail && (
                        <ThemedText
                          type="small"
                          themeColor={onColoredBg ? undefined : 'textSecondary'}
                          style={[styles.totalDosesText, onColoredBg && { color: color.text }]}
                        >
                          Req {detail.plannedRequired}/Non-req {detail.plannedNonRequired}
                        </ThemedText>
                      )}
                      {hasMarkerCounts && (
                        <View style={styles.countsRow}>
                          {marker!.taken > 0 && (
                            <ThemedText
                              type="small"
                              style={[styles.countText, { color: onColoredBg ? color.text : COUNT_COLORS.taken }]}
                            >
                              {marker!.taken}T
                            </ThemedText>
                          )}
                          {marker!.skipped > 0 && (
                            <ThemedText
                              type="small"
                              style={[styles.countText, { color: onColoredBg ? color.text : COUNT_COLORS.skipped }]}
                            >
                              {marker!.skipped}S
                            </ThemedText>
                          )}
                          {marker!.missed > 0 && (
                            <ThemedText
                              type="small"
                              style={[styles.countText, { color: onColoredBg ? color.text : COUNT_COLORS.missed }]}
                            >
                              {marker!.missed}M
                            </ThemedText>
                          )}
                        </View>
                      )}
                      {endingMedications.length > 0 && (
                        <ThemedText
                          type="small"
                          numberOfLines={1}
                          style={[styles.endingText, onColoredBg && { color: color.text }]}
                        >
                          {endingMedications.length === 1
                            ? `Ends today: ${endingMedications[0].name}`
                            : `Ends today: ${endingMedications[0].name} +${endingMedications.length - 1} more`}
                        </ThemedText>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
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
                  {selectedDay ? `${selectedDay.dayName}, ${selectedDay.displayDate}` : selectedDate}
                </ThemedText>
                <ScrollView style={styles.modalList}>
                  <DayDetailContent day={selectedDay} />
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

function DayDetailContent({ day }: { day: CalendarDayDetail | null }) {
  if (!day) {
    return <ThemedText themeColor="textSecondary">No data for this day.</ThemedText>;
  }

  const endingIds = new Set(day.endingMedications.map((m) => m.medicationId));

  const endingCallout = day.endingMedications.length > 0 && (
    <View style={styles.endingCallout}>
      <ThemedText type="small" style={styles.endingCalloutTitle}>
        {day.endingMedications.length === 1 ? 'Regimen ending today' : 'Regimens ending today'}
      </ThemedText>
      {day.endingMedications.map((med) => (
        <ThemedText key={med.medicationId} type="small">
          {med.name}
          {med.dose ? ` ${med.dose}` : ''}
        </ThemedText>
      ))}
    </View>
  );

  const totalMedicationsForSummary = day.isFuture
    ? day.plannedMedications.length + day.plannedGroups.reduce((n, g) => n + g.medications.length, 0)
    : day.medications.length + day.groups.reduce((n, g) => n + g.medications.length, 0);
  const summaryLine = (
    <ThemedText type="small" themeColor="textSecondary" style={styles.summaryLine}>
      Medications: {totalMedicationsForSummary} | Planned doses — Required: {day.plannedRequired} / Non-required:{' '}
      {day.plannedNonRequired}
    </ThemedText>
  );

  if (day.isFuture) {
    const totalPlanned = totalMedicationsForSummary;
    return (
      <View>
        {summaryLine}
        {endingCallout}
        {totalPlanned === 0 ? (
          <ThemedText themeColor="textSecondary">No doses planned for this day.</ThemedText>
        ) : (
          <>
            {day.plannedGroups.map((group) => (
              <View key={group.groupId} style={styles.groupCard}>
                <ThemedText style={styles.groupName}>{group.groupName}</ThemedText>
                {group.medications.map((slot) => (
                  <PlannedSlotRow
                    key={`${slot.medicationId}-${slot.scheduledTime}`}
                    slot={slot}
                    endingToday={endingIds.has(slot.medicationId)}
                  />
                ))}
              </View>
            ))}
            {day.plannedMedications.map((slot) => (
              <View key={`${slot.medicationId}-${slot.scheduledTime}`} style={styles.medicationCard}>
                <PlannedSlotRow slot={slot} endingToday={endingIds.has(slot.medicationId)} />
              </View>
            ))}
          </>
        )}
      </View>
    );
  }

  const totalMedications = totalMedicationsForSummary;

  return (
    <View>
      {summaryLine}
      {endingCallout}
      {totalMedications === 0 ? (
        <ThemedText themeColor="textSecondary">No dose data for this day.</ThemedText>
      ) : (
        <>
          {day.groups.map((group) => (
            <View key={group.groupId} style={styles.groupCard}>
              <ThemedText style={styles.groupName}>{group.groupName}</ThemedText>
              {group.medications.map((med) => (
                <MedicationSummaryRow
                  key={med.medicationId}
                  med={med}
                  endingToday={endingIds.has(med.medicationId)}
                />
              ))}
            </View>
          ))}
          {day.medications.map((med) => (
            <View
              key={med.medicationId}
              style={[styles.medicationCard, endingIds.has(med.medicationId) && styles.endingHighlight]}
            >
              <MedicationSummaryRow med={med} endingToday={endingIds.has(med.medicationId)} />
            </View>
          ))}
        </>
      )}
    </View>
  );
}

function MedicationSummaryRow({
  med,
  endingToday,
}: {
  med: CalendarDayDetail['medications'][number];
  endingToday: boolean;
}) {
  return (
    <View style={[styles.medicationRow, endingToday && styles.endingHighlight]}>
      <ThemedText style={styles.medicationName}>
        {med.name}
        {med.dose ? ` ${med.dose}` : ''}
      </ThemedText>
      {endingToday && <ThemedText type="small" style={styles.endingNote}>Today is the last day for this regimen.</ThemedText>}
      <ThemedText type="small" themeColor="textSecondary">
        Total doses {med.total} — Taken: {med.taken} / Late: {med.late} — Skipped: {med.skipped} — Missed: {med.missed}
      </ThemedText>
      {med.slots.map((slot) => (
        <View key={slot.logId} style={styles.slotRow}>
          <ThemedText type="small">{slot.displayTime}</ThemedText>
          <ThemedText
            type="small"
            style={[
              styles.slotStatus,
              { color: slot.status === 'taken' ? COUNT_COLORS.taken : slot.status === 'skipped' ? COUNT_COLORS.skipped : COUNT_COLORS.missed },
            ]}
          >
            {slot.status === 'taken' && slot.isLate ? `Taken (${slot.lateLabel})` : slot.status}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

function PlannedSlotRow({
  slot,
  endingToday,
}: {
  slot: CalendarDayDetail['plannedMedications'][number];
  endingToday: boolean;
}) {
  return (
    <View style={[styles.medicationRow, endingToday && styles.endingHighlight]}>
      <View style={styles.slotRow}>
        <ThemedText style={styles.medicationName}>
          {slot.name}
          {slot.dose ? ` ${slot.dose}` : ''}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {slot.displayTime}
        </ThemedText>
      </View>
      {endingToday && <ThemedText type="small" style={styles.endingNote}>Today is the last day for this regimen.</ThemedText>}
      <ThemedText type="small" themeColor="textSecondary">
        {slot.isPrn ? 'Planned (as needed)' : 'Scheduled'}
      </ThemedText>
    </View>
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
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.three },
  pageTitle: { fontSize: 28, lineHeight: 34 },
  historyButton: {
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Brand.border,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  historyButtonText: { color: Brand.deepBlue, fontWeight: '600' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.three },
  arrow: { fontSize: 28, paddingHorizontal: Spacing.two },
  monthLabel: { fontSize: 20, lineHeight: 26 },
  error: { color: Brand.danger, marginBottom: Spacing.two },
  weekdayRow: { flexDirection: 'row' },
  weekdayLabel: { width: CELL_SIZE, textAlign: 'center' },
  loading: { marginTop: Spacing.five },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL_SIZE, minHeight: 76, alignItems: 'center', justifyContent: 'flex-start', paddingVertical: 2 },
  dayBox: { width: '96%', minHeight: 72, borderRadius: BorderRadius.sm, alignItems: 'flex-start', justifyContent: 'flex-start', padding: 3, gap: 1 },
  todayRing: { borderWidth: 2, borderColor: Brand.deepBlue },
  totalDosesText: { fontSize: 8, lineHeight: 10 },
  countsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  countText: { fontSize: 9, lineHeight: 11, fontWeight: '600' },
  endingText: { fontSize: 8, lineHeight: 10, fontWeight: '700', color: Brand.deepBlue },
  legend: { flexDirection: 'row', gap: Spacing.four, marginTop: Spacing.three, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheetWrapper: { maxHeight: '80%' },
  modalSheet: { borderTopLeftRadius: Spacing.four, borderTopRightRadius: Spacing.four, padding: Spacing.four },
  modalTitle: { fontSize: 18, lineHeight: 24, marginBottom: Spacing.three },
  modalList: { maxHeight: 420 },
  summaryLine: { marginBottom: Spacing.two },
  endingCallout: {
    borderWidth: 1,
    borderColor: '#f59e0b',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: BorderRadius.sm,
    padding: Spacing.two,
    marginBottom: Spacing.three,
    gap: 2,
  },
  endingCalloutTitle: { fontWeight: '700', color: '#b45309' },
  endingHighlight: {
    borderWidth: 1,
    borderColor: '#f59e0b',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: BorderRadius.sm,
  },
  endingNote: { color: '#b45309', fontWeight: '600', marginTop: 2 },
  groupCard: {
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: BorderRadius.sm,
    padding: Spacing.two,
    marginBottom: Spacing.three,
    gap: Spacing.two,
  },
  groupName: { fontWeight: '700', marginBottom: 2 },
  medicationCard: {
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: BorderRadius.sm,
    padding: Spacing.two,
    marginBottom: Spacing.three,
  },
  medicationRow: { padding: 2, gap: 2 },
  medicationName: { fontWeight: '700' },
  slotRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 },
  slotStatus: { textTransform: 'capitalize', fontWeight: '600' },
  closeButton: { marginTop: Spacing.three, alignItems: 'center', paddingVertical: Spacing.two },
  closeButtonText: { fontWeight: '600', color: Brand.deepBlue },
});
