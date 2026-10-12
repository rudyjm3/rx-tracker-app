import { Pressable, View } from 'react-native';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/field';
import { MedName } from '@/components/ui/med-name';
import type { Medication } from '@/lib/types/medications';

// Group member checklist row with a per-member quantity override that shows
// once the medication is selected (DESIGN.md 9.21). Shared by the new and
// edit group screens.
export function GroupMemberRow({
  medication,
  selectedValue,
  onToggle,
  onChangeQuantity,
}: {
  medication: Medication;
  selectedValue: string | undefined;
  onToggle: () => void;
  onChangeQuantity: (value: string) => void;
}) {
  const isSelected = selectedValue !== undefined;
  return (
    <View className="flex-row items-center gap-2">
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSelected }}
        className="min-h-11 flex-1 flex-row items-center gap-3"
        onPress={onToggle}
        hitSlop={4}>
        <Checkbox checked={isSelected} />
        <MedName className="flex-1 text-sm font-medium" name={medication.name} dose={medication.dose} />
      </Pressable>
      {isSelected ? (
        <Input
          className="w-28 py-1"
          accessibilityLabel={`Quantity override for ${medication.name}`}
          value={selectedValue}
          onChangeText={onChangeQuantity}
          keyboardType="numeric"
          placeholder="Qty override"
        />
      ) : null}
    </View>
  );
}
