import { useState } from 'react';
import { View } from 'react-native';

import {
  nowTime,
  normalizeTime,
  resolveHistoricalQuantityPerDose,
  timeFromIso,
  TIME_RE,
  type GroupMemberRow,
} from '@/components/edit-dose-log-sheet';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormSheet } from '@/components/ui/form-sheet';
import { PillTabs } from '@/components/ui/pill-tabs';
import { Text } from '@/components/ui/text';
import { TimeField } from '@/components/ui/time-field';
import { editDoseLogsBatch, type CalendarLogRow } from '@/lib/dose-logs';
import type { DoseLogStatus, Medication, MedicationGroup } from '@/lib/types/medications';
import { localDateString } from '@/lib/utils';

const STATUS_OPTIONS: { value: DoseLogStatus; label: string }[] = [
  { value: 'taken', label: 'Taken' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'missed', label: 'Missed' },
];

// "Edit all — {Group}" (DESIGN.md 9.8): one status / time / note applied to
// every member's dose log for the same group dose. Each member's own
// pain / mood values are preserved.
export function EditGroupDoseSheet({
  groupName,
  logs,
  medications,
  groups,
  groupMembers,
  onClose,
  onSaved,
}: {
  groupName: string;
  logs: CalendarLogRow[];
  medications: Medication[];
  groups: MedicationGroup[];
  groupMembers: GroupMemberRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const first = logs[0];
  const [status, setStatus] = useState<DoseLogStatus>(logs.every((l) => l.status === first.status) ? first.status : 'taken');
  const [time, setTime] = useState(() => timeFromIso(logs.find((l) => l.taken_at)?.taken_at ?? null) ?? nowTime());
  const [note, setNote] = useState(() => (logs.every((l) => l.note === first.note) ? (first.note ?? '') : ''));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSave() {
    setFormError(null);
    if (status === 'taken' && !TIME_RE.test(time)) {
      setFormError('Enter a valid time (hour 1–12, minute 00–59).');
      return;
    }
    setSaving(true);
    try {
      // One transactional RPC: every member is edited or none are.
      const edits = logs.flatMap((log) => {
        const medication = medications.find((m) => m.id === log.medication_id);
        if (!medication) return [];
        const baseDate = log.taken_at ? localDateString(new Date(log.taken_at)) : log.scheduled_for_date;
        const quantityPerDose =
          status === 'taken' && log.status === 'taken' && log.deducted_quantity !== null
            ? log.deducted_quantity
            : resolveHistoricalQuantityPerDose(log, medication, groups, groupMembers);
        return [
          {
            logId: log.id,
            status,
            takenAt: status === 'taken' ? new Date(`${baseDate}T${normalizeTime(time)}:00`).toISOString() : null,
            painLevel: status === 'taken' ? (log.pain_level ?? undefined) : undefined,
            moodLevel: status === 'taken' ? (log.mood_level ?? undefined) : undefined,
            note: status === 'taken' ? note.trim() : '',
            quantityPerDose,
            inventoryEnabled: medication.inventory_enabled,
          },
        ];
      });
      await editDoseLogsBatch(edits);
      onSaved();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't save changes");
      setSaving(false);
    }
  }

  return (
    <FormSheet
      title={`Edit all — ${groupName}`}
      subtitle={`Applies to all ${logs.length} medications in this group for this dose.`}
      onClose={onClose}
      dismissible={!saving}
      error={formError}
      footer={
        <>
          <Button label="Cancel" variant="ghost" className="flex-1" onPress={onClose} disabled={saving} />
          <Button label={saving ? 'Saving…' : 'Save'} className="flex-1" loading={saving} onPress={handleSave} />
        </>
      }>
      <View className="gap-1">
        <Text className="text-sm">Status (applies to all)</Text>
        <PillTabs tabs={STATUS_OPTIONS} value={status} onChange={setStatus} />
      </View>

      {status === 'taken' ? (
        <>
          <TimeField label="Time taken" value={time} onChange={setTime} />
          <Field
            label="Notes (optional, applies to all)"
            className="min-h-20"
            style={{ textAlignVertical: 'top' }}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={255}
          />
        </>
      ) : null}
    </FormSheet>
  );
}
