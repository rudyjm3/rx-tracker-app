import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Switch as RNSwitch, View } from 'react-native';

import { cn } from '@/lib/cn';

import { Text } from './text';

// 20 px checkbox, radius 4, deep-blue fill with a white check (DESIGN.md 6.3).
export function Checkbox({ checked, className }: { checked: boolean; className?: string }) {
  return (
    <View
      className={cn(
        'h-5 w-5 items-center justify-center rounded border',
        checked
          ? 'border-brand-deep-blue bg-brand-deep-blue'
          : 'border-brand-border bg-white dark:border-night-border dark:bg-night-card',
        className,
      )}>
      {checked ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
    </View>
  );
}

// Row with a checkbox, a title and an optional 12 px muted description.
export function CheckboxRow({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      className={cn('min-h-11 flex-row items-center gap-3 py-1', disabled && 'opacity-50', className)}>
      <Checkbox checked={checked} />
      <View className="flex-1">
        <Text className="text-sm font-medium">{label}</Text>
        {description ? (
          <Text muted className="text-xs">
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// Switch row: title + description on the left, brand-blue switch on the right.
export function SwitchRow({
  value,
  onValueChange,
  label,
  description,
  disabled,
  className,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <View className={cn('min-h-11 flex-row items-center justify-between gap-3 py-1', className)}>
      <View className="flex-1">
        <Text className="text-sm font-medium">{label}</Text>
        {description ? (
          <Text muted className="text-xs">
            {description}
          </Text>
        ) : null}
      </View>
      <RNSwitch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: '#D7E6F8', true: '#0A8AC8' }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}
