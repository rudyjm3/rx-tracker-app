import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';

import { cn } from '@/lib/cn';

import { Text } from './text';

// Label + input + error, DESIGN.md 6.3. Border turns brand-blue on focus.
//
// `size="auth"` is the larger sign-in / sign-up input: 1.5 px border, leading
// icon, 15 px text, a 4 px brand-blue/10 halo on focus and (for passwords) a
// trailing show/hide toggle.
type FieldProps = TextInputProps & {
  label: string;
  error?: string;
  className?: string;
  size?: 'default' | 'auth';
  /** Leading icon (auth size). */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Class for the label text. */
  labelClassName?: string;
};

export function Field({ label, error, className, size = 'default', icon, labelClassName, secureTextEntry, onFocus, onBlur, ...props }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);

  if (size !== 'auth') {
    return (
      <View className="gap-1">
        <Text className={cn('text-sm', labelClassName)}>{label}</Text>
        <TextInput
          placeholderTextColor="#60708A"
          secureTextEntry={secureTextEntry}
          onFocus={onFocus}
          onBlur={onBlur}
          className={cn(
            'min-h-[44px] rounded-control border border-brand-border bg-white px-3 py-2 text-sm text-brand-text focus:border-brand-blue dark:border-night-border dark:bg-night-card dark:text-white',
            className,
          )}
          {...props}
        />
        {error ? <Text className="text-xs text-status-danger">{error}</Text> : null}
      </View>
    );
  }

  const isPassword = !!secureTextEntry;
  return (
    <View className="gap-1.5">
      <Text className={cn('text-[13.9px] font-bold', labelClassName)}>{label}</Text>
      <View className={cn('-mx-[3px] rounded-[13px] p-[3px]', focused ? 'bg-brand-blue/10' : 'bg-transparent')}>
        <View
          className={cn(
            'min-h-12 flex-row items-center rounded-control border-[1.5px] bg-white dark:bg-night-bg',
            focused ? 'border-brand-blue' : 'border-brand-border dark:border-night-border',
          )}>
          {icon ? (
            <View className="absolute left-4">
              <Ionicons name={icon} size={16} color="#60708A" />
            </View>
          ) : null}
          <TextInput
            placeholderTextColor="#7D8CA5"
            secureTextEntry={isPassword && !reveal}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            className={cn('min-h-12 flex-1 py-3 text-[15.2px] text-brand-text dark:text-white', icon ? 'pl-11' : 'pl-4', isPassword ? 'pr-11' : 'pr-4', className)}
            {...props}
          />
          {isPassword ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={reveal ? 'Hide password' : 'Show password'}
              hitSlop={8}
              onPress={() => setReveal((v) => !v)}
              className="absolute right-3 h-8 w-8 items-center justify-center">
              <Ionicons name={reveal ? 'eye-off-outline' : 'eye-outline'} size={18} color="#60708A" />
            </Pressable>
          ) : null}
        </View>
      </View>
      {error ? <Text className="text-xs text-status-danger">{error}</Text> : null}
    </View>
  );
}
