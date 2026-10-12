import { Pressable, ScrollView } from 'react-native';

import { cn } from '@/lib/cn';

import { PanelTitle } from './screen-title';
import { Sheet } from './sheet';
import { Text } from './text';

// Kebab / row-action menu as a bottom sheet (DESIGN.md 17.3): 48 px rows,
// red destructive row, Cancel at the bottom.
export interface ActionSheetItem {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

export function ActionSheet({ title, items, onClose }: { title?: string; items: ActionSheetItem[]; onClose: () => void }) {
  return (
    <Sheet onClose={onClose}>
      {title ? <PanelTitle className="mb-2">{title}</PanelTitle> : null}
      <ScrollView bounces={false}>
        {items.map((item) => (
          <Pressable
            key={item.label}
            accessibilityRole="button"
            className="min-h-12 justify-center rounded-control border-b border-brand-border px-1 active:bg-brand-bg dark:border-night-border dark:active:bg-night-selected"
            onPress={item.onPress}>
            <Text className={cn('text-base', item.destructive && 'text-status-danger dark:text-status-danger')}>{item.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable accessibilityRole="button" className="mt-2 min-h-12 items-center justify-center" onPress={onClose}>
        <Text className="text-base font-semibold text-brand-deep-blue dark:text-brand-cyan">Cancel</Text>
      </Pressable>
    </Sheet>
  );
}
