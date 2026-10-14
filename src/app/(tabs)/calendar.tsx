import { useCallback, useMemo, useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { ScreenTitle } from '@/components/ui/screen-title';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/use-theme';
import { useActiveProfile } from '@/lib/active-profile';
import { cn } from '@/lib/cn';
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

const ENDS_FLAG_COLOR = '#F5A524';

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// Day cell background = worst status (DESIGN.md 8.7): missed -> danger/10,
// skipped without any taken -> warning/10, taken -> success/10, no data ->
// white, future -> brand-bg.
const DAY_BG: Record<CalendarDayColor, string> = {
  future: 'bg-brand-bg dark:bg-night-selected',
  missed: 'bg-status-danger/10',
  skipped: 'bg-status-warning/10',
  taken: 'bg-status-success/10',
  empty: 'bg-white dark:bg-night-card',
};

export default function CalendarScreen() {
  const theme = useTheme();
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
    <Screen>
      <View className="flex-row items-center justify-between gap-2">
        <ScreenTitle>Calendar</ScreenTitle>
        <Button label="View history" variant="secondary" size="compact" onPress={() => router.push('/history')} />
      </View>

      <Card className="gap-4 p-4">
        <View className="flex-row items-center justify-between">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            className="h-11 w-11 items-center justify-center"
            onPress={() => changeMonth(-1)}>
            <Ionicons name="chevron-back" size={22} color={theme.accent} />
          </Pressable>
          <Text className="text-lg font-bold text-brand-navy dark:text-white">{bounds.label}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            className="h-11 w-11 items-center justify-center"
            onPress={() => changeMonth(1)}>
            <Ionicons name="chevron-forward" size={22} color={theme.accent} />
          </Pressable>
        </View>

        {error ? <Text className="text-sm text-status-danger dark:text-status-danger">{error}</Text> : null}

        <View>
          <View className="flex-row">
            {WEEKDAY_LABELS.map((label) => (
              <Text key={label} muted className="w-[14.28%] text-center text-xs font-semibold">
                {label}
              </Text>
            ))}
          </View>

          {loading ? (
            <ActivityIndicator className="my-8" />
          ) : (
            <View className="mt-1 flex-row flex-wrap">
              {cells.map((cell, i) => {
                if (!cell.date) return <View key={`blank-${i}`} className="min-h-[76px] w-[14.28%]" />;
                const detail = dayDetails[cell.date];
                const isFuture = detail ? detail.isFuture : cell.date > today;
                const marker = markers[cell.date];
                const dayColor = calendarDayColor(isFuture, marker);
                const isToday = cell.date === today;
                const hasMarkerCounts =
                  !isFuture && marker && (marker.taken > 0 || marker.skipped > 0 || marker.missed > 0);
                const endingMedications = detail?.endingMedications ?? [];

                return (
                  <Pressable
                    key={cell.date}
                    accessibilityLabel={`${bounds.label.split(' ')[0]} ${cell.day}`}
                    className="min-h-[76px] w-[14.28%] items-center p-px active:opacity-80"
                    onPress={() => setSelectedDate(cell.date)}>
                    <View
                      className={cn(
                        'min-h-[72px] w-full gap-px rounded-control p-[3px]',
                        isToday ? 'border-2 border-brand-blue' : 'border border-brand-border/60 dark:border-night-border',
                        DAY_BG[dayColor],
                      )}>
                      <View className="flex-row items-center justify-between">
                        <Text className={cn('text-sm font-semibold', dayColor === 'future' && 'text-brand-text-muted dark:text-night-muted')}>
                          {cell.day}
                        </Text>
                        {endingMedications.length > 0 ? (
                          <Ionicons name="flag" size={11} color={ENDS_FLAG_COLOR} accessibilityLabel="Medication ends" />
                        ) : null}
                      </View>
                      {hasMarkerCounts ? (
                        <View className="flex-row flex-wrap gap-x-1">
                          {marker!.taken > 0 ? (
                            <Text className="text-[10px] font-medium text-status-success dark:text-status-success">{marker!.taken}T</Text>
                          ) : null}
                          {marker!.skipped > 0 ? (
                            <Text className="text-[10px] font-medium text-status-warning dark:text-status-warning">{marker!.skipped}S</Text>
                          ) : null}
                          {marker!.missed > 0 ? (
                            <Text className="text-[10px] font-medium text-status-danger dark:text-status-danger">{marker!.missed}M</Text>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <View className="flex-row justify-center gap-6">
          <LegendItem className="bg-status-success" label="Taken" />
          <LegendItem className="bg-status-warning" label="Skipped" />
          <LegendItem className="bg-status-danger" label="Missed" />
        </View>
      </Card>

      {selectedDate ? (
        <Sheet onClose={() => setSelectedDate(null)}>
          <Text className="mb-3 text-lg font-bold text-brand-navy dark:text-white">
            {selectedDay ? `${selectedDay.dayName}, ${selectedDay.displayDate}` : selectedDate}
          </Text>
          <ScrollView className="max-h-[420px]">
            <DayDetailContent
              day={selectedDay}
              onLogAsNeeded={(medicationId, date) => {
                setSelectedDate(null);
                router.push(`/medications/${medicationId}?action=logDose&date=${date}`);
              }}
            />
          </ScrollView>
          <Button label="Close" variant="ghost" className="mt-3" onPress={() => setSelectedDate(null)} />
        </Sheet>
      ) : null}
    </Screen>
  );
}

// Amber callout for regimens ending today (DESIGN.md 10.4).
const ENDING_BOX = 'rounded-control border border-amber-400 bg-amber-50 dark:border-amber-500 dark:bg-amber-950';
const ENDING_TEXT = 'text-amber-700 dark:text-amber-300';

function DayDetailContent({
  day,
  onLogAsNeeded,
}: {
  day: CalendarDayDetail | null;
  onLogAsNeeded: (medicationId: string, date: string) => void;
}) {
  if (!day) {
    return <Text muted className="text-sm">No data for this day.</Text>;
  }

  const endingIds = new Set(day.endingMedications.map((m) => m.medicationId));

  const endingCallout = day.endingMedications.length > 0 && (
    <Text className={cn('mb-2 text-sm font-bold', ENDING_TEXT)}>
      Ends today:{' '}
      {day.endingMedications.map((med) => (med.dose ? `${med.name} ${med.dose}` : med.name)).join(', ')}
    </Text>
  );

  const totalPlannedSlots =
    day.plannedMedications.length + day.plannedGroups.reduce((n, g) => n + g.medications.length, 0);
  // Distinct medications, not planned slot entries — a medication with
  // more than one occurrence that day (e.g. twice-daily) must still count
  // once, consistent with the non-future branch's medication summaries.
  const totalPlannedMedications = new Set([
    ...day.plannedMedications.map((m) => m.medicationId),
    ...day.plannedGroups.flatMap((g) => g.medications.map((m) => m.medicationId)),
  ]).size;
  const totalMedicationsForSummary = day.isFuture
    ? totalPlannedMedications
    : day.medications.length + day.groups.reduce((n, g) => n + g.medications.length, 0);
  const summaryLine = (
    <Text muted className="mb-2 text-sm">
      Medications: {totalMedicationsForSummary} | Planned doses — Required: {day.plannedRequired} / Non-required:{' '}
      {day.plannedNonRequired}
    </Text>
  );

  if (day.isFuture) {
    const totalPlanned = totalPlannedSlots;
    return (
      <View>
        {endingCallout}
        {summaryLine}
        {totalPlanned === 0 ? (
          <Text muted className="text-sm">No doses planned for this day.</Text>
        ) : (
          <>
            {day.plannedGroups.map((group) => (
              <GroupBox key={group.groupId} name={group.groupName}>
                {group.medications.map((slot) => (
                  <PlannedSlotRow
                    key={`${slot.medicationId}-${slot.scheduledTime}`}
                    slot={slot}
                    endingToday={endingIds.has(slot.medicationId)}
                  />
                ))}
              </GroupBox>
            ))}
            {day.plannedMedications.map((slot) => (
              <View key={`${slot.medicationId}-${slot.scheduledTime}`} className="mb-3 rounded-control border border-brand-border p-2 dark:border-night-border">
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
      {endingCallout}
      {summaryLine}
      {totalMedications === 0 && day.groups.length === 0 && day.pendingUngroupedAsNeeded.length === 0 ? (
        <Text muted className="text-sm">No dose data for this day.</Text>
      ) : (
        <>
          {day.groups.map((group) => (
            <GroupBox key={group.groupId} name={group.groupName}>
              {group.medications.map((med) => (
                <MedicationSummaryRow
                  key={med.medicationId}
                  med={med}
                  endingToday={endingIds.has(med.medicationId)}
                />
              ))}
              {group.pendingAsNeeded.map((member) => (
                <View key={member.medicationId} className="flex-row items-center justify-between gap-2 rounded-control bg-brand-bg px-2.5 py-2 dark:bg-night-selected">
                  <View className="flex-1">
                    <Text className="text-sm font-semibold">
                      {member.name}
                      {member.dose ? ` ${member.dose}` : ''}
                    </Text>
                    <Text muted className="text-xs">Not yet logged</Text>
                  </View>
                  <Pressable className="min-h-11 justify-center" onPress={() => onLogAsNeeded(member.medicationId, day.date)} hitSlop={8}>
                    <Text className="text-sm font-bold text-brand-deep-blue dark:text-brand-cyan">Log dose</Text>
                  </Pressable>
                </View>
              ))}
            </GroupBox>
          ))}
          {day.medications.map((med) => (
            <View
              key={med.medicationId}
              className={cn(
                'mb-3 rounded-control border p-2',
                endingIds.has(med.medicationId) ? ENDING_BOX : 'border-brand-border dark:border-night-border',
              )}>
              <MedicationSummaryRow med={med} endingToday={endingIds.has(med.medicationId)} />
            </View>
          ))}
          {day.pendingUngroupedAsNeeded.map((med) => (
            <View key={med.medicationId} className="mb-3 rounded-control border border-brand-border p-2 dark:border-night-border">
              <View className="flex-row items-center justify-between gap-2">
                <Text className="flex-1 text-sm font-semibold">
                  {med.name}
                  {med.dose ? ` ${med.dose}` : ''}
                </Text>
                <Pressable className="min-h-11 justify-center" onPress={() => onLogAsNeeded(med.medicationId, day.date)} hitSlop={8}>
                  <Text className="text-sm font-bold text-brand-deep-blue dark:text-brand-cyan">
                    {med.alreadyLogged ? 'Log another dose' : 'Log dose'}
                  </Text>
                </Pressable>
              </View>
              <Text muted className="text-xs">
                {med.alreadyLogged ? 'As needed' : 'As needed · not yet logged'}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

// Group as a bordered card with a Layers title (DESIGN.md 9.6).
function GroupBox({ name, children }: { name: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View className="mb-3 gap-2 rounded-card border border-brand-border p-3 dark:border-night-border">
      <View className="flex-row items-center gap-1.5">
        <Ionicons name="layers-outline" size={14} color={theme.accent} />
        <Text className="text-sm font-bold text-brand-navy dark:text-white">{name}</Text>
      </View>
      {children}
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
    <View className="gap-1 p-0.5">
      <Text className="text-sm font-bold">
        {med.name}
        {med.dose ? ` ${med.dose}` : ''}
      </Text>
      {endingToday ? <Text className={cn('text-xs font-semibold', ENDING_TEXT)}>Today is the last day for this regimen.</Text> : null}
      <Text muted className="text-xs">
        Total doses {med.total} — Taken: {med.taken} / Late: {med.late} — Skipped: {med.skipped} — Missed: {med.missed}
      </Text>
      {med.slots.map((slot) => (
        <View key={slot.logId} className="gap-0.5 rounded-control bg-brand-bg px-2.5 py-2 dark:bg-night-selected">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm">{slot.displayTime}</Text>
            {slot.status === 'taken' ? (
              <Badge variant={slot.isLate ? 'late' : 'taken'}>{slot.isLate ? `Taken (${slot.lateLabel})` : 'Taken'}</Badge>
            ) : (
              <Badge variant={slot.status === 'skipped' ? 'skipped' : 'missed'} />
            )}
          </View>
          {slot.note ? (
            <Text muted className="text-xs italic">
              {slot.note}
            </Text>
          ) : null}
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
    <View className={cn('gap-0.5 p-0.5', endingToday && ENDING_BOX)}>
      <View className="flex-row items-center justify-between gap-2">
        <Text className="flex-1 text-sm font-bold">
          {slot.name}
          {slot.dose ? ` ${slot.dose}` : ''}
        </Text>
        <Text muted className="text-xs">
          {slot.displayTime}
        </Text>
      </View>
      {endingToday ? <Text className={cn('text-xs font-semibold', ENDING_TEXT)}>Today is the last day for this regimen.</Text> : null}
      <Text muted className="text-xs">
        {slot.isPrn ? 'Planned (as needed)' : 'Scheduled'}
      </Text>
    </View>
  );
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className={cn('h-2.5 w-2.5 rounded-full', className)} />
      <Text muted className="text-xs">
        {label}
      </Text>
    </View>
  );
}
