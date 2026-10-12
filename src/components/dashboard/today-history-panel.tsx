import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { EditDoseLogSheet } from '@/components/edit-dose-log-sheet';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MedName } from '@/components/ui/med-name';
import { PanelTitle } from '@/components/ui/screen-title';
import { ScoreBadge } from '@/components/ui/score-badge';
import { Text } from '@/components/ui/text';
import { getMissedGraceMinutes } from '@/lib/app-settings';
import { getCalendarLogs, type CalendarLogRow } from '@/lib/dose-logs';
import { getInactiveMedications } from '@/lib/medications';
import type { Medication, MedicationGroup } from '@/lib/types/medications';
import { formatLate, isLate, minutesLate, to12h } from '@/lib/utils';

const COLLAPSED_COUNT = 4;

function badgeVariantFor(row: CalendarLogRow, graceMinutes: number): BadgeVariant {
  if (row.status === 'taken') return isLate(row, graceMinutes) ? 'late' : 'taken';
  return row.status;
}

type GroupMemberRow = { group_id: string; medication_id: string; quantity_per_dose: number | null };

// Today's history (DESIGN.md 8.4): the first 4 logged doses (sortable) with a
// "View more" button, score badges, the note (hidden when it starts with
// "Auto-") and a status badge with an Edit link for active medications.
// `refreshKey` changes whenever the dashboard reloads, so the list follows
// every Take / Skip.
export function TodayHistoryPanel({
  date,
  medications,
  groups,
  groupMembers,
  refreshKey,
}: {
  date: string;
  /** The active profile's active medications; inactive ones are fetched here. */
  medications: Medication[];
  groups: MedicationGroup[];
  groupMembers: GroupMemberRow[];
  refreshKey: unknown;
}) {
  const [inactive, setInactive] = useState<Medication[]>([]);
  const [rows, setRows] = useState<CalendarLogRow[]>([]);
  const [graceMinutes, setGraceMinutes] = useState(60);
  const [newestFirst, setNewestFirst] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<CalendarLogRow | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const profileId = medications[0]?.profile_id ?? null;
  const allMedications = useMemo(() => [...medications, ...inactive], [medications, inactive]);
  const medicationIds = useMemo(() => allMedications.map((m) => m.id), [allMedications]);
  const idsKey = medicationIds.join(',');

  useEffect(() => {
    let cancelled = false;
    getInactiveMedications(profileId)
      .then((meds) => {
        if (!cancelled) setInactive(meds);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [profileId, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      medicationIds.length > 0 ? getCalendarLogs(date, date, medicationIds) : Promise.resolve([] as CalendarLogRow[]),
      getMissedGraceMinutes(),
    ])
      .then(([logs, grace]) => {
        if (cancelled) return;
        // getCalendarLogs sorts oldest-first.
        setRows(logs);
        setGraceMinutes(grace);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // medicationIds is covered by idsKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, idsKey, refreshKey, reloadToken]);

  const entries = useMemo(() => (newestFirst ? [...rows].reverse() : rows), [rows, newestFirst]);
  const visible = showAll ? entries : entries.slice(0, COLLAPSED_COUNT);
  const editingMedication = editing ? (allMedications.find((m) => m.id === editing.medication_id) ?? null) : null;

  return (
    <Card className="gap-3">
      <View className="flex-row items-center justify-between gap-3">
        <PanelTitle>Today&apos;s history</PanelTitle>
        <View className="flex-row items-center gap-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={newestFirst ? 'Sort: newest first' : 'Sort: oldest first'}
            className="h-11 w-11 items-center justify-center"
            onPress={() => setNewestFirst((v) => !v)}>
            <Ionicons name="swap-vertical" size={16} color="#60708A" />
          </Pressable>
          <Pressable accessibilityRole="link" className="min-h-11 justify-center" onPress={() => router.push('/history')}>
            <Text className="text-sm font-medium text-brand-deep-blue dark:text-brand-cyan">View all history</Text>
          </Pressable>
        </View>
      </View>

      {entries.length === 0 ? (
        <Text muted className="text-sm">
          No doses logged today yet.
        </Text>
      ) : (
        <View className="gap-2">
          {visible.map((row) => {
            const lateMin = row.status === 'taken' ? minutesLate(row, graceMinutes) : null;
            const medication = allMedications.find((m) => m.id === row.medication_id);
            const isSystemNote = row.note.startsWith('Auto-');
            return (
              <View
                key={row.id}
                className="flex-row items-start justify-between gap-3 rounded-control border border-brand-border p-3 dark:border-night-border">
                <View className="min-w-0 flex-1 flex-row gap-3">
                  <Text muted className="w-14 pt-0.5 text-xs">
                    {to12h(row.scheduled_time.slice(0, 5))}
                  </Text>
                  <View className="min-w-0 flex-1 gap-1">
                    <MedName className="text-sm font-medium" name={row.medications.name} dose={row.medications.dose} />
                    {row.pain_level !== null || row.mood_level !== null ? (
                      <View className="flex-row flex-wrap gap-1.5">
                        {row.pain_level !== null ? <ScoreBadge type="pain" level={row.pain_level} /> : null}
                        {row.mood_level !== null ? <ScoreBadge type="mood" level={row.mood_level} /> : null}
                      </View>
                    ) : null}
                    {row.note && !isSystemNote ? (
                      <Text muted className="text-sm">
                        {row.note}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View className="items-end gap-1">
                  <Badge variant={badgeVariantFor(row, graceMinutes)}>
                    {row.status === 'taken' && lateMin !== null ? `Taken (${formatLate(lateMin)})` : undefined}
                  </Badge>
                  {medication?.active ? (
                    <Pressable accessibilityRole="button" className="min-h-9 justify-center" hitSlop={6} onPress={() => setEditing(row)}>
                      <Text className="text-xs text-brand-deep-blue dark:text-brand-cyan">Edit</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {!showAll && entries.length > COLLAPSED_COUNT ? (
        <Button label="View more" variant="secondary" className="w-full" onPress={() => setShowAll(true)} />
      ) : null}

      {editing ? (
        <EditDoseLogSheet
          key={editing.id}
          log={editing}
          medication={editingMedication}
          groups={groups}
          groupMembers={groupMembers}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setReloadToken((t) => t + 1);
          }}
          onDeleted={() => {
            setEditing(null);
            setReloadToken((t) => t + 1);
          }}
        />
      ) : null}
    </Card>
  );
}
