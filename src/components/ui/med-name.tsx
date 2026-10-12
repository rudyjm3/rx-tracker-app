import { cn } from '@/lib/cn';

import { Text } from './text';

// Medication name followed by its dose at 0.875em, bold, muted (DESIGN.md 3.1).
// The parent decides size/weight through `className`; the dose shrinks with it.
export function MedName({
  name,
  dose,
  className,
  doseClassName,
  onDark,
  numberOfLines,
}: {
  name: string;
  dose?: string | null;
  className?: string;
  doseClassName?: string;
  onDark?: boolean;
  numberOfLines?: number;
}) {
  return (
    <Text numberOfLines={numberOfLines} className={cn('text-base font-semibold text-brand-navy dark:text-white', className)}>
      {name}
      {dose ? (
        <Text
          className={cn(
            'text-sm font-bold text-[#6B7280] dark:text-night-muted',
            onDark && 'text-white/75 dark:text-white/75',
            doseClassName,
          )}>
          {` ${dose}`}
        </Text>
      ) : null}
    </Text>
  );
}
