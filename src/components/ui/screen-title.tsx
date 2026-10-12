import { cn } from '@/lib/cn';

import { Text } from './text';

// Page title (24 px bold navy) and section / card title (18 px bold navy),
// DESIGN.md 3.1.
export function ScreenTitle({ children, className }: { children: string; className?: string }) {
  return (
    <Text accessibilityRole="header" className={cn('text-2xl font-bold text-brand-navy dark:text-white', className)}>
      {children}
    </Text>
  );
}

export function SectionTitle({ children, className }: { children: string; className?: string }) {
  return (
    <Text accessibilityRole="header" className={cn('text-lg font-bold text-brand-navy dark:text-white', className)}>
      {children}
    </Text>
  );
}

// Panel title (16 px bold navy): Settings and Profile panels, "Quick actions".
export function PanelTitle({ children, className }: { children: string; className?: string }) {
  return (
    <Text accessibilityRole="header" className={cn('text-base font-bold text-brand-navy dark:text-white', className)}>
      {children}
    </Text>
  );
}
