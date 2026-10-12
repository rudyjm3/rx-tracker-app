import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

import { cn } from '@/lib/cn';

import { Text } from './text';

// Inline alerts and callouts, DESIGN.md 10.4. Tinted background with a 30–40%
// tinted border; `error` is the auth alert (red-50 / red-200).
type Kind = 'error' | 'success' | 'warning' | 'danger' | 'info';

const BOX: Record<Kind, string> = {
  error: 'rounded-control border-red-200 bg-red-50 dark:border-status-danger/40 dark:bg-status-danger/10',
  success: 'rounded-card border-status-success/40 bg-status-success/10',
  warning: 'rounded-card border-status-warning/40 bg-status-warning/10',
  danger: 'rounded-card border-status-danger/30 bg-status-danger/10',
  info: 'rounded-card border-brand-blue/30 bg-brand-blue/10',
};
const TEXT: Record<Kind, string> = {
  error: 'font-semibold text-status-danger',
  success: 'text-brand-text dark:text-white',
  warning: 'text-brand-text dark:text-white',
  danger: 'text-status-danger',
  info: 'text-brand-text dark:text-white',
};
const ICON: Record<Kind, { name: React.ComponentProps<typeof Ionicons>['name']; color: string } | null> = {
  error: null,
  success: { name: 'checkmark-circle', color: '#18BFA6' },
  warning: { name: 'alert-circle', color: '#F5A524' },
  danger: { name: 'alert-circle', color: '#E5484D' },
  info: { name: 'information-circle', color: '#0A8AC8' },
};

export function Callout({
  kind = 'warning',
  icon,
  children,
  className,
  textClassName,
  ...props
}: ViewProps & {
  kind?: Kind;
  /** Override the default leading icon; pass `false` for none. */
  icon?: React.ComponentProps<typeof Ionicons>['name'] | false;
  children: ReactNode;
  className?: string;
  textClassName?: string;
}) {
  const def = ICON[kind];
  const iconName = icon === false ? null : (icon ?? def?.name ?? null);
  return (
    <View
      accessibilityRole={kind === 'error' ? 'alert' : undefined}
      className={cn('flex-row items-start gap-2 border px-4 py-3', BOX[kind], className)}
      {...props}>
      {iconName ? <Ionicons name={iconName} size={20} color={def?.color ?? '#F5A524'} /> : null}
      <View className="flex-1">
        {typeof children === 'string' ? (
          <Text className={cn('text-sm', TEXT[kind], textClassName)}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}
