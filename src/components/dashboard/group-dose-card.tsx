import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MedName } from '@/components/ui/med-name';
import { MedTypeBadge } from '@/components/ui/med-type-badge';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import type { DaySlot, NextDoseGroupEvent } from '@/lib/schedule';
import { formatEpochTime } from '@/lib/utils';

import { badgeVariantFor } from './schedule-status';
import { SlotStatusBadge } from './slot-status-badge';

// Aggregate badge once every member has a final status: missed > skipped >
// late > taken (DESIGN.md 12), same precedence as the calendar cells.
function summaryVariant(members: DaySlot[], date: string, graceMinutes: number): BadgeVariant {
  const variants = members.map((m) => badgeVariantFor(m, date, graceMinutes));
  if (variants.includes('missed')) return 'missed';
  if (variants.includes('skipped')) return 'skipped';
  if (variants.includes('late')) return 'late';
  return 'taken';
}

// Group dose card (DESIGN.md 8.4 "GroupDoseCard"): header with time, Layers +
// group name and a count chip; Take All / Snooze / Skip for every pending
// member; a "Show medications" toggle revealing the member rows, with
// "Manage Individually" for per-member Take / Snooze / Skip.
export function GroupDoseCard({
  event,
  date,
  graceMinutes,
  actingKey,
  takeAllCount,
  onTakeAll,
  onSnoozeAll,
  onSkipAll,
  onTake,
  onSkip,
  onSnooze,
}: {
  event: NextDoseGroupEvent;
  date: string;
  graceMinutes: number;
  actingKey: string | null;
  /** How many members a Take All would record (pending + missed non-PRN). */
  takeAllCount: number;
  onTakeAll: (event: NextDoseGroupEvent) => void;
  onSnoozeAll: (event: NextDoseGroupEvent) => void;
  onSkipAll: (event: NextDoseGroupEvent) => void;
  onTake: (slot: DaySlot) => void;
  onSkip: (slot: DaySlot) => void;
  onSnooze: (slot: DaySlot) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [manageEach, setManageEach] = useState(false);
  const { members } = event;
  const allResolved = !members.some((m) => m.status === 'pending');
  const disabled = actingKey !== null;

  return (
    <View className="rounded-card border border-brand-border bg-brand-card p-3 dark:border-night-border dark:bg-night-card">
      <View className="gap-2">
        <View className="gap-1">
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="time-outline" size={12} color="#60708A" />
            <Text muted className="text-xs">
              {formatEpochTime(event.time)}
            </Text>
          </View>
          <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
            <View className="flex-row items-center gap-1.5">
              <Ionicons name="layers-outline" size={14} color="#0754A8" />
              <Text className="text-sm font-medium">{event.groupName}</Text>
            </View>
            <View className="flex-row items-center gap-1 rounded-full bg-brand-bg px-2 py-0.5 dark:bg-night-selected">
              <Ionicons name="people-outline" size={11} color="#60708A" />
              <Text muted className="text-xs">
                {members.length} {members.length === 1 ? 'medication' : 'medications'}
              </Text>
            </View>
          </View>
        </View>

        {allResolved ? (
          <View className="flex-row items-center gap-2">
            <Badge variant={summaryVariant(members, date, graceMinutes)} />
            {takeAllCount > 0 ? (
              <Button label="Take All" size="compact" disabled={disabled} onPress={() => onTakeAll(event)} />
            ) : null}
          </View>
        ) : (
          <View className="flex-row gap-2">
            <Button label="Take All" size="compact" loading={disabled} onPress={() => onTakeAll(event)} />
            <Button label="Snooze" variant="ghost" size="compact" disabled={disabled} onPress={() => onSnoozeAll(event)} />
            <Button label="Skip" variant="secondary" size="compact" disabled={disabled} onPress={() => onSkipAll(event)} />
          </View>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        className="mt-1 min-h-11 flex-row items-center justify-center gap-1"
        onPress={() => setExpanded((e) => !e)}>
        <Text muted className="text-xs font-medium">
          {expanded ? 'Hide' : 'Show'} medications
        </Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color="#60708A" />
      </Pressable>

      {expanded ? (
        <View className="gap-2 border-t border-brand-border pt-3 dark:border-night-border">
          {!allResolved ? (
            <Pressable accessibilityRole="button" className="min-h-9 justify-center self-start" onPress={() => setManageEach((m) => !m)}>
              <Text className="text-xs font-medium text-brand-deep-blue dark:text-brand-cyan">
                {manageEach ? 'Done managing individually' : 'Manage Individually'}
              </Text>
            </Pressable>
          ) : null}

          {members.map((m) => {
            const key = `${m.medicationId}|${m.scheduledTime}`;
            const busy = actingKey === key;
            return (
              <View key={key} className="gap-2 rounded-control bg-brand-bg/60 px-2.5 py-2 dark:bg-night-selected">
                <View className="gap-1">
                  <MedName className="text-sm font-medium" name={m.medicationName} dose={m.dose} />
                  <View className="flex-row flex-wrap items-center gap-1.5">
                    <MedTypeBadge type={m.medication.medication_type} />
                    {m.isPrn ? (
                      <Text muted className="text-xs">
                        (PRN)
                      </Text>
                    ) : null}
                  </View>
                </View>
                {m.status === 'pending' && manageEach ? (
                  <View className={cn('flex-row gap-2')}>
                    <Button label="Take" size="compact" loading={busy} onPress={() => onTake(m)} />
                    <Button label="Snooze" variant="ghost" size="compact" disabled={busy} onPress={() => onSnooze(m)} />
                    <Button label="Skip" variant="secondary" size="compact" disabled={busy} onPress={() => onSkip(m)} />
                  </View>
                ) : m.status === 'pending' && badgeVariantFor(m, date, graceMinutes) !== 'snoozed' ? (
                  <Badge variant="pending" />
                ) : (
                  <SlotStatusBadge slot={m} date={date} graceMinutes={graceMinutes} />
                )}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
