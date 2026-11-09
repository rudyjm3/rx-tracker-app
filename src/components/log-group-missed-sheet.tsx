import { useState } from 'react';
import { View } from 'react-native';

import { normalizeTime, resolveAsNeededGroupQuantity, TIME_RE, type GroupMemberRow } from '@/components/edit-dose-log-sheet';
import { Button } from '@/components/ui/button';
import { FormSheet } from '@/components/ui/form-sheet';
import { PillTabs } from '@/components/ui/pill-tabs';
import { LimitedNoteField } from '@/components/ui/limited-note-field';
import { Text } from '@/components/ui/text';
import { TimeField } from '@/components/ui/time-field';
import { recordDose, recordDoseAtTime } from '@/lib/dose-logs';
import { generateDaySlots } from '@/lib/schedule';
import type { Medication, MedicationGroup } from '@/lib/types/medications';

export type MissedGroupEntry = { medicationId: string; time: string };

const STATUS_OPTIONS: { value: 'taken' | 'skipped'; label: string }[] = [
  { value: 'taken', label: 'Taken' },
  { value: 'skipped', label: 'Skipped' },
];

// Bulk-logs a group's overdue doses that have no dose_logs row yet (shown as
// "Missed" on the calendar). One status / time / note applies to every member,
// mirroring the dashboard's group "Take all" and the calendar's "Edit all".
export function LogGroupMissedSheet({
  groupName,
  date,
  displayTime,
  entries,
  medications,
  groups,
  groupMembers,
  onClose,
  onSaved,
}: {
  groupName: string;
  date: string;
  displayTime: string;
  entries: MissedGroupEntry[];
  medications: Medication[];
  groups: MedicationGroup[];
  groupMembers: GroupMemberRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<'taken' | 'skipped'>('taken');
  const [time, setTime] = useState(() => entries[0].time);
  const [note, setNote] = useState('');
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
      const takenAt = status === 'taken' ? new Date(`${date}T${normalizeTime(time)}:00`).toISOString() : null;
      await Promise.all(
        entries.map((entry) => {
          const medication = medications.find((m) => m.id === entry.medicationId);
          if (!medication) return Promise.resolve();
          // Same slot generation the dashboard's Take uses, so the inventory
          // deduction honours group / per-time quantity overrides.
          const slot = generateDaySlots(date, [medication], groups, groupMembers, [], [], {
            ignoreDashboardVisibility: true,
          }).find((s) => s.scheduledTime.slice(0, 5) === entry.time);
          const quantityPerDose = slot?.quantityPerDose ?? resolveAsNeededGroupQuantity(medication, groups, groupMembers);
          if (status === 'taken') {
            return recordDoseAtTime(medication, date, entry.time, takenAt!, quantityPerDose, {
              note: note.trim() || undefined,
            });
          }
          return recordDose(medication, date, entry.time, 'skipped', quantityPerDose);
        }),
      );
      onSaved();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't save changes");
      setSaving(false);
    }
  }

  return (
    <FormSheet
      title={`Log all — ${groupName}`}
      subtitle={`Logs all ${entries.length} medications in this group for the ${displayTime} dose.`}
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
          <LimitedNoteField label="Notes (optional, applies to all)" value={note} onChangeText={setNote} />
        </>
      ) : null}
    </FormSheet>
  );
}
