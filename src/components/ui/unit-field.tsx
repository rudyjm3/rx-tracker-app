import { View } from 'react-native';

import { Input } from './field';
import { PillTabs } from './pill-tabs';
import { Text } from './text';

// Number input with a two-way unit toggle (height in/cm, weight lb/kg),
// DESIGN.md 8.12 / 9 forms.
export function UnitField<U extends string>({
  label,
  value,
  onChangeText,
  placeholder,
  units,
  unit,
  onUnitChange,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  units: readonly [U, U];
  unit: U;
  onUnitChange: (u: U) => void;
}) {
  return (
    <View className="gap-1">
      <Text className="text-sm">{label}</Text>
      <View className="flex-row items-center gap-2">
        <Input className="w-0 flex-1" value={value} onChangeText={onChangeText} keyboardType="numeric" placeholder={placeholder} />
        <PillTabs variant="range" className="flex-nowrap" tabs={units.map((u) => ({ value: u, label: u }))} value={unit} onChange={onUnitChange} />
      </View>
    </View>
  );
}
