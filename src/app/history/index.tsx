import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, View } from 'react-native';

import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { FormSheet } from '@/components/ui/form-sheet';
import { LevelGrid } from '@/components/ui/level-grid';
import { MedName } from '@/components/ui/med-name';
import { PillTabs } from '@/components/ui/pill-tabs';
import { Screen } from '@/components/ui/screen';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { useActiveProfile } from '@/lib/active-profile';
import { getMissedGraceMinutes } from '@/lib/app-settings';
import {
  deleteDoseLog,
  editDoseLog,
  getCalendarLogs,
  type CalendarLogRow,
} from '@/lib/dose-logs';
import { getActiveMedications, getGroupMembers, getGroups, getInactiveMedications } from '@/lib/medications';
import { medicationTracksMood, medicationTracksPain } from '@/lib/pain-mood';
import { generateDaySlots } from '@/lib/schedule';
import type { DoseLogStatus, Medication, MedicationGroup } from '@/lib/types/medications';
import { formatLate, localDateString, minutesLate, to12h } from '@/lib/utils';

const ALL_MEDICATIONS = 'all';
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

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

function statusBadge(row: CalendarLogRow, graceMinutes: number): { variant: BadgeVariant; label: string } {
  if (row.status === 'taken') {
    const lateMin = minutesLate(row, graceMinutes);
    if (lateMin !== null) return { variant: 'late', label: `Taken (${formatLate(lateMin)})` };
    return { variant: 'taken', label: 'Taken' };
  }
  if (row.status === 'skipped') return { variant: 'skipped', label: 'Skipped' };
  return { variant: 'missed', label: 'Missed' };
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
  const [groups, setGroups] = useState<MedicationGroup[]>([]);
  const [groupMembers, setGroupMembers] = useState<
    { group_id: string; medication_id: string; quantity_per_dose: number | null }[]
  >([]);

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
      const [active, inactive, groupList, groupMemberList] = await Promise.all([
        getActiveMedications(activeProfileId),
        getInactiveMedications(activeProfileId),
        getGroups(activeProfileId),
        getGroupMembers(),
      ]);
      if (requestIdRef.current !== requestId) return;
      const allMeds = [...active, ...inactive];
      setMedications(allMeds);
      setGroups(groupList);
      setGroupMembers(groupMemberList);

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
    <Screen edges={['left', 'right', 'bottom']} scroll={false} contentClassName="pt-4">
      <Pressable
        accessibilityRole="button"
        className="min-h-12 rounded-card border border-brand-border bg-white px-4 py-3 dark:border-night-border dark:bg-night-card"
        onPress={() => setPickerOpen(true)}>
        <Text muted className="text-xs">
          Medication
        </Text>
        <Text className="text-sm font-semibold">{selectedLabel}</Text>
      </Pressable>

      <PillTabs
        variant="range"
        tabs={RANGE_PRESETS.map((p) => ({ value: p.key, label: `Last ${p.label}` }))}
        value={rangeKey}
        onChange={setRangeKey}
      />

      {error ? <Text className="text-sm text-status-danger dark:text-status-danger">{error}</Text> : null}

      {loading ? (
        <ActivityIndicator className="mt-8" />
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(row) => row.id}
          ListEmptyComponent={
            <Text muted className="text-sm">
              No dose history for this filter.
            </Text>
          }
          contentContainerClassName="gap-2 pb-10"
          renderItem={({ item: row }) => {
            const badge = statusBadge(row, graceMinutes);
            return (
              <Pressable accessibilityRole="button" onPress={() => setEditingLog(row)}>
                <Card flat className="flex-row items-center justify-between gap-2 p-3">
                  <View className="flex-1 gap-0.5">
                    <MedName className="text-sm font-semibold" name={row.medications.name} dose={row.medications.dose} />
                    <Text muted className="text-xs">
                      {row.scheduled_for_date} · {to12h(row.scheduled_time.slice(0, 5))}
                    </Text>
                    {row.note ? (
                      <Text muted className="text-sm italic">
                        {row.note}
                      </Text>
                    ) : null}
                  </View>
                  <View className="items-end gap-1">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    <Text className="text-xs font-medium text-brand-deep-blue dark:text-brand-cyan">Edit</Text>
                  </View>
                </Card>
              </Pressable>
            );
          }}
        />
      )}

      {pickerOpen ? (
        <Sheet onClose={() => setPickerOpen(false)}>
          <Text className="mb-3 text-lg font-bold text-brand-navy dark:text-white">Medication</Text>
          <ScrollView className="max-h-80">
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
          <Button label="Close" variant="ghost" className="mt-3" onPress={() => setPickerOpen(false)} />
        </Sheet>
      ) : null}

      {editingLog ? (
        <EditDoseLogSheet
          key={editingLog.id}
          log={editingLog}
          medication={medications.find((m) => m.id === editingLog.medication_id) ?? null}
          groups={groups}
          groupMembers={groupMembers}
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
      ) : null}
    </Screen>
  );
}

function PickerRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-12 justify-center border-b border-brand-border dark:border-night-border"
      onPress={onPress}>
      <Text className={cn('text-base', selected && 'font-bold text-brand-deep-blue dark:text-brand-cyan')}>{label}</Text>
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

// Pads a single-digit hour ("9:05") to the two-digit form ("09:05") the
// ECMAScript date-time string format requires — TIME_RE (shared with the
// medication schedule-time form, which stores the string as-is rather
// than parsing it) accepts a single-digit hour, but passing one straight
// into `new Date(...)` yields an Invalid Date whose toISOString() throws.
function normalizeTime(time: string): string {
  const [hours, minutes] = time.split(':');
  return `${hours.padStart(2, '0')}:${minutes}`;
}

type GroupMemberRow = { group_id: string; medication_id: string; quantity_per_dose: number | null };

// The medication's own quantity_per_dose is only the right fallback for a
// slot with no group or per-schedule-time override — resolve the actual
// configured amount for this log's own (medication, scheduled_time) via
// the same generateDaySlots the dashboard's Take flow uses, so correcting
// a skipped/missed entry to Taken deducts the same amount the normal Take
// button would have.
function resolveHistoricalQuantityPerDose(
  log: CalendarLogRow,
  medication: Medication,
  groups: MedicationGroup[],
  groupMembers: GroupMemberRow[],
): number {
  const slots = generateDaySlots(
    log.scheduled_for_date,
    [medication],
    groups,
    groupMembers,
    [],
    [],
    { ignoreDashboardVisibility: true },
  );
  const slot = slots.find((s) => s.scheduledTime === log.scheduled_time.slice(0, 5));
  return slot?.quantityPerDose ?? medication.quantity_per_dose;
}

function EditDoseLogSheet({
  log,
  medication,
  groups,
  groupMembers,
  onClose,
  onSaved,
  onDeleted,
}: {
  log: CalendarLogRow;
  medication: Medication | null;
  groups: MedicationGroup[];
  groupMembers: GroupMemberRow[];
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
          : resolveHistoricalQuantityPerDose(log, medication, groups, groupMembers);
      await editDoseLog(log.id, {
        status,
        takenAt: status === 'taken' ? new Date(`${baseDate}T${normalizeTime(time)}:00`).toISOString() : null,
        // A metric the medication no longer tracks (feedback_type changed
        // since this entry was logged) has no input shown to edit it —
        // preserve the log's own historical value rather than let it fall
        // through to editDoseLog's `undefined` -> null default and get
        // silently erased by an edit that never touched it.
        painLevel: status === 'taken' ? (trackPain ? painLevel : (log.pain_level ?? undefined)) : undefined,
        moodLevel: status === 'taken' ? (trackMood ? moodLevel : (log.mood_level ?? undefined)) : undefined,
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
    <FormSheet
      title="Edit dose entry"
      subtitle={medication ? `${medication.name}${medication.dose ? ` — ${medication.dose}` : ''}` : undefined}
      onClose={onClose}
      error={formError}
      footer={
        <>
          <Button label="Cancel" variant="ghost" className="flex-1" onPress={onClose} disabled={saving || deleting} />
          <Button
            label={saving ? 'Saving…' : 'Save'}
            className="flex-1"
            loading={saving}
            disabled={deleting || !medication}
            onPress={handleSave}
          />
        </>
      }>
      <View className="gap-1">
        <Text className="text-sm">Status</Text>
        <PillTabs tabs={STATUS_OPTIONS} value={status} onChange={setStatus} />
      </View>

      {status === 'taken' ? (
        <>
          <Field label="Time taken" value={time} onChangeText={setTime} placeholder="HH:MM" />

          {trackPain ? <LevelBlock label="Pain level" metric="pain" value={painLevel} onChange={setPainLevel} /> : null}
          {trackMood ? <LevelBlock label="Mood level" metric="mood" value={moodLevel} onChange={setMoodLevel} /> : null}

          <Field
            label="Notes (optional)"
            className="min-h-20"
            style={{ textAlignVertical: 'top' }}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={255}
          />
        </>
      ) : null}

      <Pressable onPress={confirmDelete} disabled={deleting} className="min-h-11 items-center justify-center">
        <Text className="text-sm font-semibold text-status-danger dark:text-status-danger">{deleting ? 'Deleting…' : 'Delete entry'}</Text>
      </Pressable>
    </FormSheet>
  );
}

// Level picker block: label plus the 1–10 grid (DESIGN.md 6.3 / 9.7).
function LevelBlock({
  label,
  metric,
  value,
  onChange,
}: {
  label: string;
  metric: 'pain' | 'mood';
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm">{label}</Text>
      <LevelGrid metric={metric} value={value} onChange={onChange} />
    </View>
  );
}
