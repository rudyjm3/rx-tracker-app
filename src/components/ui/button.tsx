import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';

import { cn } from '@/lib/cn';

// Variants and sizes mirror rx-tracker-web components/ui/Button.tsx (DESIGN.md 6.1).
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'default' | 'compact';

const BASE = 'flex-row items-center justify-center gap-2 rounded-control';
const VARIANT: Record<Variant, string> = {
  primary: 'overflow-hidden shadow-card active:opacity-90',
  secondary: 'border border-brand-border bg-white active:bg-brand-bg dark:border-night-border dark:bg-night-card dark:active:bg-night-selected',
  ghost: 'active:bg-brand-bg',
  danger: 'bg-status-danger shadow-card active:opacity-90',
};
const TEXT: Record<Variant, string> = {
  primary: 'text-white',
  secondary: 'text-brand-navy dark:text-white',
  ghost: 'text-brand-deep-blue dark:text-brand-cyan',
  danger: 'text-white',
};
const PADDING: Record<Size, string> = {
  default: 'min-h-[44px] px-4 py-2.5',
  compact: 'min-h-[32px] px-2 py-1',
};
const TEXT_SIZE: Record<Size, string> = { default: 'text-sm', compact: 'text-xs' };

// Variants for gradient / navy surfaces (dashboard hero, alarm): DESIGN.md 6.1.
const ON_DARK: Record<Variant, string> = {
  primary: 'bg-white shadow-none active:opacity-90',
  secondary: 'border border-white/30 bg-white/10 active:bg-white/20',
  ghost: 'active:bg-white/10',
  danger: 'bg-status-danger shadow-none active:opacity-90',
};
const ON_DARK_TEXT: Record<Variant, string> = {
  primary: 'text-brand-deep-blue',
  secondary: 'text-white',
  ghost: 'text-white',
  danger: 'text-white',
};

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  onDark?: boolean;
  /** Extra classes for the label (e.g. a custom text color). */
  labelClassName?: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  className?: string;
}

export function Button({
  label,
  variant = 'primary',
  size = 'default',
  onDark,
  labelClassName,
  loading,
  disabled,
  className,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      hitSlop={size === 'compact' ? 6 : 0}
      className={cn(BASE, onDark ? ON_DARK[variant] : VARIANT[variant], PADDING[size], isDisabled && 'opacity-50', className)}
      {...props}>
      {variant === 'primary' && !onDark && (
        <LinearGradient
          colors={['#14CFE0', '#0A8AC8', '#0754A8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />
      )}
      {loading && <ActivityIndicator size="small" color={onDark ? (variant === 'primary' ? '#0754A8' : '#fff') : variant === 'secondary' || variant === 'ghost' ? '#102B57' : '#fff'} />}
      <Text className={cn('font-semibold', onDark ? ON_DARK_TEXT[variant] : TEXT[variant], TEXT_SIZE[size], labelClassName)}>{label}</Text>
    </Pressable>
  );
}
