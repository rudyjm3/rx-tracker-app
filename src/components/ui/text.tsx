import { Text as RNText, type TextProps } from 'react-native';

import { cn } from '@/lib/cn';

// Plain RN Text with the brand text color (and dark-mode equivalent) as the
// default; pass `muted` for secondary text. Size/weight come from className.
// Unlike ThemedText this applies color via classes, so className overrides it.
export function Text({ className, muted, ...props }: TextProps & { className?: string; muted?: boolean }) {
  return (
    <RNText
      className={cn(
        'text-brand-text dark:text-white',
        muted && 'text-brand-text-muted dark:text-night-muted',
        className,
      )}
      {...props}
    />
  );
}
