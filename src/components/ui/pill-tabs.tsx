import { Pressable, ScrollView, View } from 'react-native';

import { cn } from '@/lib/cn';

import { GradientFill } from './gradient-fill';
import { Text } from './text';

// Segmented tabs / range pills (DESIGN.md 6.3). Active = brand gradient with
// white text; inactive = white + border (page tabs) or `brand-bg` + muted
// (range pills).
export function PillTab({
  label,
  active,
  onPress,
  variant = 'page',
  disabled,
  className,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  variant?: 'page' | 'range';
  disabled?: boolean;
  className?: string;
}) {
  const range = variant === 'range';
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      hitSlop={range ? 6 : 0}
      onPress={onPress}
      className={cn(
        'min-h-9 items-center justify-center overflow-hidden rounded-control',
        range ? 'px-3 py-1.5' : 'min-h-11 px-4 py-2',
        !active && !range && 'border border-brand-border bg-white active:bg-brand-bg dark:border-night-border dark:bg-night-card',
        !active && range && 'bg-brand-bg dark:bg-night-selected',
        disabled && 'opacity-50',
        className,
      )}>
      {active ? <GradientFill name="brand" /> : null}
      <Text
        className={cn(
          'text-sm font-medium',
          active ? 'text-white dark:text-white' : range ? 'text-brand-text-muted dark:text-night-muted' : 'text-brand-text',
        )}>
        {label}
      </Text>
    </Pressable>
  );
}

export function PillTabs<T extends string>({
  tabs,
  value,
  onChange,
  variant = 'page',
  scroll,
  className,
}: {
  tabs: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  variant?: 'page' | 'range';
  /** Horizontal scroll instead of wrapping (long selectors). */
  scroll?: boolean;
  className?: string;
}) {
  const items = tabs.map((t) => (
    <PillTab key={t.value} label={t.label} variant={variant} active={t.value === value} onPress={() => onChange(t.value)} />
  ));
  if (scroll) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName={cn('gap-2', className)} accessibilityRole="tablist">
        {items}
      </ScrollView>
    );
  }
  return (
    <View accessibilityRole="tablist" className={cn('flex-row flex-wrap gap-2', className)}>
      {items}
    </View>
  );
}
