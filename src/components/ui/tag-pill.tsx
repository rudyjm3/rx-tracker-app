import { Pressable } from 'react-native';

import { cn } from '@/lib/cn';

import { GradientFill } from './gradient-fill';
import { Text } from './text';

// Selectable tag pill (mood / side-effect tags), DESIGN.md 6.3: unselected
// white + border, selected brand gradient + white. `dashed` is the "+ Tags"
// affordance.
export function TagPill({
  label,
  selected,
  onPress,
  dashed,
  disabled,
  className,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  dashed?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      className={cn(
        'min-h-8 justify-center overflow-hidden rounded-full border px-3 py-1',
        selected
          ? 'border-transparent'
          : dashed
            ? 'border-dashed border-brand-border bg-white dark:border-night-border dark:bg-night-card'
            : 'border-brand-border bg-white dark:border-night-border dark:bg-night-card',
        disabled && 'opacity-50',
        className,
      )}>
      {selected ? <GradientFill name="brand" /> : null}
      <Text className={cn('text-xs font-medium', selected && 'text-white dark:text-white', dashed && !selected && 'text-brand-deep-blue dark:text-brand-cyan')}>
        {label}
      </Text>
    </Pressable>
  );
}
