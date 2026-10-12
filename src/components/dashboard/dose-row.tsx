import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { MedName } from '@/components/ui/med-name';
import { MedTypeBadge } from '@/components/ui/med-type-badge';
import { Text } from '@/components/ui/text';
import type { DaySlot } from '@/lib/schedule';
import { to12h } from '@/lib/utils';

import { badgeVariantFor } from './schedule-status';
import { SlotStatusBadge } from './slot-status-badge';

// One schedule row (DESIGN.md 8.4 "DoseRow"): clock + time, name -> dose ->
// type badge, optional group chip; status badge, or Take / Snooze / Skip (in
// that order) while pending. A missed dose shows its badge plus Take.
export function DoseRow({
  slot,
  date,
  graceMinutes,
  actingKey,
  onTake,
  onSkip,
  onSnooze,
}: {
  slot: DaySlot;
  date: string;
  graceMinutes: number;
  actingKey: string | null;
  onTake: (slot: DaySlot) => void;
  onSkip: (slot: DaySlot) => void;
  onSnooze: (slot: DaySlot) => void;
}) {
  const variant = badgeVariantFor(slot, date, graceMinutes);
  const busy = actingKey === `${slot.medicationId}|${slot.scheduledTime}`;

  return (
    <View className="gap-2 rounded-card border border-brand-border bg-brand-card p-3 dark:border-night-border dark:bg-night-card">
      <View className="gap-1">
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="time-outline" size={12} color="#60708A" />
          <Text muted className="text-xs">
            {to12h(slot.scheduledTime)}
          </Text>
          {slot.isPrn ? (
            <Text muted className="text-xs">
              (PRN)
            </Text>
          ) : null}
        </View>
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
          <MedName className="text-sm font-medium" name={slot.medicationName} dose={slot.dose} />
          <MedTypeBadge type={slot.medication.medication_type} />
        </View>
        {slot.groupName ? (
          <View className="flex-row items-center gap-1 self-start rounded-full bg-brand-bg px-2 py-0.5 dark:bg-night-selected">
            <Ionicons name="layers-outline" size={11} color="#60708A" />
            <Text muted className="text-xs">
              {slot.groupName}
            </Text>
          </View>
        ) : null}
      </View>

      {variant === 'missed' ? (
        <View className="flex-row items-center gap-2">
          <SlotStatusBadge slot={slot} date={date} graceMinutes={graceMinutes} />
          <Button label="Take" size="compact" loading={busy} onPress={() => onTake(slot)} />
        </View>
      ) : variant ? (
        <SlotStatusBadge slot={slot} date={date} graceMinutes={graceMinutes} />
      ) : (
        <View className="flex-row gap-2">
          <Button label="Take" size="compact" loading={busy} onPress={() => onTake(slot)} />
          <Button label="Snooze" variant="ghost" size="compact" disabled={busy} onPress={() => onSnooze(slot)} />
          <Button label="Skip" variant="secondary" size="compact" disabled={busy} onPress={() => onSkip(slot)} />
        </View>
      )}
    </View>
  );
}
