import { Pressable, View } from 'react-native';

import { cn } from '@/lib/cn';

import { Text } from './text';

// 1–10 level picker, DESIGN.md 6.3: 5 columns x 2 rows, each a full-round
// pill with a 2 px border in the tier color. Unselected = `brand-bg` + muted
// text; selected = solid tier color + white text. Tier colors (2.4): pain is
// green -> red, mood is the inverse scale.
export type LevelMetric = 'pain' | 'mood';

const PAIN = ['#2A9D49', '#D97706', '#E05B30', '#C9213C'];
const MOOD = ['#C9213C', '#D97706', '#8BB04A', '#2A9D49'];

export function levelTierColor(metric: LevelMetric, level: number): string {
  const tiers = metric === 'pain' ? PAIN : MOOD;
  if (level <= 3) return tiers[0];
  if (level <= 6) return tiers[1];
  if (level <= 8) return tiers[2];
  return tiers[3];
}

export function LevelGrid({
  value,
  onChange,
  metric,
  disabled,
  className,
}: {
  value: number | null;
  onChange: (level: number) => void;
  metric: LevelMetric;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <View className={cn('gap-1.5', className)} accessibilityRole="radiogroup">
      {[0, 1].map((row) => (
        <View key={row} className="flex-row gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => {
            const level = row * 5 + n;
            const selected = value === level;
            const color = levelTierColor(metric, level);
            return (
              <Pressable
                key={level}
                accessibilityRole="radio"
                accessibilityLabel={`${level} of 10`}
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                onPress={() => onChange(level)}
                className={cn(
                  'min-h-11 flex-1 items-center justify-center rounded-full border-2',
                  selected ? '' : 'bg-brand-bg dark:bg-night-selected',
                  disabled && 'opacity-50',
                )}
                style={{ borderColor: color, backgroundColor: selected ? color : undefined }}>
                <Text className={cn('text-sm font-bold', selected ? 'text-white dark:text-white' : 'text-brand-text-muted dark:text-night-muted')}>
                  {level}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
