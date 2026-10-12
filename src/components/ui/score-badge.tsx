import { View } from 'react-native';

import { levelColor, type WellbeingMetric } from '@/lib/pain-mood';
import type { MoodChartScheme } from '@/lib/app-settings';

import { Text } from './text';

// Outlined score pill in the tier color, e.g. "Pain 7/10" (DESIGN.md 2.4 / 8.9).
export function ScoreBadge({
  type,
  level,
  scheme,
}: {
  type: WellbeingMetric;
  level: number;
  scheme?: MoodChartScheme;
}) {
  const color = levelColor(type, level, scheme);
  return (
    <View className="self-start rounded-full border px-2 py-0.5" style={{ borderColor: color }}>
      <Text className="text-xs font-semibold" style={{ color }}>
        {type === 'pain' ? 'Pain' : 'Mood'} {level}/10
      </Text>
    </View>
  );
}
