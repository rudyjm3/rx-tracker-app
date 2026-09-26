import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, BorderRadius, Spacing } from '@/constants/theme';
import { useActiveProfile } from '@/lib/active-profile';
import { getMissedGraceMinutes } from '@/lib/app-settings';
import {
  deleteDoseLog,
  editDoseLog,
  getCalendarLogs,
  type CalendarLogRow,
} from '@/lib/dose-logs';
import { getActiveMedications, getInactiveMedications } from '@/lib/medications';
import { levelColor, medicationTracksMood, medicationTracksPain } from '@/lib/pain-mood';
import type { DoseLogStatus, Medication } from '@/lib/types/medications';
import { formatLate, localDateString, minutesLate, to12h } from '@/lib/utils';

const ALL_MEDICATIONS = 'all';
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
const MIN_LEVEL = 1;
const MAX_LEVEL = 10;

const STATUS_OPTIONS: { value: DoseLogStatus; label: string }[] = [
  { value: 'taken', label: 'Taken' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'missed', label: 'Missed' },
];

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
  const [editingLog, setEditingLog] = useState<CalendarLogRow | null>(null);

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
      setLogs([]);
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
          <FlatList
            data={logs}
            keyExtractor={(row) => row.id}
            ListEmptyComponent={
              <ThemedText themeColor="textSecondary">No dose history for this filter.</ThemedText>
            }
            contentContainerStyle={styles.scrollContent}
            renderItem={({ item: row }) => {
              const badge = statusBadge(row, graceMinutes);
              return (
                <Pressable onPress={() => setEditingLog(row)}>
                  <ThemedView type="backgroundElement" style={styles.row}>
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
                </Pressable>
              );
            }}
          />
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

      {editingLog && (
        <EditDoseLogSheet
          key={editingLog.id}
          log={editingLog}
          medication={medications.find((m) => m.id === editingLog.medication_id) ?? null}
          onClose={() => setEditingLog(null)}
          onSaved={() => {
            setEditingLog(null);
            load();
          }}
          onDeleted={() => {
            setEditingLog(null);
            load();
          }}
        />
      )}
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

function timeFromIso(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function nowTime(): string {
  return timeFromIso(new Date().toISOString())!;
}

function EditDoseLogSheet({
  log,
  medication,
  onClose,
  onSaved,
  onDeleted,
}: {
  log: CalendarLogRow;
  medication: Medication | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [status, setStatus] = useState<DoseLogStatus>(log.status);
  const [time, setTime] = useState(() => timeFromIso(log.taken_at) ?? nowTime());
  const [painLevel, setPainLevel] = useState<number>(log.pain_level ?? 5);
  const [moodLevel, setMoodLevel] = useState<number>(log.mood_level ?? 5);
  const [note, setNote] = useState(log.note ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const trackPain = medication ? medicationTracksPain(medication) : false;
  const trackMood = medication ? medicationTracksMood(medication) : false;

  async function handleSave() {
    if (!medication) return;
    setFormError(null);
    if (status === 'taken' && !TIME_RE.test(time)) {
      setFormError('Enter a valid time (HH:MM).');
      return;
    }
    setSaving(true);
    try {
      // Local calendar date, not the UTC slice a raw taken_at ISO string
      // would give — timeFromIso already displays the local time, so the
      // date it's combined with here has to match in the same local frame
      // or the reconstructed timestamp silently drifts a day for anyone
      // not on UTC.
      const baseDate = log.taken_at ? localDateString(new Date(log.taken_at)) : log.scheduled_for_date;
      // Was already 'taken' and staying 'taken' (editing note/time/levels
      // only): reuse the exact amount originally deducted for this slot,
      // which may differ from the medication's default quantity_per_dose
      // (a group or per-schedule-time override) — otherwise the RPC's
      // restore-then-deduct cycle would silently shift inventory by the
      // difference even though nothing about the dose amount changed. A
      // transition INTO 'taken' from skipped/missed has no original amount
      // to preserve, so it falls back to the medication default.
      const quantityPerDose =
        status === 'taken' && log.status === 'taken' && log.deducted_quantity !== null
          ? log.deducted_quantity
          : medication.quantity_per_dose;
      await editDoseLog(log.id, {
        status,
        takenAt: status === 'taken' ? new Date(`${baseDate}T${time}:00`).toISOString() : null,
        painLevel: status === 'taken' && trackPain ? painLevel : undefined,
        moodLevel: status === 'taken' && trackMood ? moodLevel : undefined,
        note: status === 'taken' ? note.trim() : '',
        quantityPerDose,
        inventoryEnabled: medication.inventory_enabled,
      });
      onSaved();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't save changes");
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert('Delete this entry?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          setFormError(null);
          try {
            await deleteDoseLog(log.id);
            onDeleted();
          } catch (e) {
            setFormError(e instanceof Error ? e.message : "Couldn't delete this entry");
            setDeleting(false);
          }
        },
      },
    ]);
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.editSheetWrapper} onPress={(e) => e.stopPropagation()}>
          <ThemedView style={styles.modalSheet}>
            <SafeAreaView edges={['bottom']}>
              <ScrollView>
                <ThemedText type="subtitle" style={styles.modalTitle}>
                  Edit dose entry
                </ThemedText>
                {medication && (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.editSubtitle}>
                    {medication.name}
                    {medication.dose ? ` — ${medication.dose}` : ''}
                  </ThemedText>
                )}

                {formError && <ThemedText style={styles.error}>{formError}</ThemedText>}

                <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
                  Status
                </ThemedText>
                <View style={styles.statusRow}>
                  {STATUS_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.value}
                      style={[styles.statusChip, status === opt.value && styles.statusChipSelected]}
                      onPress={() => setStatus(opt.value)}
                    >
                      <ThemedText
                        type="small"
                        style={status === opt.value ? styles.statusChipTextSelected : undefined}
                      >
                        {opt.label}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>

                {status === 'taken' && (
                  <>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
                      Time taken
                    </ThemedText>
                    <TextInput
                      style={styles.input}
                      value={time}
                      onChangeText={setTime}
                      placeholder="HH:MM"
                    />

                    {trackPain && (
                      <LevelStepper
                        label="Pain level"
                        value={painLevel}
                        onChange={setPainLevel}
                        color={levelColor('pain', painLevel)}
                      />
                    )}
                    {trackMood && (
                      <LevelStepper
                        label="Mood level"
                        value={moodLevel}
                        onChange={setMoodLevel}
                        color={levelColor('mood', moodLevel)}
                      />
                    )}

                    <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
                      Notes (optional)
                    </ThemedText>
                    <TextInput
                      style={[styles.input, styles.multiline]}
                      value={note}
                      onChangeText={setNote}
                      multiline
                      maxLength={255}
                    />
                  </>
                )}

                <View style={styles.actions}>
                  <Pressable style={styles.secondaryButton} onPress={onClose} disabled={saving || deleting}>
                    <ThemedText style={styles.secondaryButtonText}>Cancel</ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.primaryButton, (saving || !medication) && styles.disabled]}
                    onPress={handleSave}
                    disabled={saving || deleting || !medication}
                  >
                    {saving ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <ThemedText style={styles.primaryButtonText}>Save</ThemedText>
                    )}
                  </Pressable>
                </View>

                <Pressable onPress={confirmDelete} disabled={deleting} style={styles.deleteButton}>
                  <ThemedText style={styles.deleteButtonText}>
                    {deleting ? 'Deleting…' : 'Delete entry'}
                  </ThemedText>
                </Pressable>
              </ScrollView>
            </SafeAreaView>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function LevelStepper({
  label,
  value,
  onChange,
  color,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  color: string;
}) {
  return (
    <View style={styles.stepperBlock}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>
        {label}
      </ThemedText>
      <View style={styles.stepperRow}>
        <Pressable
          style={styles.stepperButton}
          onPress={() => onChange(Math.max(MIN_LEVEL, value - 1))}
          disabled={value <= MIN_LEVEL}
          hitSlop={8}
        >
          <ThemedText style={styles.stepperButtonText}>−</ThemedText>
        </Pressable>
        <View style={[styles.stepperValue, { borderColor: color }]}>
          <ThemedText type="smallBold" style={{ color }}>
            {value}
          </ThemedText>
        </View>
        <Pressable
          style={styles.stepperButton}
          onPress={() => onChange(Math.min(MAX_LEVEL, value + 1))}
          disabled={value >= MAX_LEVEL}
          hitSlop={8}
        >
          <ThemedText style={styles.stepperButtonText}>+</ThemedText>
        </Pressable>
        <ThemedText type="small" themeColor="textSecondary">
          out of {MAX_LEVEL}
        </ThemedText>
      </View>
    </View>
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
  editSheetWrapper: { maxHeight: '85%' },
  editSubtitle: { marginTop: -Spacing.two, marginBottom: Spacing.two },
  fieldLabel: { marginTop: Spacing.three, marginBottom: Spacing.one },
  statusRow: { flexDirection: 'row', gap: Spacing.two },
  statusChip: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Brand.border,
    paddingVertical: Spacing.two,
  },
  statusChipSelected: { borderColor: Brand.deepBlue, backgroundColor: Brand.bg },
  statusChipTextSelected: { fontWeight: '700', color: Brand.deepBlue },
  input: {
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  stepperBlock: { marginTop: Spacing.one },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stepperButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Brand.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: { fontSize: 20, fontWeight: '600' },
  stepperValue: {
    width: 48,
    height: 40,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.four },
  primaryButton: {
    flex: 1,
    backgroundColor: Brand.deepBlue,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  primaryButtonText: { color: '#ffffff', fontWeight: '600' },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Brand.border,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  secondaryButtonText: { fontWeight: '600' },
  disabled: { opacity: 0.6 },
  deleteButton: { marginTop: Spacing.three, alignItems: 'center', paddingVertical: Spacing.two },
  deleteButtonText: { color: Brand.danger, fontWeight: '600' },
});
