import { Text, View } from 'react-native';

import { cn } from '@/lib/cn';

// Status badge, DESIGN.md 6.4 / 12. Soft tint: status color at 10% alpha.
export type BadgeVariant = 'taken' | 'late' | 'missed' | 'skipped' | 'pending' | 'snoozed';

const BG: Record<BadgeVariant, string> = {
  taken: 'bg-status-success/10',
  late: 'bg-status-warning/10',
  pending: 'bg-status-warning/10',
  skipped: 'bg-status-warning/10',
  snoozed: 'bg-brand-blue/10',
  missed: 'bg-status-danger/10',
};
const FG: Record<BadgeVariant, string> = {
  taken: 'text-status-success',
  late: 'text-status-warning',
  pending: 'text-status-warning',
  skipped: 'text-status-warning',
  snoozed: 'text-brand-blue',
  missed: 'text-status-danger',
};
const LABEL: Record<BadgeVariant, string> = {
  taken: 'Taken',
  late: 'Late',
  pending: 'Pending',
  snoozed: 'Snoozed',
  missed: 'Missed',
  skipped: 'Skipped',
};

export function Badge({ variant, children, className }: { variant: BadgeVariant; children?: string; className?: string }) {
  return (
    <View className={cn('self-start rounded-full px-2 py-0.5', BG[variant], className)}>
      <Text className={cn('text-xs font-medium', FG[variant])}>{children ?? LABEL[variant]}</Text>
    </View>
  );
}
