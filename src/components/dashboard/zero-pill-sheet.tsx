import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { adjustQuantity } from '@/lib/inventory';
import type { DaySlot } from '@/lib/schedule';

// Zero-pill dialog (DESIGN.md 9.3): shown when Take is tapped for a
// medication whose tracked inventory is already at zero. Offers a quick
// count correction ("Update & take"), a jump to Log refill, "Not now" (take
// anyway) and "Cancel dose".
export function ZeroPillSheet({
  slot,
  onClose,
  onTakeAnyway,
  onCancelDose,
}: {
  slot: DaySlot;
  onClose: () => void;
  /** "Not now" and "Update & take": proceed with recording the dose. */
  onTakeAnyway: () => void;
  onCancelDose: () => void;
}) {
  const { medication } = slot;
  const [count, setCount] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpdate() {
    setError(null);
    setUpdating(true);
    try {
      await adjustQuantity(medication.id, count, '');
      onTakeAnyway();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update quantity");
      setUpdating(false);
    }
  }

  return (
    <Sheet onClose={onClose} dismissible={!updating}>
      <Text accessibilityRole="header" className="text-lg font-bold text-brand-navy dark:text-white">
        Out of {medication.inventory_unit}
      </Text>
      <Text muted className="mt-0.5 text-sm">
        {medication.name}
        {medication.dose ? ` ${medication.dose}` : ''} shows 0 {medication.inventory_unit} on hand.
      </Text>

      {error ? (
        <Callout kind="danger" className="mt-3">
          {error}
        </Callout>
      ) : null}

      <View className="mt-4 gap-1">
        <Text className="text-sm font-medium">Correct the count, if it&apos;s wrong</Text>
        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Decrease"
            className="h-11 w-11 items-center justify-center rounded-control border border-brand-border active:bg-brand-bg dark:border-night-border"
            onPress={() => setCount((c) => Math.max(0, c - 1))}>
            <Ionicons name="remove" size={18} color="#102B57" />
          </Pressable>
          <Text className="min-w-8 text-center text-lg font-semibold">{count}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Increase"
            className="h-11 w-11 items-center justify-center rounded-control border border-brand-border active:bg-brand-bg dark:border-night-border"
            onPress={() => setCount((c) => c + 1)}>
            <Ionicons name="add" size={18} color="#102B57" />
          </Pressable>
          <Text muted className="flex-1 text-sm">
            {medication.inventory_unit}
          </Text>
          <Button
            label={updating ? 'Updating…' : 'Update & take'}
            size="compact"
            loading={updating}
            disabled={count <= 0}
            onPress={handleUpdate}
          />
        </View>
      </View>

      <Pressable
        accessibilityRole="link"
        className="mt-2 min-h-11 justify-center self-start"
        onPress={() => {
          onCancelDose();
          router.push(`/medications/${medication.id}?action=refill`);
        }}>
        <Text className="text-sm font-medium text-brand-deep-blue dark:text-brand-cyan">Log refill instead</Text>
      </Pressable>

      <View className="mt-3 flex-row items-center justify-between">
        <Pressable accessibilityRole="button" className="min-h-11 justify-center" disabled={updating} onPress={onTakeAnyway}>
          <Text muted className="text-sm">
            Not now
          </Text>
        </Pressable>
        <Button label="Cancel dose" variant="danger" disabled={updating} onPress={onCancelDose} />
      </View>
    </Sheet>
  );
}
