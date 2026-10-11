import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';

import { cn } from '@/lib/cn';

// Variants and sizes mirror rx-tracker-web components/ui/Button.tsx (DESIGN.md 6.1).
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'default' | 'compact';

const BASE = 'flex-row items-center justify-center gap-2 rounded-control';
const VARIANT: Record<Variant, string> = {
  primary: 'overflow-hidden shadow-card active:opacity-90',
  secondary: 'border border-brand-border bg-white active:bg-brand-bg',
  ghost: 'active:bg-brand-bg',
  danger: 'bg-status-danger shadow-card active:opacity-90',
};
const TEXT: Record<Variant, string> = {
  primary: 'text-white',
  secondary: 'text-brand-navy',
  ghost: 'text-brand-deep-blue',
  danger: 'text-white',
};
const PADDING: Record<Size, string> = {
  default: 'min-h-[44px] px-4 py-2.5',
  compact: 'min-h-[32px] px-2 py-1',
};
const TEXT_SIZE: Record<Size, string> = { default: 'text-sm', compact: 'text-xs' };

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  className?: string;
}

export function Button({
  label,
  variant = 'primary',
  size = 'default',
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
      className={cn(BASE, VARIANT[variant], PADDING[size], isDisabled && 'opacity-50', className)}
      {...props}>
      {variant === 'primary' && (
        <LinearGradient
          colors={['#14CFE0', '#0A8AC8', '#0754A8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />
      )}
      {loading && <ActivityIndicator size="small" color={variant === 'secondary' || variant === 'ghost' ? '#102B57' : '#fff'} />}
      <Text className={cn('font-semibold', TEXT[variant], TEXT_SIZE[size])}>{label}</Text>
    </Pressable>
  );
}
