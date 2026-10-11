import { View, type ViewProps } from 'react-native';

import { cn } from '@/lib/cn';

// DESIGN.md 6.2: white, 1px brand-border, radius 18, shadow-card, padding 16.
// `flat` drops the shadow (Settings / Profile panels).
export function Card({ className, flat, ...props }: ViewProps & { className?: string; flat?: boolean }) {
  return (
    <View
      className={cn('rounded-card border border-brand-border bg-brand-card p-4', !flat && 'shadow-card', className)}
      {...props}
    />
  );
}
