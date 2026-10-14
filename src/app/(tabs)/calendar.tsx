import { useCallback, useMemo, useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  summarizeDay,
  summarizeMonth,
  type CalendarDayColor,
  type CalendarMonthSummary,
  type CalendarDayDetail,
} from '@/lib/calendar';
import { getMissedGraceMinutes } from '@/lib/app-settings';
import { getCalendarLogs } from '@/lib/dose-logs';
import { getActiveMedications, getGroupMembers, getGroups, getInactiveMedications } from '@/lib/medications';
import { getRunoutByDate, type RunoutEntry } from '@/lib/schedule';
import type { Medication, MedicationGroupMember } from '@/lib/types/medications';
import { formatDate, localDateString } from '@/lib/utils';

const ENDS_FLAG_COLOR = '#F5A524';

// Run-out marker: red when the projected run-out is within a week (or the
// medication is already out/low), amber when further away.
const RUNOUT_URGENT_DAYS = 7;
const RUNOUT_URGENT_COLOR = '#E5484D';
const RUNOUT_SOON_COLOR = '#F5A524';
const RUNOUT_ICON = 'bottle-tonic-plus';
const RUNOUT_ESTIMATE_NOTE = 'Run-out dates are estimates that assume your current schedule continues.';

function runoutColor(runouts: RunoutEntry[]): string {
  return runouts.some((r) => r.daysLeft <= RUNOUT_URGENT_DAYS) ? RUNOUT_URGENT_COLOR : RUNOUT_SOON_COLOR;
}

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// Day cell background = worst status (any missed -> danger, else any skipped
// -> warning, else all taken -> success), as a light brand tint. Days with
// nothing logged and future days keep the neutral light-blue tint.
const NEUTRAL_BG = 'bg-brand-bg dark:bg-night-selected';
const DAY_BG: Record<CalendarDayColor, string> = {
  future: NEUTRAL_BG,
  missed: 'bg-status-danger/20',
  skipped: 'bg-status-warning/20',
  taken: 'bg-status-success/20',
  empty: NEUTRAL_BG,
};

// Count text sits on a tinted cell, so use darker shades of the brand hues
// (light mode) for readable contrast; the raw brand colors are too pale.
const COUNT_TEXT = {
  taken: 'text-teal-800 dark:text-status-success',
  skipped: 'text-amber-800 dark:text-status-warning',
  missed: 'text-red-800 dark:text-status-danger',
  late: 'text-orange-700 dark:text-orange-400',
};

export default function CalendarScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { activeProfileId } = useActiveProfile();
  const [month, setMonth] = useState(currentMonth());
  const [dayDetails, setDayDetails] = useState<Record<string, CalendarDayDetail>>({});
  const [runoutByDate, setRunoutByDate] = useState<Record<string, RunoutEntry[]>>({});
  const [excludedIds, setExcludedIds] = useState<ReadonlySet<string>>(new Set());
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
      const logData = await getCalendarLogs(b.monthStart, b.monthEnd, medicationIds);
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
      setDayDetails(details);
      // Same fetched medications/groups as the grid (already scoped to the
      // selected profile), so a dose or inventory edit moves the markers on
      // the next focus-triggered reload — no separate fetch or polling.
      setRunoutByDate(
        getRunoutByDate(
          activeMeds,
          groups,
          groupMembers as Pick<MedicationGroupMember, 'group_id' | 'medication_id' | 'quantity_per_dose'>[],
          localDateString(),
        ),
      );
      // Left out of the month's adherence: PRN and adherence-tracking-off medications.
      setExcludedIds(
        new Set(allMedications.filter((med) => med.as_needed || !med.adherence_enabled).map((med) => med.id)),
      );
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

  const summary = useMemo(() => summarizeMonth(dayDetails, today, excludedIds), [dayDetails, today, excludedIds]);

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

        {loading || error ? null : <MonthSummaryRow summary={summary} />}

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
                // One source for color, badges and summary: the day-detail slots
                // (logged outcomes plus unlogged doses past their grace period).
                const stats = detail && !isFuture ? summarizeDay(detail, excludedIds, true) : undefined;
                const dayColor = calendarDayColor(isFuture, stats);
                const isToday = cell.date === today;
                const hasMarkerCounts = !!stats && (stats.taken > 0 || stats.skipped > 0 || stats.missed > 0);
                const lateCount = stats?.late ?? 0;
                const endingMedications = detail?.endingMedications ?? [];
                // Past days never show a marker; one icon per cell however many medications run out.
                const runouts = cell.date >= today ? (runoutByDate[cell.date] ?? []) : [];

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
                        <Text className={cn('text-sm font-semibold', (dayColor === 'future' || dayColor === 'empty') && 'text-brand-text-muted dark:text-night-muted')}>
                          {cell.day}
                        </Text>
                        {endingMedications.length > 0 || runouts.length > 0 ? (
                          <View className="flex-row items-center gap-px">
                            {runouts.length > 0 ? (
                              <MaterialCommunityIcons
                                name={RUNOUT_ICON}
                                size={12}
                                color={runoutColor(runouts)}
                                accessibilityLabel="Medication runs out"
                              />
                            ) : null}
                            {endingMedications.length > 0 ? (
                              <Ionicons name="flag" size={11} color={ENDS_FLAG_COLOR} accessibilityLabel="Medication ends" />
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                      {hasMarkerCounts ? (
                        <View className="flex-row flex-wrap gap-x-1">
                          {stats!.taken > 0 ? (
                            <Text className={cn('text-[10px] font-semibold', COUNT_TEXT.taken)}>{stats!.taken}T</Text>
                          ) : null}
                          {stats!.skipped > 0 ? (
                            <Text className={cn('text-[10px] font-semibold', COUNT_TEXT.skipped)}>{stats!.skipped}S</Text>
                          ) : null}
                          {stats!.missed > 0 ? (
                            <Text className={cn('text-[10px] font-semibold', COUNT_TEXT.missed)}>{stats!.missed}M</Text>
                          ) : null}
                          {lateCount > 0 ? (
                            <Text className={cn('text-[10px] font-semibold', COUNT_TEXT.late)}>{lateCount}L</Text>
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
        <View className="-mt-2 flex-row items-center justify-center gap-1.5">
          <Text className={cn('text-xs font-bold', COUNT_TEXT.late)}>L</Text>
          <Text muted className="text-xs">Late = taken after grace period</Text>
        </View>
        <View className="-mt-2 items-center gap-0.5">
          <View className="flex-row items-center gap-1.5">
            <MaterialCommunityIcons name={RUNOUT_ICON} size={14} color={RUNOUT_URGENT_COLOR} />
            <Text muted className="text-xs">Refill needed (projected run-out)</Text>
          </View>
          <Text muted className="text-center text-[10px]">Run-out dates are estimates.</Text>
        </View>
      </Card>

      {selectedDate ? (
        <Sheet handle onClose={() => setSelectedDate(null)}>
          <View className="mb-3 flex-row items-center justify-between gap-2">
            <Text className="flex-1 text-lg font-bold text-brand-navy dark:text-white">
              {selectedDay ? `${selectedDay.dayName}, ${formatDate(selectedDate)}` : formatDate(selectedDate)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              className="h-11 w-11 items-center justify-center"
              hitSlop={4}
              onPress={() => setSelectedDate(null)}>
              <Ionicons name="close" size={24} color={theme.accent} />
            </Pressable>
          </View>
          {/* Sheet caps at 85% of the screen; leave room for the handle, header, padding and bottom inset. */}
          <ScrollView style={{ maxHeight: Math.max(160, windowHeight * 0.85 - 120 - insets.bottom) }}>
            <DayDetailContent
              day={selectedDay}
              runouts={selectedDate >= today ? (runoutByDate[selectedDate] ?? []) : []}
              onLogAsNeeded={(medicationId, date) => {
                setSelectedDate(null);
                router.push(`/medications/${medicationId}?action=logDose&date=${date}`);
              }}
            />
          </ScrollView>
        </Sheet>
      ) : null}
    </Screen>
  );
}

// Amber callout for regimens ending today (DESIGN.md 10.4).
const ENDING_BOX = 'rounded-control border border-amber-400 bg-amber-50 dark:border-amber-500 dark:bg-amber-950';
const ENDING_TEXT = 'text-amber-700 dark:text-amber-300';

function formatQty(n: number): string {
  return Number(n.toFixed(3)).toString();
}

// "Runs out" lands on its projected day; "Out of stock" / "Low supply" are
// filed under today by getRunoutByDate and carry the estimated run-out date.
function RunoutCallout({ runouts }: { runouts: RunoutEntry[] }) {
  if (runouts.length === 0) return null;
  return (
    <View className="mb-2 gap-1">
      {runouts.map((r) => {
        const color = r.daysLeft <= RUNOUT_URGENT_DAYS ? RUNOUT_URGENT_COLOR : RUNOUT_SOON_COLOR;
        const label = r.status === 'out' ? 'Out of stock' : r.status === 'low' ? 'Low supply' : 'Runs out';
        return (
          <View key={r.medicationId} className="flex-row items-start gap-1.5">
            <View className="pt-0.5">
              <MaterialCommunityIcons name={RUNOUT_ICON} size={14} color={color} />
            </View>
            <Text className="flex-1 text-sm">
              <Text className="text-sm font-bold" style={{ color }}>
                {label}:
              </Text>{' '}
              {r.dose ? `${r.name} ${r.dose}` : r.name}{' '}
              <Text muted className="text-xs">
                ({formatQty(r.quantity)} {r.unit} left today
                {r.status === 'low' ? ` · est. run-out ${formatDate(r.runoutDate)}` : ''})
              </Text>
            </Text>
          </View>
        );
      })}
      <Text muted className="text-xs">{RUNOUT_ESTIMATE_NOTE}</Text>
    </View>
  );
}

function DayDetailContent({
  day,
  runouts,
  onLogAsNeeded,
}: {
  day: CalendarDayDetail | null;
  runouts: RunoutEntry[];
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
        <RunoutCallout runouts={runouts} />
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
      <RunoutCallout runouts={runouts} />
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

function MonthSummaryRow({ summary }: { summary: CalendarMonthSummary }) {
  const items = [
    { label: 'Adherence', value: summary.adherencePct === null ? '—' : `${summary.adherencePct}%`, className: '' },
    { label: 'Missed', value: String(summary.missed), className: COUNT_TEXT.missed },
    { label: 'Late', value: String(summary.late), className: COUNT_TEXT.late },
    { label: 'Skipped', value: String(summary.skipped), className: COUNT_TEXT.skipped },
  ];
  return (
    <View className="-mt-1 flex-row gap-1 rounded-control bg-brand-bg px-2 py-1.5 dark:bg-night-selected">
      {items.map((item) => (
        <View key={item.label} className="min-w-0 flex-1 items-center">
          <Text className={cn('text-sm font-bold leading-tight', item.className)}>{item.value}</Text>
          <Text muted numberOfLines={1} className="text-[10px]">
            {item.label}
          </Text>
        </View>
      ))}
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
