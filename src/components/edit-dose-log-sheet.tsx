import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormSheet } from '@/components/ui/form-sheet';
import { LevelGrid } from '@/components/ui/level-grid';
import { PillTabs } from '@/components/ui/pill-tabs';
import { Text } from '@/components/ui/text';
import { deleteDoseLog, editDoseLog, type CalendarLogRow } from '@/lib/dose-logs';
import { medicationTracksMood, medicationTracksPain } from '@/lib/pain-mood';
import { generateDaySlots } from '@/lib/schedule';
import type { DoseLogStatus, Medication, MedicationGroup } from '@/lib/types/medications';
import { localDateString } from '@/lib/utils';

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

const STATUS_OPTIONS: { value: DoseLogStatus; label: string }[] = [
  { value: 'taken', label: 'Taken' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'missed', label: 'Missed' },
];

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

// Edit a dose_logs entry (DESIGN.md 9.7): status, time taken, pain / mood and
// notes, with a confirmed delete. Shared by History and the dashboard's
// Today's history panel.
export function EditDoseLogSheet({
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
