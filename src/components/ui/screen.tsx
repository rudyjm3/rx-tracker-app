import type { ReactNode } from 'react';
import { ScrollView, View, type RefreshControlProps } from 'react-native';
import type { Edge } from 'react-native-safe-area-context';

import { cn } from '@/lib/cn';

import { SafeArea } from './safe-area';

// Page frame for a screen (DESIGN.md 7.4): page background, 16 px gutter,
// 24 px gap between sections. Tab screens leave the top inset to the global
// header, so the default edges are left/right only; stack screens that draw
// their own header pass `edges={['top','left','right']}`.
export function Screen({
  children,
  scroll = true,
  refreshControl,
  edges = ['left', 'right'],
  className,
  contentClassName,
  keyboardShouldPersistTaps,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  edges?: Edge[];
  /** Classes for the outer frame. */
  className?: string;
  /** Classes for the scroll content (or the plain wrapper when `scroll` is false). */
  contentClassName?: string;
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
}) {
  return (
    <View className={cn('flex-1 bg-brand-bg dark:bg-night-bg', className)}>
      <SafeArea className="flex-1" edges={edges}>
        {scroll ? (
          <ScrollView
            refreshControl={refreshControl}
            keyboardShouldPersistTaps={keyboardShouldPersistTaps}
            contentContainerClassName={cn('gap-4 px-4 pb-10 pt-2', contentClassName)}>
            {children}
          </ScrollView>
        ) : (
          <View className={cn('flex-1 gap-4 px-4 pt-2', contentClassName)}>{children}</View>
        )}
      </SafeArea>
    </View>
  );
}
