import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
import { useActiveProfile } from '@/lib/active-profile';
import { getMissedGraceMinutes } from '@/lib/app-settings';
import { getCalendarLogs, type CalendarLogRow } from '@/lib/dose-logs';
import { getActiveMedications, getInactiveMedications } from '@/lib/medications';
import type { Medication } from '@/lib/types/medications';
import { formatLate, localDateString, minutesLate, to12h } from '@/lib/utils';

const ALL_MEDICATIONS = 'all';

const RANGE_PRESETS = [
  { key: '7', label: '7 days', days: 7 },
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
] as const;
type RangeKey = (typeof RANGE_PRESETS)[number]['key'];
const DEFAULT_RANGE: RangeKey = '30';

function rangeForKey(key: RangeKey): { startDate: string; endDate: string } {
  const days = RANGE_PRESETS.find((r) => r.key === key)!.days;
  const start = new Date();
  // getCalendarLogs bounds are inclusive (gte/lte), so today counts as one
  // of the `days` — subtract days - 1 to land on exactly `days` calendar
  // dates (e.g. "Last 7 days" = today + 6 prior, not today + 7 prior).
  start.setDate(start.getDate() - (days - 1));
  return { startDate: localDateString(start), endDate: localDateString() };
}

function medicationLabel(med: Medication): string {
  const dose = med.dose ? ` — ${med.dose}` : '';
  const inactive = med.active ? '' : ' (inactive)';
  return `${med.name}${dose}${inactive}`;
}

function statusBadge(row: CalendarLogRow, graceMinutes: number): { label: string; color: string } {
  if (row.status === 'taken') {
    const lateMin = minutesLate(row, graceMinutes);
    if (lateMin !== null) return { label: `Taken (${formatLate(lateMin)})`, color: Brand.warning };
    return { label: 'Taken', color: Brand.success };
  }
  if (row.status === 'skipped') return { label: 'Skipped', color: Brand.warning };
  return { label: 'Missed', color: Brand.danger };
}

export default function HistoryScreen() {
  const { activeProfileId } = useActiveProfile();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [selectedMedicationId, setSelectedMedicationId] = useState<string>(ALL_MEDICATIONS);
  const [rangeKey, setRangeKey] = useState<RangeKey>(DEFAULT_RANGE);
  const [logs, setLogs] = useState<CalendarLogRow[]>([]);
  const [graceMinutes, setGraceMinutes] = useState(60);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // A medication selected under a different profile no longer belongs to
  // what's visible now — reset to "All medications" rather than keep
  // querying that specific (now-hidden) medication's history. Adjusted
  // during render (React's documented pattern for "reset state when a
  // prop changes"), same reasoning as rx-tracker-web's HistoryClient.
  const [lastProfileId, setLastProfileId] = useState(activeProfileId);
  if (activeProfileId !== lastProfileId) {
    setLastProfileId(activeProfileId);
    setSelectedMedicationId(ALL_MEDICATIONS);
  }

  // See the Dashboard's identical guard: bumped on every load() call so a
  // slower, stale response (e.g. from a profile that's no longer selected)
  // can't overwrite state a newer call already set.
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const [active, inactive] = await Promise.all([
        getActiveMedications(activeProfileId),
        getInactiveMedications(activeProfileId),
      ]);
      if (requestIdRef.current !== requestId) return;
      const allMeds = [...active, ...inactive];
      setMedications(allMeds);

      const medicationIds =
        selectedMedicationId === ALL_MEDICATIONS ? allMeds.map((m) => m.id) : [selectedMedicationId];
      const { startDate, endDate } = rangeForKey(rangeKey);
      const [logData, grace] = await Promise.all([
        getCalendarLogs(startDate, endDate, medicationIds),
        getMissedGraceMinutes(),
      ]);
      if (requestIdRef.current !== requestId) return;
      // getCalendarLogs sorts oldest-first; History wants most-recent-first.
      setLogs(logData.slice().reverse());
      setGraceMinutes(grace);
    } catch (e) {
      if (requestIdRef.current !== requestId) return;
      setError(e instanceof Error ? e.message : 'Failed to load history');
    } finally {
      if (requestIdRef.current !== requestId) return;
      setLoading(false);
    }
  }, [activeProfileId, selectedMedicationId, rangeKey]);

  // load() (and this callback) changes identity whenever activeProfileId,
  // selectedMedicationId, or rangeKey changes, and useFocusEffect
  // re-invokes its callback on identity changes while the screen is
  // already focused — so changing a filter reloads immediately.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const selectedMedication =
    selectedMedicationId === ALL_MEDICATIONS
      ? null
      : (medications.find((m) => m.id === selectedMedicationId) ?? null);
  const selectedLabel = selectedMedication ? medicationLabel(selectedMedication) : 'All medications';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <Pressable style={styles.filterField} onPress={() => setPickerOpen(true)}>
          <ThemedText type="small" themeColor="textSecondary">
            Medication
          </ThemedText>
          <ThemedText style={styles.filterValue}>{selectedLabel}</ThemedText>
        </Pressable>

        <View style={styles.rangeRow}>
          {RANGE_PRESETS.map((preset) => (
            <Pressable
              key={preset.key}
              style={[styles.rangeChip, rangeKey === preset.key && styles.rangeChipSelected]}
              onPress={() => setRangeKey(preset.key)}
            >
              <ThemedText
                type="small"
                style={rangeKey === preset.key ? styles.rangeChipTextSelected : undefined}
              >
                Last {preset.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        {error && <ThemedText style={styles.error}>{error}</ThemedText>}

        {loading ? (
          <ActivityIndicator style={styles.loading} />
        ) : (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {logs.length === 0 && (
              <ThemedText themeColor="textSecondary">No dose history for this filter.</ThemedText>
            )}
            {logs.map((row) => {
              const badge = statusBadge(row, graceMinutes);
              return (
                <ThemedView key={row.id} type="backgroundElement" style={styles.row}>
                  <View style={styles.rowMain}>
                    <ThemedText type="smallBold">
                      {row.medications.name}
                      {row.medications.dose ? ` — ${row.medications.dose}` : ''}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {row.scheduled_for_date} · {to12h(row.scheduled_time.slice(0, 5))}
                    </ThemedText>
                  </View>
                  <View style={[styles.badge, { backgroundColor: badge.color + '22' }]}>
                    <ThemedText type="small" style={{ color: badge.color, fontWeight: '700' }}>
                      {badge.label}
                    </ThemedText>
                  </View>
                </ThemedView>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>

      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.modalSheetWrapper} onPress={(e) => e.stopPropagation()}>
            <ThemedView style={styles.modalSheet}>
              <SafeAreaView>
                <ThemedText type="subtitle" style={styles.modalTitle}>
                  Medication
                </ThemedText>
                <ScrollView style={styles.modalList}>
                  <PickerRow
                    label="All medications"
                    selected={selectedMedicationId === ALL_MEDICATIONS}
                    onPress={() => {
                      setSelectedMedicationId(ALL_MEDICATIONS);
                      setPickerOpen(false);
                    }}
                  />
                  {medications.map((med) => (
                    <PickerRow
                      key={med.id}
                      label={medicationLabel(med)}
                      selected={selectedMedicationId === med.id}
                      onPress={() => {
                        setSelectedMedicationId(med.id);
                        setPickerOpen(false);
                      }}
                    />
                  ))}
                </ScrollView>
                <Pressable style={styles.closeButton} onPress={() => setPickerOpen(false)}>
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

function PickerRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable style={styles.pickerRow} onPress={onPress}>
      <ThemedText style={selected ? styles.pickerRowSelected : undefined}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  filterField: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Brand.border,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  filterValue: { marginTop: Spacing.half, fontWeight: '600' },
  rangeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginBottom: Spacing.three },
  rangeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Brand.border,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  rangeChipSelected: { borderColor: Brand.deepBlue, backgroundColor: Brand.bg },
  rangeChipTextSelected: { fontWeight: '700', color: Brand.deepBlue },
  error: { color: Brand.danger, marginBottom: Spacing.two },
  loading: { marginTop: Spacing.five },
  scrollContent: { gap: Spacing.two, paddingBottom: Spacing.six },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
  },
  rowMain: { flex: 1, gap: 2 },
  badge: { borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheetWrapper: { maxHeight: '70%' },
  modalSheet: { borderTopLeftRadius: Spacing.four, borderTopRightRadius: Spacing.four, padding: Spacing.four },
  modalTitle: { fontSize: 18, lineHeight: 24, marginBottom: Spacing.three },
  modalList: { maxHeight: 320 },
  pickerRow: { paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Brand.border },
  pickerRowSelected: { fontWeight: '700', color: Brand.deepBlue },
  closeButton: { marginTop: Spacing.three, alignItems: 'center', paddingVertical: Spacing.two },
  closeButtonText: { fontWeight: '600', color: Brand.deepBlue },
});
