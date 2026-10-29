import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Callout } from './callout';
import { Sheet } from './sheet';
import { Text } from './text';

// Bottom-sheet form shell (DESIGN.md 9 / 17.3): 18 px bold navy title, optional
// 14 px muted subtitle, an inline error, a scrolling body (gap 16) and a
// right-aligned footer row for the buttons (Cancel ghost, then the primary).
export function FormSheet({
  title,
  subtitle,
  onClose,
  dismissible,
  error,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  dismissible?: boolean;
  error?: string | null;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Sheet onClose={onClose} dismissible={dismissible}>
      <ScrollView keyboardShouldPersistTaps="handled" className="max-h-[520px] shrink">
        <Text accessibilityRole="header" className="text-lg font-bold text-brand-navy dark:text-white">
          {title}
        </Text>
        {subtitle ? (
          <Text muted className="mt-0.5 text-sm">
            {subtitle}
          </Text>
        ) : null}
        {error ? (
          <Callout kind="danger" className="mt-3">
            {error}
          </Callout>
        ) : null}
        <View className="mt-4 gap-4">{children}</View>
        {footer ? <View className="mt-5 flex-row gap-2">{footer}</View> : null}
      </ScrollView>
    </Sheet>
  );
}
