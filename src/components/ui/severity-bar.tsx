import { View } from 'react-native';

import { cn } from '@/lib/cn';

// Four-segment allergy severity meter: green → yellow → orange → red. Segments
// up to `level` (0-4) are colored, the rest stay muted.
const SEGMENT_COLORS = ['#3DB35F', '#F2B705', '#F0701A', '#E5484D'];

export function SeverityBar({ level, className }: { level: number; className?: string }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={cn('flex-row gap-1', className)}>
      {SEGMENT_COLORS.map((color, i) => (
        <View
          key={color}
          className={cn('h-1.5 w-8 rounded-full', i >= level && 'bg-brand-border dark:bg-night-border')}
          style={i < level ? { backgroundColor: color } : undefined}
        />
      ))}
    </View>
  );
}
