import Ionicons from '@expo/vector-icons/Ionicons';
import { PropsWithChildren, useState } from 'react';
import { Pressable, View } from 'react-native';

import { cn } from '@/lib/cn';

import { Text } from './text';

// Accordion item (DESIGN.md 6.6): radius 10, border, padding 12, 14 px
// semibold navy summary with a chevron; the open state uses `brand-bg`.
// Uncontrolled by default; pass `open` + `onToggle` to control it (e.g. so
// only one FAQ is open at a time).
export function Collapsible({
  children,
  title,
  open,
  onToggle,
}: PropsWithChildren & { title: string; open?: boolean; onToggle?: () => void }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;

  return (
    <View
      className={cn(
        'rounded-control border border-brand-border p-3 dark:border-night-border',
        isOpen && 'bg-brand-bg dark:bg-night-selected',
      )}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        className="min-h-9 flex-row items-center justify-between gap-2"
        onPress={onToggle ?? (() => setInternalOpen((v) => !v))}>
        <Text className="flex-1 text-sm font-semibold text-brand-navy dark:text-white">{title}</Text>
        <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#60708A" />
      </Pressable>
      {isOpen ? <View className="mt-2">{children}</View> : null}
    </View>
  );
}
