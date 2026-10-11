import { Text, TextInput, View, type TextInputProps } from 'react-native';

import { cn } from '@/lib/cn';

// Label + input + error, DESIGN.md 6.3. Border turns brand-blue on focus.
export function Field({
  label,
  error,
  className,
  ...props
}: TextInputProps & { label: string; error?: string; className?: string }) {
  return (
    <View className="gap-1">
      <Text className="text-sm text-brand-text dark:text-white">{label}</Text>
      <TextInput
        placeholderTextColor="#60708A"
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
