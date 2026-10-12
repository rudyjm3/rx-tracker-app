import { Pressable, View } from 'react-native';

import { cn } from '@/lib/cn';

// Avatar color picker: circular swatches from the palette (DESIGN.md 6.3).
export function ColorSwatches({ colors, value, onChange }: { colors: readonly string[]; value: string; onChange: (c: string) => void }) {
  return (
    <View className="flex-row flex-wrap gap-3">
      {colors.map((color) => (
        <Pressable
          key={color}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === color }}
          accessibilityLabel={`Use color ${color}`}
          hitSlop={6}
          onPress={() => onChange(color)}
          className={cn('h-8 w-8 rounded-full border-2', value === color ? 'border-brand-navy dark:border-white' : 'border-transparent')}
          style={{ backgroundColor: color }}
        />
      ))}
    </View>
  );
}
