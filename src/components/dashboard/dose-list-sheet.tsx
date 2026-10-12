import { ScrollView, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible } from '@/components/ui/collapsible';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import type { DaySlot } from '@/lib/schedule';
import { formatClockTime, to12h } from '@/lib/utils';

// Required / non-required dose lists (DESIGN.md 9.4): one accordion per
// medication, 12-hour time on the left and a status badge on the right.
function statusBadge(slot: DaySlot) {
  if (slot.status === 'pending') {
    if (slot.postponedUntil && new Date(slot.postponedUntil).getTime() > Date.now()) {
      return <Badge variant="snoozed">{`Snoozed until ${formatClockTime(slot.postponedUntil)}`}</Badge>;
    }
    return <Badge variant="pending" />;
  }
  return <Badge variant={slot.status} />;
}

export function DoseListSheet({
  title,
  emptyText,
  slots,
  onClose,
}: {
  title: string;
  emptyText: string;
  slots: DaySlot[];
  onClose: () => void;
}) {
  const byMedication = new Map<string, DaySlot[]>();
  for (const slot of slots) {
    const list = byMedication.get(slot.medicationId) ?? [];
    list.push(slot);
    byMedication.set(slot.medicationId, list);
  }

  return (
    <Sheet onClose={onClose}>
      <Text accessibilityRole="header" className="mb-3 text-lg font-bold text-brand-navy dark:text-white">
        {title}
      </Text>
      <ScrollView className="max-h-[420px]">
        {byMedication.size === 0 ? (
          <Text muted className="text-sm">
            {emptyText}
          </Text>
        ) : (
          <View className="gap-2">
            {[...byMedication.entries()].map(([medicationId, medSlots]) => (
              <OpenSection key={medicationId} slots={medSlots} />
            ))}
          </View>
        )}
      </ScrollView>
      <Button label="Close" variant="ghost" className="mt-3" onPress={onClose} />
    </Sheet>
  );
}

// Each medication's section starts open, like the web's <details open>.
function OpenSection({ slots }: { slots: DaySlot[] }) {
  return (
    <Collapsible title={`${slots[0].medicationName}${slots[0].dose ? ` ${slots[0].dose}` : ''}`} defaultOpen>
      <View className="gap-2">
        {slots.map((slot) => (
          <View key={`${slot.medicationId}|${slot.scheduledTime}`} className="flex-row items-center justify-between gap-2">
            <Text muted className="text-sm">
              {to12h(slot.scheduledTime)}
            </Text>
            {statusBadge(slot)}
          </View>
        ))}
      </View>
    </Collapsible>
  );
}
