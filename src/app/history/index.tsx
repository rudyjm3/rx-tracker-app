import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, ScrollView, View } from 'react-native';

import { EditDoseLogSheet } from '@/components/edit-dose-log-sheet';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MedName } from '@/components/ui/med-name';
import { PillTabs } from '@/components/ui/pill-tabs';
import { Screen } from '@/components/ui/screen';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { useActiveProfile } from '@/lib/active-profile';
import { getMissedGraceMinutes } from '@/lib/app-settings';
import { getCalendarLogs, type CalendarLogRow } from '@/lib/dose-logs';
import { getActiveMedications, getGroupMembers, getGroups, getInactiveMedications } from '@/lib/medications';
import type { Medication, MedicationGroup } from '@/lib/types/medications';
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
