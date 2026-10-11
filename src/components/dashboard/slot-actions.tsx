import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import type { DaySlot } from '@/lib/schedule';

// Skip / Snooze / Take for one pending slot (DESIGN.md 8.4). `onDark` swaps
// to the on-gradient button variants used inside the Next dose hero.
export function SlotActions({
  slot,
  actingKey,
  onAction,
  onSnooze,
  onDark,
}: {
  slot: DaySlot;
  actingKey: string | null;
  onAction: (slot: DaySlot, status: 'taken' | 'skipped') => void;
  onSnooze: (slot: DaySlot) => void;
  onDark?: boolean;
}) {
  const busy = actingKey === `${slot.medicationId}|${slot.scheduledTime}`;
  return (
    <View className="flex-row gap-2">
      <Button label="Skip" variant="secondary" size="compact" onDark={onDark} onPress={() => onAction(slot, 'skipped')} loading={busy} />
      <Button label="Snooze" variant="secondary" size="compact" onDark={onDark} onPress={() => onSnooze(slot)} loading={busy} />
      <Button label="Take" size="compact" onDark={onDark} onPress={() => onAction(slot, 'taken')} loading={busy} />
    </View>
  );
}
